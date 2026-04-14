const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const cloudinary = require('cloudinary').v2;
const QRCode = require('qrcode');

// Init Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Init Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Middleware d'authentification admin
const adminAuth = (req, res, next) => {
  const pwd = req.headers['x-admin-password'];
  if (!pwd || pwd !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Accès non autorisé' });
  }
  next();
};

// Génère un slug à partir d'un nom
function generateSlug(nom) {
  const base = nom
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprime accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);
  const rand = Math.random().toString(36).substring(2, 6);
  return `${base}-${rand}`;
}

// Génère l'URL publique d'un album
function getAlbumPublicUrl(slug) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5500';
  return `${frontendUrl}/?album=${slug}`;
}

// Charge récursivement les enfants d'un album + stats
async function loadAlbumWithChildren(albumId) {
  const { data: album, error: albumError } = await supabase
    .from('albums')
    .select('*')
    .eq('id', albumId)
    .single();

  if (albumError || !album) return null;

  // Compter images et visites
  const [{ count: nb_images }, { count: nb_visites }] = await Promise.all([
    supabase.from('images').select('*', { count: 'exact', head: true }).eq('album_id', albumId),
    supabase.from('visites').select('*', { count: 'exact', head: true }).eq('album_id', albumId)
  ]);

  // Charger enfants récursivement
  const { data: childrenData } = await supabase
    .from('albums')
    .select('*')
    .eq('parent_album_id', albumId)
    .order('ordre', { ascending: true })
    .order('created_at', { ascending: false });

  const children = childrenData ? await Promise.all(
    childrenData.map(child => loadAlbumWithChildren(child.id))
  ) : [];

  return {
    ...album,
    nb_images: nb_images || 0,
    nb_visites: nb_visites || 0,
    qr_code_url: getAlbumPublicUrl(album.slug),
    children: children.filter(c => c !== null)
  };
}

// ─── GET /api/albums/:slug — Public ───────────────────────────────────────────
router.get('/:slug', async (req, res) => {
  const { slug } = req.params;

  // Si ça ressemble à un UUID, chercher par id (pour le panel admin)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let albumQuery;

  if (uuidRegex.test(slug)) {
    albumQuery = supabase.from('albums').select('*').eq('id', slug).single();
  } else {
    albumQuery = supabase.from('albums').select('*').eq('slug', slug).single();
  }

  const { data: album, error: albumError } = await albumQuery;

  if (albumError || !album) {
    return res.status(404).json({ error: 'Album non trouvé' });
  }

  const { data: images, error: imagesError } = await supabase
    .from('images')
    .select('*')
    .eq('album_id', album.id)
    .order('created_at', { ascending: false });

  if (imagesError) {
    return res.status(500).json({ error: 'Erreur lors de la récupération des images' });
  }

  // Charger enfants (optionnel pour frontend public)
  const { data: childrenData } = await supabase
    .from('albums')
    .select('id, nom, slug, description, date_evenement')
    .eq('parent_album_id', album.id)
    .order('ordre', { ascending: true })
    .order('created_at', { ascending: false });

  res.json({ 
    album, 
    images: images || [],
    children: childrenData || []
  });
});

// ─── GET /api/albums — Admin (hiérarchie complète) ────────────────────────────
router.get('/', adminAuth, async (req, res) => {
  const { data: rootAlbums, error } = await supabase
    .from('albums')
    .select('*')
    .is('parent_album_id', null)  // Charger uniquement albums root
    .order('ordre', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: 'Erreur lors de la récupération des albums' });
  }

  // Pour chaque album root, charger récursivement les enfants
  const albumsWithHierarchy = await Promise.all(
    (rootAlbums || []).map(album => loadAlbumWithChildren(album.id))
  );

  res.json(albumsWithHierarchy.filter(a => a !== null));
});

// ─── POST /api/albums — Admin (créer album root ou sous-album) ──────────────────
router.post('/', adminAuth, async (req, res) => {
  const { nom, description, date_evenement, parent_album_id } = req.body;

  if (!nom || nom.trim().length < 2) {
    return res.status(400).json({ error: 'Le nom de l\'album est requis (min 2 caractères)' });
  }

  // Vérifier que parent existe si fourni
  if (parent_album_id) {
    const { data: parentAlbum, error: parentError } = await supabase
      .from('albums')
      .select('id')
      .eq('id', parent_album_id)
      .single();

    if (parentError || !parentAlbum) {
      return res.status(404).json({ error: 'Album parent non trouvé' });
    }
  }

  const slug = generateSlug(nom.trim());
  const publicUrl = getAlbumPublicUrl(slug);

  const { data: album, error } = await supabase
    .from('albums')
    .insert({
      nom: nom.trim(),
      description: description ? description.trim() : null,
      slug,
      date_evenement: date_evenement || null,
      parent_album_id: parent_album_id || null,
      ordre: 0
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Un album avec ce nom existe déjà' });
    }
    return res.status(500).json({ error: 'Erreur lors de la création de l\'album' });
  }

  // Générer le QR code en base64
  let qr_code_base64 = null;
  try {
    qr_code_base64 = await QRCode.toDataURL(publicUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#C04800', light: '#FFFFFF' }  // Couleur bauxite
    });
  } catch (qrError) {
    console.error('Erreur génération QR code:', qrError);
  }

  res.status(201).json({ 
    album: {
      ...album,
      nb_images: 0,
      nb_visites: 0,
      qr_code_url: publicUrl,
      children: []
    },
    qr_code_base64, 
    url: publicUrl 
  });
});

// ─── POST /api/albums/:id/child — Admin (créer sous-album) ─────────────────────
router.post('/:id/child', adminAuth, async (req, res) => {
  const { id } = req.params;
  const { nom } = req.body;

  if (!nom || nom.trim().length < 2) {
    return res.status(400).json({ error: 'Le nom du sous-album est requis (min 2 caractères)' });
  }

  // Vérifier que le parent existe
  const { data: parentAlbum, error: parentError } = await supabase
    .from('albums')
    .select('id')
    .eq('id', id)
    .single();

  if (parentError || !parentAlbum) {
    return res.status(404).json({ error: 'Album parent non trouvé' });
  }

  const slug = generateSlug(nom.trim());
  const publicUrl = getAlbumPublicUrl(slug);

  const { data: album, error } = await supabase
    .from('albums')
    .insert({
      nom: nom.trim(),
      slug,
      parent_album_id: id,
      ordre: 0
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Un album avec ce nom existe déjà' });
    }
    return res.status(500).json({ error: 'Erreur lors de la création du sous-album' });
  }

  // Générer le QR code
  let qr_code_base64 = null;
  try {
    qr_code_base64 = await QRCode.toDataURL(publicUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#C04800', light: '#FFFFFF' }
    });
  } catch (qrError) {
    console.error('Erreur génération QR code:', qrError);
  }

  res.status(201).json({ 
    album: {
      ...album,
      nb_images: 0,
      nb_visites: 0,
      qr_code_url: publicUrl,
      children: []
    },
    qr_code_base64, 
    url: publicUrl 
  });
});

// ─── PUT /api/albums/:id — Admin (renommer / éditer) ──────────────────────────
router.put('/:id', adminAuth, async (req, res) => {
  const { id } = req.params;
  const { nom, description, date_evenement, parent_album_id } = req.body;

  // Vérifier que l'album existe
  const { data: currentAlbum, error: currentError } = await supabase
    .from('albums')
    .select('*')
    .eq('id', id)
    .single();

  if (currentError || !currentAlbum) {
    return res.status(404).json({ error: 'Album non trouvé' });
  }

  // Validation : parent_album_id fourni (déplacer album)
  if (parent_album_id !== undefined && parent_album_id !== currentAlbum.parent_album_id) {
    // Vérifier que le parent existe
    if (parent_album_id) {
      const { data: parentAlbum, error: parentError } = await supabase
        .from('albums')
        .select('id')
        .eq('id', parent_album_id)
        .single();

      if (parentError || !parentAlbum) {
        return res.status(404).json({ error: 'Album parent non trouvé' });
      }

      // Vérifier cycle (pas de parent_album_id = self)
      if (parent_album_id === id) {
        return res.status(400).json({ error: 'Un album ne peut pas être fils de lui-même' });
      }
    }
  }

  // Mettre à jour
  const updateData = {
    ...(nom && { nom: nom.trim() }),
    ...(description !== undefined && { description: description ? description.trim() : null }),
    ...(date_evenement !== undefined && { date_evenement: date_evenement || null }),
    ...(parent_album_id !== undefined && { parent_album_id: parent_album_id || null })
  };

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ error: 'Aucune modification à effectuer' });
  }

  const { data: album, error } = await supabase
    .from('albums')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: 'Erreur lors de la mise à jour de l\'album' });
  }

  // Charger l'album complet avec enfants
  const updatedAlbum = await loadAlbumWithChildren(id);

  res.json(updatedAlbum);
});

// ─── DELETE /api/albums/:id — Admin (supprimer album + enfants récursivement) ──
router.delete('/:id', adminAuth, async (req, res) => {
  const { id } = req.params;

  // Fonction récursive pour supprimer un album et tous ses enfants
  async function deleteAlbumRecursive(albumId) {
    // Charger tous les enfants
    const { data: children } = await supabase
      .from('albums')
      .select('id')
      .eq('parent_album_id', albumId);

    // Supprimer enfants d'abord (cascade)
    if (children && children.length > 0) {
      for (const child of children) {
        await deleteAlbumRecursive(child.id);
      }
    }

    // Récupérer toutes les images de l'album
    const { data: images } = await supabase
      .from('images')
      .select('cloudinary_public_id')
      .eq('album_id', albumId);

    // Supprimer les images sur Cloudinary
    if (images && images.length > 0) {
      const publicIds = images.map(img => img.cloudinary_public_id);
      try {
        await cloudinary.api.delete_resources(publicIds);
      } catch (cloudErr) {
        console.error('Erreur suppression Cloudinary:', cloudErr);
        // On continue même si Cloudinary échoue
      }
    }

    // Supprimer l'album (CASCADE supprime images et met visites à NULL)
    await supabase
      .from('albums')
      .delete()
      .eq('id', albumId);
  }

  try {
    await deleteAlbumRecursive(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur suppression album:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression de l\'album' });
  }
});

// ─── GET /api/albums/:id/qrcode — Admin ──────────────────────────────────────
router.get('/:id/qrcode', adminAuth, async (req, res) => {
  const { id } = req.params;

  const { data: album, error } = await supabase
    .from('albums')
    .select('slug, nom')
    .eq('id', id)
    .single();

  if (error || !album) {
    return res.status(404).json({ error: 'Album non trouvé' });
  }

  const url = getAlbumPublicUrl(album.slug);

  try {
    const qr_code_base64 = await QRCode.toDataURL(url, {
      width: 300,
      margin: 2,
      color: { dark: '#C04800', light: '#FFFFFF' }  // Couleur bauxite
    });
    res.json({ qr_code_base64, url });
  } catch (qrError) {
    console.error('Erreur génération QR code:', qrError);
    res.status(500).json({ error: 'Erreur lors de la génération du QR code' });
  }
});

module.exports = router;
