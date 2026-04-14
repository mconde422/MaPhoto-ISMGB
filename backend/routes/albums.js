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

// ─── GET /api/albums/:slug — Public ───────────────────────────────────────────
router.get('/:slug', async (req, res) => {
  // Distinguer slug (string) vs UUID (id)
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

  res.json({ album, images: images || [] });
});

// ─── GET /api/albums — Admin ──────────────────────────────────────────────────
router.get('/', adminAuth, async (req, res) => {
  const { data: albums, error } = await supabase
    .from('albums')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: 'Erreur lors de la récupération des albums' });
  }

  // Pour chaque album, compter les images et visites
  const albumsWithStats = await Promise.all(
    (albums || []).map(async (album) => {
      const [{ count: nb_images }, { count: nb_visites }] = await Promise.all([
        supabase.from('images').select('*', { count: 'exact', head: true }).eq('album_id', album.id),
        supabase.from('visites').select('*', { count: 'exact', head: true }).eq('album_id', album.id)
      ]);

      const qr_code_url = getAlbumPublicUrl(album.slug);

      return {
        ...album,
        nb_images: nb_images || 0,
        nb_visites: nb_visites || 0,
        qr_code_url
      };
    })
  );

  res.json(albumsWithStats);
});

// ─── POST /api/albums — Admin ─────────────────────────────────────────────────
router.post('/', adminAuth, async (req, res) => {
  const { nom, description, date_evenement } = req.body;

  if (!nom || nom.trim().length < 2) {
    return res.status(400).json({ error: 'Le nom de l\'album est requis (min 2 caractères)' });
  }

  const slug = generateSlug(nom.trim());
  const publicUrl = getAlbumPublicUrl(slug);

  const { data: album, error } = await supabase
    .from('albums')
    .insert({
      nom: nom.trim(),
      description: description ? description.trim() : null,
      slug,
      date_evenement: date_evenement || null
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
      color: { dark: '#1B4D3E', light: '#FFFFFF' }
    });
  } catch (qrError) {
    console.error('Erreur génération QR code:', qrError);
  }

  res.status(201).json({ album, qr_code_base64, url: publicUrl });
});

// ─── DELETE /api/albums/:id — Admin ──────────────────────────────────────────
router.delete('/:id', adminAuth, async (req, res) => {
  const { id } = req.params;

  // Récupérer toutes les images de l'album
  const { data: images, error: imagesError } = await supabase
    .from('images')
    .select('cloudinary_public_id')
    .eq('album_id', id);

  if (imagesError) {
    return res.status(500).json({ error: 'Erreur lors de la récupération des images' });
  }

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
  const { error: deleteError } = await supabase
    .from('albums')
    .delete()
    .eq('id', id);

  if (deleteError) {
    return res.status(500).json({ error: 'Erreur lors de la suppression de l\'album' });
  }

  res.json({ success: true });
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
      color: { dark: '#1B4D3E', light: '#FFFFFF' }
    });
    res.json({ qr_code_base64, url });
  } catch (qrError) {
    console.error('Erreur génération QR code:', qrError);
    res.status(500).json({ error: 'Erreur lors de la génération du QR code' });
  }
});

module.exports = router;
