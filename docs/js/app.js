/* ═══════════════════════════════════════════════════════
   MaPhoto-ISMGB — Portail Public (app.js)
   ⚠️ Remplacer API_URL par l'URL Railway après déploiement
═══════════════════════════════════════════════════════ */

const API_URL = 'https://your-railway-app.up.railway.app'; // ← À remplacer

// État global
let currentAlbum = null;
let currentImages = [];
let lightboxImageId = null;

// ─── INIT ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  init();
});

async function init() {
  const slug = getAlbumSlug();

  if (!slug) {
    showScreen('screen-no-album');
    return;
  }

  // Charger l'album pour afficher son nom dès l'identification
  try {
    const data = await fetchAlbum(slug);
    currentAlbum = data.album;
    currentImages = data.images;

    // Mettre à jour le nom dans l'écran d'identification
    const el = document.getElementById('identify-album-name');
    if (el) el.textContent = currentAlbum.nom;
  } catch {
    showScreen('screen-no-album');
    return;
  }

  const user = checkUser();
  if (user) {
    showGallery();
  } else {
    showScreen('screen-identify');
    setupIdentifyForm(slug);
  }
}

// ─── URL / SLUG ────────────────────────────────────────
function getAlbumSlug() {
  const params = new URLSearchParams(window.location.search);
  return params.get('album') || '';
}

// ─── USER (localStorage) ───────────────────────────────
function checkUser() {
  try {
    const raw = localStorage.getItem('sap_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveUserLocally(prenom, nom) {
  localStorage.setItem('sap_user', JSON.stringify({ prenom, nom }));
}

// ─── IDENTIFICATION FORM ───────────────────────────────
function setupIdentifyForm(slug) {
  const form = document.getElementById('form-identify');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const prenomEl = document.getElementById('input-prenom');
    const nomEl    = document.getElementById('input-nom');
    const btn      = document.getElementById('btn-identify');

    clearErrors();

    const prenom = prenomEl.value.trim();
    const nom    = nomEl.value.trim();
    let valid = true;

    if (prenom.length < 2) {
      showFieldError('error-prenom', 'Prénom requis (min 2 caractères)');
      prenomEl.classList.add('invalid');
      valid = false;
    }
    if (nom.length < 2) {
      showFieldError('error-nom', 'Nom requis (min 2 caractères)');
      nomEl.classList.add('invalid');
      valid = false;
    }
    if (!valid) return;

    btn.disabled = true;
    btn.textContent = 'Enregistrement…';

    try {
      await fetch(`${API_URL}/api/visites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prenom, nom, album_id: currentAlbum?.id })
      });
    } catch {
      // On continue même si l'enregistrement échoue
    }

    saveUserLocally(prenom, nom);
    showGallery();
  });

  // Retirer la classe invalid sur input
  ['input-prenom', 'input-nom'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      document.getElementById(id).classList.remove('invalid');
    });
  });
}

function clearErrors() {
  document.getElementById('error-prenom').textContent = '';
  document.getElementById('error-nom').textContent = '';
  document.getElementById('input-prenom').classList.remove('invalid');
  document.getElementById('input-nom').classList.remove('invalid');
}

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

// ─── FETCH ALBUM ───────────────────────────────────────
async function fetchAlbum(slug) {
  const res = await fetch(`${API_URL}/api/albums/${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error('Album non trouvé');
  return res.json();
}

// ─── AFFICHER GALERIE ──────────────────────────────────
function showGallery() {
  showScreen('screen-gallery');

  const nameEl = document.getElementById('gallery-album-name');
  const descEl = document.getElementById('gallery-album-desc');
  const countEl = document.getElementById('gallery-count');

  if (nameEl) nameEl.textContent = currentAlbum.nom;
  if (descEl) descEl.textContent = currentAlbum.description || '';
  if (countEl) countEl.textContent =
    currentImages.length > 0
      ? `${currentImages.length} photo${currentImages.length > 1 ? 's' : ''}`
      : '';

  renderGallery(currentImages);
}

// ─── RENDER GALLERY ────────────────────────────────────
function renderGallery(images) {
  const grid   = document.getElementById('gallery-grid');
  const loader = document.getElementById('gallery-loader');
  const empty  = document.getElementById('gallery-empty');

  if (loader) loader.classList.add('hidden');

  if (!images || images.length === 0) {
    if (grid)  grid.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }

  if (empty) empty.classList.add('hidden');

  grid.innerHTML = images.map((img) => `
    <div class="photo-card" onclick="openLightbox('${img.cloudinary_url}', '${img.id}', '${escHtml(img.titre || '')}')">
      <img
        class="photo-card-img"
        src="${buildThumbnailUrl(img.cloudinary_url)}"
        alt="${escHtml(img.titre || 'Photo')}"
        loading="lazy"
      />
      <div class="photo-card-footer">
        <span class="photo-card-title">${escHtml(img.titre || 'Photo')}</span>
        <button
          class="btn-download-single"
          onclick="event.stopPropagation(); downloadImage('${img.id}', '${escHtml(img.titre || 'photo')}')"
          title="Télécharger"
        >
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
}

// Génère une URL miniature Cloudinary (400px de large)
function buildThumbnailUrl(url) {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', '/upload/w_400,q_auto,f_auto/');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── TÉLÉCHARGEMENT IMAGE ──────────────────────────────
async function downloadImage(imageId, titre) {
  try {
    showToast('Téléchargement en cours…');
    const res = await fetch(`${API_URL}/api/images/${imageId}/download`);
    if (!res.ok) throw new Error('Erreur téléchargement');

    const blob = await res.blob();
    const filename = (titre || 'photo').replace(/[^a-z0-9_\-]/gi, '_');

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);

    showToast('Photo téléchargée !');
  } catch {
    showToast('Erreur lors du téléchargement', true);
  }
}

// ─── TÉLÉCHARGEMENT ZIP ────────────────────────────────
async function downloadZip() {
  if (!currentImages || currentImages.length === 0) {
    showToast('Aucune photo à télécharger', true);
    return;
  }

  const btn = document.getElementById('btn-download-all');
  if (btn) { btn.disabled = true; btn.textContent = 'Préparation ZIP…'; }

  try {
    showToast('Création du ZIP en cours…');

    const ids = currentImages.map(img => img.id);
    const res = await fetch(`${API_URL}/api/images/download-zip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_ids: ids })
    });

    if (!res.ok) throw new Error('Erreur création ZIP');

    const blob = await res.blob();
    const albumName = (currentAlbum?.nom || 'photos').replace(/[^a-z0-9_\-]/gi, '_');

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `photos-${albumName}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);

    showToast('ZIP téléchargé !');
  } catch {
    showToast('Erreur lors de la création du ZIP', true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Tout télécharger (ZIP)
      `;
    }
  }
}

// ─── LIGHTBOX ──────────────────────────────────────────
function openLightbox(url, imageId, titre) {
  const lb  = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  const btn = document.getElementById('lightbox-download-btn');

  // Afficher la version haute qualité
  const hqUrl = url.replace('/upload/', '/upload/q_auto,f_auto/');
  img.src = hqUrl;
  img.alt = titre || 'Photo';
  lightboxImageId = imageId;

  if (btn) {
    btn.onclick = () => downloadImage(imageId, titre);
  }

  lb.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeLightbox(e) {
  if (e && e.target !== document.getElementById('lightbox') &&
      !e.target.classList.contains('lightbox-close')) return;

  const lb = document.getElementById('lightbox');
  lb.classList.add('hidden');
  document.getElementById('lightbox-img').src = '';
  lightboxImageId = null;
  document.body.style.overflow = '';
}

// Fermer la lightbox avec Échap
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const lb = document.getElementById('lightbox');
    if (lb && !lb.classList.contains('hidden')) {
      lb.classList.add('hidden');
      document.getElementById('lightbox-img').src = '';
      lightboxImageId = null;
      document.body.style.overflow = '';
    }
  }
});

// ─── SCREENS ───────────────────────────────────────────
function showScreen(id) {
  ['screen-no-album', 'screen-identify', 'screen-gallery'].forEach(s => {
    const el = document.getElementById(s);
    if (el) el.classList.add('hidden');
  });
  const target = document.getElementById(id);
  if (target) target.classList.remove('hidden');
}

// ─── TOAST ─────────────────────────────────────────────
let toastTimer = null;

function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = msg;
  toast.className = `toast${isError ? ' toast-error' : ''}`;
  toast.classList.remove('hidden');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000);
}
