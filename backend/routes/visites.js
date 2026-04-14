const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Init Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Middleware auth admin
const adminAuth = (req, res, next) => {
  const pwd = req.headers['x-admin-password'];
  if (!pwd || pwd !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Accès non autorisé' });
  }
  next();
};

// ─── POST /api/visites — Public ───────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { prenom, nom, album_id } = req.body;

  // Validation
  if (!prenom || prenom.trim().length < 2) {
    return res.status(400).json({ error: 'Le prénom est requis (min 2 caractères)' });
  }
  if (!nom || nom.trim().length < 2) {
    return res.status(400).json({ error: 'Le nom est requis (min 2 caractères)' });
  }

  const userAgent = req.headers['user-agent'] || null;

  const { data: visite, error } = await supabase
    .from('visites')
    .insert({
      prenom: prenom.trim(),
      nom: nom.trim(),
      album_id: album_id || null,
      user_agent: userAgent
    })
    .select('id')
    .single();

  if (error) {
    console.error('Erreur insertion visite:', error);
    return res.status(500).json({ error: 'Erreur lors de l\'enregistrement de la visite' });
  }

  res.status(201).json({ success: true, visite_id: visite.id });
});

// ─── GET /api/visites/stats/:album_id — Admin ─────────────────────────────────
router.get('/stats/:album_id', adminAuth, async (req, res) => {
  const { album_id } = req.params;

  const { data: visites, error, count } = await supabase
    .from('visites')
    .select('prenom, nom, date_heure', { count: 'exact' })
    .eq('album_id', album_id)
    .order('date_heure', { ascending: false });

  if (error) {
    return res.status(500).json({ error: 'Erreur lors de la récupération des statistiques' });
  }

  res.json({
    total: count || 0,
    visiteurs: visites || []
  });
});

module.exports = router;
