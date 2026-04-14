/* ═══════════════════════════════════════════════════════
   MaPhoto-ISMGB — Panel Admin (admin.js)
   ⚠️ Remplacer API_URL par l'URL Render après déploiement
═══════════════════════════════════════════════════════ */

const API_URL = 'https://maphoto-ismgb.onrender.com'; // ← À remplacer après déploiement Render

// ─── ÉTAT GLOBAL ───────────────────────────────────────
let selectedAlbumId   = null;
let selectedAlbumData = null;
let currentQrData     = null;
let pendingFiles      = [];

// ─── HELPERS ───────────────────────────────────────────
const adminHeaders = () => ({
  'x-admin-password': sessionStorage.getItem('ismgb_admin_pwd') || '',
  'Content-Type': 'application/json'
});

function escHtml(str) {
  return String(str || '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  }).format(new Date(iso));
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(iso));
}

function formatSize(kb) {
  if (!kb) return '';
  return kb < 1024 ? `${kb} Ko` : `${(kb / 1024).toFixed(1)} Mo`;
}

// ─── INIT ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const pwd = sessionStorage.getItem('ismgb_admin_pwd');
  if (pwd) {
    showApp();
    loadAlbums();
  } else {
    document.getElementById('screen-login').classList.remove('hidden');
  }

  document.getElementById('form-login')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await login(document.getElementById('input-password').value.trim());
  });
});

// ─── LOGIN ──────────────────────────────────────────────
async function login(password) {
  const btn   = document.getElementById('btn-login');
  const errEl = document.getElementById('login-error');

  if (!password) return;

  btn.disabled    = true;
  btn.textContent = 'Connexion…';
  errEl.classList.add('hidden');

  try {
    const testRes = await fetch(`${API_URL}/api/albums`, {
      headers: { 'x-admin-password': password, 'Content-Type': 'application/json' }
    });

    if (testRes.status === 401) {
      errEl.classList.remove('hidden');
      return;
    }

    sessionStorage.setItem('ismgb_admin_pwd', password);
    showApp();
    await loadAlbums();
  } catch {
    errEl.textContent = 'Impossible de joindre le serveur. Réessayez.';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Se connecter';
  }
}

function logout() {
  sessionStorage.removeItem('ismgb_admin_pwd');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('screen-login').classList.remove('hidden');
  document.getElementById('input-password').value = '';
}

function showApp() {
  document.getElementById('screen-login').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

// ─── ALBUMS ────────────────────────────────────────────
async function loadAlbums() {
  const listEl = document.getElementById('albums-list');
  listEl.innerHTML = '<div class="sidebar-loader"><div class="spinner spinner-sm"></div></div>';

  try {
    const res = await fetch(`${API_URL}/api/albums`, { headers: adminHeaders() });
    if (!res.ok) {
      if (res.status === 401) { logout(); return; }
      throw new Error('Erreur chargement albums');
    }
    renderAlbumsList(await res.json());
  } catch {
    listEl.innerHTML = `<p style="color:rgba(255,255,255,0.5);font-size:0.8rem;padding:0.5rem">Erreur de chargement</p>`;
    showToast('Erreur lors du chargement des albums', true);
  }
}

function renderAlbumsList(albums) {
  const listEl = document.getElementById('albums-list');

  if (!albums || albums.length === 0) {
    listEl.innerHTML = `<p style="color:rgba(255,255,255,0.45);font-size:0.8rem;padding:0.25rem">Aucun album. Créez-en un !</p>`;
    return;
  }

  listEl.innerHTML = albums.map(a => `
    <div
      class="album-item${selectedAlbumId === a.id ? ' active' : ''}"
      onclick="selectAlbum('${a.id}')"
      data-id="${a.id}"
    >
      <div class="album-item-name">${escHtml(a.nom)}</div>
      <div class="album-item-meta">${a.nb_images} photo${a.nb_images !== 1 ? 's' : ''} · ${a.nb_visites} visiteur${a.nb_visites !== 1 ? 's' : ''}</div>
    </div>
  `).join('');
}

// ─── SÉLECTIONNER UN ALBUM ─────────────────────────────
async function selectAlbum(id) {
  selectedAlbumId = id;

  document.querySelectorAll('.album-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });

  document.getElementById('content-empty').classList.add('hidden');
  document.getElementById('content-album').classList.remove('hidden');

  try {
    const res = await fetch(`${API_URL}/api/albums/${id}`, { headers: adminHeaders() });
    if (!res.ok) throw new Error();
    const data = await res.json();
    selectedAlbumData = data;

    document.getElementById('album-title').textContent = data.album.nom;
    document.getElementById('album-meta').textContent =
      data.album.description
        ? `${data.album.description}${data.album.date_evenement ? ' · ' + formatDate(data.album.date_evenement) : ''}`
        : (data.album.date_evenement ? formatDate(data.album.date_evenement) : '');

    document.getElementById('tab-count-images').textContent = data.images.length;

    renderAdminGallery(data.images);
    await loadStats(id);
    switchTab('images');
  } catch {
    showToast("Erreur lors du chargement de l'album", true);
  }
}

// ─── TABS ───────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  document.querySelectorAll('.tab-content').forEach(c => {
    c.classList.toggle('active', c.id === `tab-${name}`);
    c.classList.toggle('hidden',  c.id !== `tab-${name}`);
  });
}

// ─── GALERIE ADMIN ─────────────────────────────────────
function renderAdminGallery(images) {
  const gallery = document.getElementById('admin-gallery');
  const empty   = document.getElementById('images-empty');

  if (!images || images.length === 0) {
    gallery.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');

  gallery.innerHTML = images.map(img => `
    <div class="admin-photo-card" id="img-card-${img.id}">
      <img
        class="admin-photo-img"
        src="${img.cloudinary_url.replace('/upload/', '/upload/w_300,q_auto,f_auto/')}"
        alt="${escHtml(img.titre || 'Photo')}"
        loading="lazy"
      />
      <div class="admin-photo-footer">
        <span class="admin-photo-name" title="${escHtml(img.titre || '')}">
          ${escHtml(img.titre || 'Photo')}
          ${img.taille_kb ? `<span style="opacity:.6"> · ${formatSize(img.taille_kb)}</span>` : ''}
        </span>
        <button
          type="button"
          class="admin-photo-delete"
          onclick="confirmDeleteImage('${img.id}', '${escHtml(img.titre || 'cette photo')}')"
          title="Supprimer"
        >
          <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
            <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
}

// ─── CRÉER UN ALBUM ────────────────────────────────────
async function submitCreateAlbum(e) {
  e.preventDefault();

  const nom  = document.getElementById('album-nom').value.trim();
  const desc = document.getElementById('album-desc').value.trim();
  const date = document.getElementById('album-date').value;

  if (nom.length < 2) {
    showToast("Le nom de l'album est requis (min 2 caractères)", true);
    return;
  }

  const btn       = document.getElementById('btn-submit-album');
  btn.disabled    = true;
  btn.textContent = 'Création…';

  try {
    const res = await fetch(`${API_URL}/api/albums`, {
      method:  'POST',
      headers: adminHeaders(),
      body:    JSON.stringify({ nom, description: desc || null, date_evenement: date || null })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erreur création');
    }

    closeModal('modal-create-album');
    document.getElementById('form-create-album').reset();
    showToast(`Album "${nom}" créé !`);
    await loadAlbums();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    btn.disabled    = false;
    btn.textContent = "Créer l'album";
  }
}

// ─── SUPPRIMER UN ALBUM ────────────────────────────────
function confirmDeleteAlbum() {
  if (!selectedAlbumId || !selectedAlbumData) return;
  const nom = selectedAlbumData.album.nom;
  if (!confirm(`Supprimer définitivement l'album "${nom}" et toutes ses photos ? Cette action est irréversible.`)) return;
  deleteAlbum(selectedAlbumId);
}

async function deleteAlbum(id) {
  try {
    const res = await fetch(`${API_URL}/api/albums/${id}`, {
      method:  'DELETE',
      headers: adminHeaders()
    });
    if (!res.ok) throw new Error('Erreur suppression');

    selectedAlbumId   = null;
    selectedAlbumData = null;

    document.getElementById('content-album').classList.add('hidden');
    document.getElementById('content-empty').classList.remove('hidden');

    showToast('Album supprimé');
    await loadAlbums();
  } catch {
    showToast('Erreur lors de la suppression', true);
  }
}

// ─── SUPPRIMER UNE IMAGE ───────────────────────────────
function confirmDeleteImage(id, titre) {
  if (!confirm(`Supprimer la photo "${titre}" ? Cette action est irréversible.`)) return;
  deleteImage(id);
}

async function deleteImage(id) {
  try {
    const res = await fetch(`${API_URL}/api/images/${id}`, {
      method:  'DELETE',
      headers: adminHeaders()
    });
    if (!res.ok) throw new Error('Erreur suppression image');

    document.getElementById(`img-card-${id}`)?.remove();

    if (selectedAlbumData) {
      selectedAlbumData.images = selectedAlbumData.images.filter(i => i.id !== id);
      document.getElementById('tab-count-images').textContent = selectedAlbumData.images.length;
      if (selectedAlbumData.images.length === 0) {
        document.getElementById('images-empty').classList.remove('hidden');
      }
    }

    showToast('Photo supprimée');
    await loadAlbums();
  } catch {
    showToast('Erreur lors de la suppression', true);
  }
}

// ─── QR CODE ───────────────────────────────────────────
async function showQRCode() {
  if (!selectedAlbumId) return;
  openModal('modal-qrcode');

  const qrImg  = document.getElementById('qr-img');
  const qrUrl  = document.getElementById('qr-url');
  const qrLoad = document.getElementById('qr-loader');

  qrImg.classList.add('hidden');
  qrLoad.classList.remove('hidden');
  currentQrData = null;

  try {
    const res = await fetch(`${API_URL}/api/albums/${selectedAlbumId}/qrcode`, {
      headers: adminHeaders()
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    currentQrData = data;

    qrImg.src = data.qr_code_base64;
    qrUrl.textContent = data.url;
    qrLoad.classList.add('hidden');
    qrImg.classList.remove('hidden');
  } catch {
    qrLoad.classList.add('hidden');
    qrUrl.textContent = 'Erreur lors de la génération du QR code';
    showToast('Erreur QR code', true);
  }
}

function downloadQRCode() {
  if (!currentQrData) return;
  const albumName = (selectedAlbumData?.album?.nom || 'album').replace(/[^a-z0-9_\-]/gi, '_');
  const a    = document.createElement('a');
  a.href     = currentQrData.qr_code_base64;
  a.download = `qrcode-${albumName}.png`;
  a.click();
}

function copyAlbumLink() {
  if (!currentQrData) return;
  navigator.clipboard.writeText(currentQrData.url)
    .then(() => showToast('Lien copié !'))
    .catch(() => showToast('Impossible de copier', true));
}

// ─── UPLOAD ─────────────────────────────────────────────
function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.add('drag-over');
}

function handleDragLeave() {
  document.getElementById('drop-zone').classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  if (files.length > 0) addFilesToPreview(files);
}

function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  if (files.length > 0) addFilesToPreview(files);
  e.target.value = '';
}

function addFilesToPreview(files) {
  const existing = new Set(pendingFiles.map(f => f.name));
  pendingFiles   = [...pendingFiles, ...files.filter(f => !existing.has(f.name))];
  renderPreviews();
}

function renderPreviews() {
  const list    = document.getElementById('preview-list');
  const actions = document.getElementById('upload-actions');

  if (pendingFiles.length === 0) {
    list.innerHTML = '';
    actions.classList.add('hidden');
    return;
  }

  actions.classList.remove('hidden');

  list.innerHTML = pendingFiles.map((file, i) => `
    <div class="preview-item" id="preview-${i}">
      <img class="preview-img" id="preview-img-${i}" src="" alt="${escHtml(file.name)}" />
      <div class="preview-info">
        <div class="preview-name" title="${escHtml(file.name)}">${escHtml(file.name)}</div>
        <div class="preview-size">${formatSize(Math.round(file.size / 1024))}</div>
      </div>
      <div class="progress-bar-wrap">
        <div class="progress-bar" id="progress-${i}"></div>
      </div>
      <div class="preview-status" id="status-${i}"></div>
    </div>
  `).join('');

  pendingFiles.forEach((file, i) => {
    const reader  = new FileReader();
    reader.onload = (e) => {
      const img = document.getElementById(`preview-img-${i}`);
      if (img) img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function startUpload() {
  if (!selectedAlbumId) { showToast("Sélectionnez un album d'abord", true); return; }
  if (pendingFiles.length === 0) return;

  const btn      = document.getElementById('btn-start-upload');
  const statusEl = document.getElementById('upload-status');
  btn.disabled   = true;

  const BATCH_SIZE = 5;
  let uploaded = 0;
  let errors   = 0;

  for (let i = 0; i < pendingFiles.length; i += BATCH_SIZE) {
    const batch        = pendingFiles.slice(i, i + BATCH_SIZE);
    const batchIndices = batch.map((_, j) => i + j);

    const formData = new FormData();
    formData.append('album_id', selectedAlbumId);
    batch.forEach(file => formData.append('images', file));

    // Animer les barres pendant l'upload
    batchIndices.forEach(idx => {
      const bar = document.getElementById(`progress-${idx}`);
      if (bar) {
        let prog = 0;
        bar._interval = setInterval(() => {
          prog = Math.min(prog + 8, 85);
          bar.style.width = `${prog}%`;
        }, 120);
      }
    });

    try {
      const res = await fetch(`${API_URL}/api/images/upload`, {
        method:  'POST',
        headers: { 'x-admin-password': sessionStorage.getItem('ismgb_admin_pwd') || '' },
        body:    formData
      });

      batchIndices.forEach(idx => {
        const bar = document.getElementById(`progress-${idx}`);
        if (bar?._interval) clearInterval(bar._interval);
      });

      if (res.status === 401) { logout(); return; }

      const data = await res.json();
      uploaded  += (data.uploaded || []).length;
      errors    += (data.errors   || []).length;

      (data.uploaded || []).forEach((_, j) => {
        const idx    = i + j;
        const bar    = document.getElementById(`progress-${idx}`);
        const status = document.getElementById(`status-${idx}`);
        if (bar)    bar.style.width = '100%';
        if (status) { status.textContent = '✅'; status.classList.add('visible'); }
      });

      (data.errors || []).forEach((_, j) => {
        const idx    = i + (data.uploaded || []).length + j;
        const status = document.getElementById(`status-${idx}`);
        if (status) { status.textContent = '❌'; status.classList.add('visible'); }
      });

    } catch {
      errors += batch.length;
      batchIndices.forEach(idx => {
        const bar    = document.getElementById(`progress-${idx}`);
        const status = document.getElementById(`status-${idx}`);
        if (bar?._interval) clearInterval(bar._interval);
        if (status) { status.textContent = '❌'; status.classList.add('visible'); }
      });
    }

    statusEl.textContent = `${uploaded} uploadée${uploaded > 1 ? 's' : ''}${errors > 0 ? `, ${errors} erreur${errors > 1 ? 's' : ''}` : ''}`;
  }

  if (uploaded > 0) {
    showToast(`${uploaded} photo${uploaded > 1 ? 's' : ''} uploadée${uploaded > 1 ? 's' : ''} avec succès`);
    await selectAlbum(selectedAlbumId);
    setTimeout(() => { clearPreviews(); switchTab('images'); }, 1500);
  } else {
    showToast('Aucune photo uploadée', true);
  }

  btn.disabled = false;
}

function clearPreviews() {
  pendingFiles = [];
  document.getElementById('preview-list').innerHTML  = '';
  document.getElementById('upload-actions').classList.add('hidden');
  document.getElementById('upload-status').textContent = '';
}

// ─── STATISTIQUES ──────────────────────────────────────
async function loadStats(albumId) {
  const loaderEl  = document.getElementById('visitors-loader');
  const tableEl   = document.getElementById('visitors-table');
  const emptyEl   = document.getElementById('visitors-empty');
  const tbodyEl   = document.getElementById('visitors-tbody');
  const statVisEl = document.getElementById('stat-visitors');
  const statImgEl = document.getElementById('stat-images');

  loaderEl.classList.remove('hidden');
  tableEl.classList.add('hidden');
  emptyEl.classList.add('hidden');

  if (selectedAlbumData && statImgEl) {
    statImgEl.textContent = selectedAlbumData.images.length;
  }

  try {
    const res = await fetch(`${API_URL}/api/visites/stats/${albumId}`, {
      headers: adminHeaders()
    });
    if (!res.ok) throw new Error();
    const data = await res.json();

    loaderEl.classList.add('hidden');
    if (statVisEl) statVisEl.textContent = data.total;
    document.getElementById('tab-count-visitors').textContent = data.total;

    if (!data.visiteurs || data.visiteurs.length === 0) {
      emptyEl.classList.remove('hidden');
      return;
    }

    tbodyEl.innerHTML = data.visiteurs.map((v, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escHtml(v.prenom)}</td>
        <td>${escHtml(v.nom)}</td>
        <td>${formatDateTime(v.date_heure)}</td>
      </tr>
    `).join('');

    tableEl.classList.remove('hidden');
  } catch {
    loaderEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
  }
}

// ─── MODALS ─────────────────────────────────────────────
function openModal(id)  { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

function closeModalOutside(e, id) {
  if (e.target === document.getElementById(id)) closeModal(id);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => {
      m.classList.add('hidden');
    });
  }
});

// ─── TOAST ─────────────────────────────────────────────
let toastTimer = null;

function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = msg;
  toast.className   = `toast${isError ? ' toast-error' : ''}`;
  toast.classList.remove('hidden');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3500);
}
