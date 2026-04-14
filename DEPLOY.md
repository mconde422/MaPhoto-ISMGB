# MaPhoto-ISMGB — Guide de déploiement

## 1. Supabase

1. Créer un projet sur [supabase.com](https://supabase.com)
2. Aller dans **SQL Editor** et coller le contenu de `supabase_schema.sql`
3. Exécuter
4. Dans **Settings > API**, copier :
   - `Project URL` → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_KEY`

## 2. Cloudinary

1. Créer un compte sur [cloudinary.com](https://cloudinary.com)
2. Dans le Dashboard, copier :
   - `Cloud name` → `CLOUDINARY_CLOUD_NAME`
   - `API Key` → `CLOUDINARY_API_KEY`
   - `API Secret` → `CLOUDINARY_API_SECRET`

## 3. Backend — Railway

1. Aller sur [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Pointer sur le dossier `backend/`
3. Dans **Variables**, ajouter toutes les clés du `.env.example`
4. `FRONTEND_URL` = URL de votre Netlify (ex: `https://ma-photo-ismgb.netlify.app`)
5. Copier l'URL Railway générée (ex: `https://image-portal-backend.up.railway.app`)

## 4. Frontend — Netlify

1. Ouvrir `frontend/js/app.js` et `frontend/js/admin.js`
2. Remplacer `const API_URL = 'https://your-railway-app.up.railway.app'`
   par l'URL Railway de l'étape 3
3. Déployer le dossier `frontend/` sur [netlify.com](https://netlify.com) (drag & drop)

## 5. Variables d'environnement Railway

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
ADMIN_PASSWORD=SapNmc2025!
PORT=3000
FRONTEND_URL=https://ma-photo-ismgb.netlify.app
NODE_ENV=production
```

## 6. Installation locale (développement)

```bash
cd backend
npm install
cp .env.example .env
# Remplir le .env avec vos vraies clés
npm run dev
```

Ouvrir `frontend/index.html` avec Live Server (VS Code) ou sur `http://localhost:5500`

## 7. Checklist de validation

- [ ] GET `https://votre-railway.up.railway.app/api/health` → `{ status: "ok" }`
- [ ] Panel admin accessible sur `frontend/admin.html` avec le bon mot de passe
- [ ] Création d'un album → QR code généré
- [ ] Upload d'une photo → visible dans Cloudinary + Supabase
- [ ] Portail public : scan QR → identification → galerie
- [ ] Téléchargement image individuelle
- [ ] Téléchargement ZIP (plusieurs images)
