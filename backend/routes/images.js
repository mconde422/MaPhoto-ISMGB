const express = require('express');
const router = express.Router();
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const cloudinary = require('cloudinary').v2;
const archiver = require('archiver');
const fetch = require('node-fetch');

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

// Middleware auth admin
const adminAuth = (req, res, next) => {
  const pwd = req.headers['x-admin-password'];
  if (!pwd || pwd !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Accès non autorisé' });
  }
  next();
};

// Configuration Multer — stockage en mémoire
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB max par image
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format non supporté. Utilisez JPEG, PNG, WEBP ou GIF'));
    }
  }
});

// Upload un buffer sur Cloudinary (Promise)
function uploadToCloudinary(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
    stream.end(buffer);
  });
}

// ─── POST /api/images/upload — Admin ─────────────────────────────────────────
router.post('/upload', adminAuth, upload.array('images', 20), async (req, res) => {
  const { album_id, titre } = req.body;

  if (!album_id) {
    return res.status(400).json({ error: 'album_id est requis' });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Aucun fichier reçu' });
  }

  // Vérifier que l'album existe
  const { data: album, error: albumError } = await supabase
    .from('albums')
    .select('id')
    .eq('id', album_id)
    .single();

  if (albumError || !album) {
    return res.status(404).json({ error: 'Album non trouvé' });
  }

  const uploaded = [];
  const errors = [];

  // Traiter chaque fichier
  for (const file of req.files) {
    try {
      // Upload sur Cloudinary
      const cloudResult = await uploadToCloudinary(file.buffer, {
        folder: `sap-nmc/${album_id}`,
        resource_type: 'image',
        quality: 'auto',
        fetch_format: 'auto'
      });

      // Sauvegarder en base Supabase
      const imageTitre = titre
        ? titre.trim()
        : file.originalname.replace(/\.[^.]+$/, ''); // Nom sans extension

      const { data: image, error: insertError } = await supabase
        .from('images')
        .insert({
          album_id,
          titre: imageTitre,
          cloudinary_url: cloudResult.secure_url,
          cloudinary_public_id: cloudResult.public_id,
          taille_kb: Math.round(file.size / 1024)
        })
        .select()
        .single();

      if (insertError) {
        // Si Supabase échoue, supprimer l'image de Cloudinary
        await cloudinary.uploader.destroy(cloudResult.public_id).catch(() => {});
        errors.push({ file: file.originalname, error: 'Erreur base de données' });
      } else {
        uploaded.push(image);
      }
    } catch (err) {
      console.error(`Erreur upload ${file.originalname}:`, err.message);
      errors.push({ file: file.originalname, error: err.message });
    }
  }

  res.status(errors.length > 0 && uploaded.length === 0 ? 500 : 200).json({
    uploaded,
    errors
  });
});

// ─── DELETE /api/images/:id — Admin ──────────────────────────────────────────
router.delete('/:id', adminAuth, async (req, res) => {
  const { id } = req.params;

  // Récupérer l'image depuis Supabase
  const { data: image, error } = await supabase
    .from('images')
    .select('cloudinary_public_id')
    .eq('id', id)
    .single();

  if (error || !image) {
    return res.status(404).json({ error: 'Image non trouvée' });
  }

  // Supprimer sur Cloudinary
  try {
    await cloudinary.uploader.destroy(image.cloudinary_public_id);
  } catch (cloudErr) {
    console.error('Erreur suppression Cloudinary:', cloudErr);
    // On continue même si Cloudinary échoue
  }

  // Supprimer en base
  const { error: deleteError } = await supabase
    .from('images')
    .delete()
    .eq('id', id);

  if (deleteError) {
    return res.status(500).json({ error: 'Erreur lors de la suppression en base' });
  }

  res.json({ success: true });
});

// ─── GET /api/images/:id/download — Public ───────────────────────────────────
router.get('/:id/download', async (req, res) => {
  const { id } = req.params;

  const { data: image, error } = await supabase
    .from('images')
    .select('cloudinary_url, titre')
    .eq('id', id)
    .single();

  if (error || !image) {
    return res.status(404).json({ error: 'Image non trouvée' });
  }

  try {
    const response = await fetch(image.cloudinary_url);
    if (!response.ok) {
      throw new Error('Impossible de récupérer l\'image depuis Cloudinary');
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.split('/')[1]?.split(';')[0] || 'jpg';
    const filename = `${(image.titre || 'photo').replace(/[^a-z0-9_-]/gi, '_')}.${ext}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.body.pipe(res);
  } catch (fetchError) {
    console.error('Erreur téléchargement image:', fetchError);
    res.status(500).json({ error: 'Erreur lors du téléchargement' });
  }
});

// ─── POST /api/images/download-zip — Public ──────────────────────────────────
router.post('/download-zip', async (req, res) => {
  const { image_ids } = req.body;

  if (!Array.isArray(image_ids) || image_ids.length === 0) {
    return res.status(400).json({ error: 'image_ids doit être un tableau non vide' });
  }

  if (image_ids.length > 100) {
    return res.status(400).json({ error: 'Maximum 100 images par ZIP' });
  }

  // Récupérer les images depuis Supabase
  const { data: images, error } = await supabase
    .from('images')
    .select('id, cloudinary_url, titre')
    .in('id', image_ids);

  if (error || !images || images.length === 0) {
    return res.status(404).json({ error: 'Aucune image trouvée' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="photos-ismgb.zip"');

  const archive = archiver('zip', { zlib: { level: 5 } });

  archive.on('error', (err) => {
    console.error('Erreur archiver:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erreur lors de la création du ZIP' });
    }
  });

  archive.pipe(res);

  // Ajouter chaque image au ZIP
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    try {
      const response = await fetch(img.cloudinary_url);
      if (!response.ok) continue;

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const ext = contentType.split('/')[1]?.split(';')[0] || 'jpg';
      const safeName = (img.titre || `photo-${i + 1}`).replace(/[^a-z0-9_\-]/gi, '_');
      const filename = `${String(i + 1).padStart(3, '0')}_${safeName}.${ext}`;

      archive.append(response.body, { name: filename });
    } catch (fetchErr) {
      console.error(`Erreur fetch image ${img.id}:`, fetchErr.message);
    }
  }

  await archive.finalize();
});

module.exports = router;
