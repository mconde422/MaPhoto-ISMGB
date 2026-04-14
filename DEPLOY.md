# MaPhoto-ISMGB — Guide de déploiement (Render + GitHub Pages)

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

## 3. Backend — Render

1. Aller sur [render.com](https://render.com) et créer un compte
2. **Dashboard > New +** → **Web Service**
3. Connecter votre dépôt GitHub
4. Paramètres :
   - **Name** : `ma-photo-ismgb-api` (ou similaire)
   - **Environment** : `Node`
   - **Build Command** : `npm install`
   - **Start Command** : `node backend/server.js`
   - **Root Directory** : laissez vide (ou mettez le path complet du repo)

5. Dans **Environment**, ajouter les variables :
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_KEY=eyJ...
   CLOUDINARY_CLOUD_NAME=...
   CLOUDINARY_API_KEY=...
   CLOUDINARY_API_SECRET=...
   ADMIN_PASSWORD=SapNmc2025!
   PORT=3000
   FRONTEND_URL=https://votre-username.github.io/ma_photo_ismgb
   NODE_ENV=production
   ```

6. Cliquer sur **Create Web Service**
7. Attendre le déploiement (2-3 min)
8. Copier l'URL générée (ex: `https://ma-photo-ismgb-api.onrender.com`)

## 4. Frontend — GitHub Pages

### Option A — Déploiement depuis main branch (automatique)

1. Pousser le dépôt vers GitHub
2. Aller dans **Settings > Pages**
3. **Source** : `Deploy from a branch`
4. **Branch** : `main`, dossier `/docs`
5. Sauvegarder
6. GitHub va build et publier automatiquement
7. L'URL sera : `https://votre-username.github.io/ma_photo_ismgb`

### Option B — Déploiement manuel via branche `gh-pages`

```bash
# Cloner ou mettre à jour le dépôt localement
git clone https://github.com/votre-username/ma_photo_ismgb.git
cd ma_photo_ismgb

# Créer branche gh-pages si besoin
git checkout --orphan gh-pages
git rm -rf .
git commit --allow-empty -m "Initial gh-pages"

# Copier les fichiers du dossier docs/
git checkout main -- docs/
mv docs/* .
rmdir docs
git add .
git commit -m "Deploy frontend to GitHub Pages"
git push -u origin gh-pages
```

Puis dans **Settings > Pages**, configurer comme Option A.

## 5. Mise à jour post-déploiement

### Mettre à jour API_URL dans le frontend

Après avoir l'URL Render, éditer les fichiers frontend et redéployer :

**docs/js/app.js** et **docs/js/admin.js** (ligne 7) :
```javascript
const API_URL = 'https://ma-photo-ismgb-api.onrender.com';
```

Commiter et pousser vers GitHub :
```bash
git add docs/js/app.js docs/js/admin.js
git commit -m "Update API_URL to Render production"
git push origin main
```

GitHub Pages va redéployer automatiquement.

## 6. Vérification du déploiement

### Backend (Render)

```bash
curl https://ma-photo-ismgb-api.onrender.com/api/health
```

Doit retourner :
```json
{ "status": "ok", "timestamp": "...", "project": "MaPhoto-ISMGB" }
```

### Frontend (GitHub Pages)

1. Ouvrir : `https://votre-username.github.io/ma_photo_ismgb/`
2. Vérifier que le logo et les couleurs s'affichent correctement
3. Tester avec un album (si vous en avez créé un en admin)

## 7. Variables d'environnement complètes

| Variable | Exemple | Description |
|---|---|---|
| `SUPABASE_URL` | `https://abc.supabase.co` | URL du projet Supabase |
| `SUPABASE_SERVICE_KEY` | `eyJhbGci...` | Clé service_role Supabase |
| `CLOUDINARY_CLOUD_NAME` | `mon-cloud` | Nom du cloud Cloudinary |
| `CLOUDINARY_API_KEY` | `123456789` | Clé API Cloudinary |
| `CLOUDINARY_API_SECRET` | `AbCd...` | Secret API Cloudinary |
| `ADMIN_PASSWORD` | `SapNmc2025!` | Mot de passe panel admin |
| `FRONTEND_URL` | `https://username.github.io/ma_photo_ismgb` | URL frontend GitHub Pages |
| `NODE_ENV` | `production` | Environnement (production/development) |

## 8. Troubleshooting Render

### Le service ne redémarre pas après push

- Aller dans **Settings** du service
- Cliquer **Clear Build Cache**
- Cliquer **Deploy latest**

### Les variables d'environnement ne sont pas appliquées

- **Environment > Recreate** la variable
- Ou bien **Suspend** le service quelques secondes puis **Resume**

### Erreur CORS au frontend

- Vérifier que `FRONTEND_URL` dans Render correspond exactement à l'URL GitHub Pages
- Vérifier que le frontend a `API_URL` mis à jour vers l'URL Render
- Redéployer le frontend (push sur main)

## 9. Configuration DNS personnalisé (optionnel)

Pour utiliser votre propre domaine au lieu de `github.io` :

### Render (backend)
1. **Settings > Custom Domain**
2. Ajouter votre domaine (ex: `api.example.com`)
3. Suivre les instructions DNS proposées

### GitHub Pages (frontend)
1. Créer un fichier `docs/CNAME` avec votre domaine :
   ```
   www.example.com
   ```
2. Configurer les DNS (ALIAS ou CNAME)

Puis mettre à jour `FRONTEND_URL` dans Render.

## 10. Sauvegarde et maintenance

### Backup Supabase

Dans [supabase.com](https://supabase.com) > **Settings > Database** :
- Les backups sont effectués automatiquement (plan gratuit = 7 jours)
- Vous pouvez télécharger un backup manuellement

### Logs Render

Pour déboguer :
- Dashboard Render > Cliquer sur le service
- Onglet **Logs** pour voir en temps réel

### Logs GitHub Pages

- **Actions** pour voir les builds et erreurs de déploiement

---

*MaPhoto-ISMGB — Guide de déploiement Render + GitHub Pages*
