# MaPhoto-ISMGB

> Portail de partage de photos événementielles pour l'ISMGB — pôle SAP/NMC  
> Accès public via QR code · Panel admin sécurisé · Stockage cloud · Téléchargement ZIP

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture du système](#2-architecture-du-système)
3. [Structure des fichiers](#3-structure-des-fichiers)
4. [Stack technique](#4-stack-technique)
5. [Schéma de base de données](#5-schéma-de-base-de-données)
6. [API — Référence complète](#6-api--référence-complète)
7. [Frontend — Portail public](#7-frontend--portail-public)
8. [Frontend — Panel admin](#8-frontend--panel-admin)
9. [Sécurité](#9-sécurité)
10. [Installation locale](#10-installation-locale)
11. [Déploiement en production](#11-déploiement-en-production)
12. [Variables d'environnement](#12-variables-denvironnement)
13. [Flux utilisateur détaillé](#13-flux-utilisateur-détaillé)
14. [Flux administrateur détaillé](#14-flux-administrateur-détaillé)
15. [Gestion des erreurs](#15-gestion-des-erreurs)
16. [Limites et contraintes techniques](#16-limites-et-contraintes-techniques)
17. [Checklist de validation](#17-checklist-de-validation)

---

## 1. Vue d'ensemble

**MaPhoto-ISMGB** est une application web full-stack conçue pour permettre aux communicants SAP/NMC de l'ISMGB de publier et distribuer des photos d'événements (cérémonies, remises de diplômes, journées portes ouvertes, etc.) à leurs participants, sans nécessiter de compte utilisateur ni d'application mobile.

### Principe de fonctionnement

```
[Communicant SAP]
       │
       ▼
 Panel Admin (/admin.html)
  ├── Crée un album "Cérémonie Avril 2026"
  ├── Uploade les photos (drag & drop)
  └── Récupère le QR code de l'album
       │
       ▼
  QR Code affiché/imprimé lors de l'événement
       │
       ▼
[Participant] scanne le QR code avec son smartphone
       │
       ▼
 Portail Public (/index.html?album=ceremonie-avril-2026-x8k2)
  ├── S'identifie (prénom + nom — loggé, pas de compte)
  └── Accède à la galerie → télécharge ses photos
```

### Ce que le système n'est PAS

- Ce n'est **pas** un réseau social (pas de comptes, pas de commentaires)
- Ce n'est **pas** un service de stockage personnel (les albums sont gérés par l'admin)
- Ce n'est **pas** une application sécurisée à haute criticité (mot de passe admin simple, pas de JWT)

---

## 2. Architecture du système

```
┌─────────────────────────────────────────────────────────────────┐
│                        NAVIGATEUR CLIENT                        │
│                                                                 │
│   ┌──────────────────┐          ┌──────────────────────────┐   │
│   │  index.html       │          │  admin.html               │   │
│   │  (Portail Public) │          │  (Panel Communiquant)     │   │
│   │  app.js           │          │  admin.js                 │   │
│   │  style.css        │          │  admin.css                │   │
│   └────────┬─────────┘          └───────────┬──────────────┘   │
│            │ fetch()                         │ fetch() + header  │
│            │ GET/POST                        │ x-admin-password  │
└────────────┼─────────────────────────────────┼──────────────────┘
             │                                 │
             ▼                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│               BACKEND — Node.js + Express (Railway)             │
│                                                                 │
│   server.js                                                     │
│   ├── /api/health          GET  → vérification état serveur     │
│   ├── /api/albums          routes/albums.js                     │
│   │    ├── GET  /:slug      → récupérer album + images (public) │
│   │    ├── GET  /           → lister tous albums (admin)        │
│   │    ├── POST /           → créer album + QR code (admin)     │
│   │    ├── DELETE /:id      → supprimer album + images (admin)  │
│   │    └── GET  /:id/qrcode → régénérer QR code (admin)        │
│   ├── /api/images           routes/images.js                    │
│   │    ├── POST /upload     → upload images Cloudinary (admin)  │
│   │    ├── DELETE /:id      → supprimer image (admin)           │
│   │    ├── GET  /:id/download → télécharger image (public)      │
│   │    └── POST /download-zip → créer ZIP multi-images (public) │
│   └── /api/visites          routes/visites.js                   │
│        ├── POST /           → enregistrer visite (public)       │
│        └── GET  /stats/:id  → stats visiteurs (admin)           │
└──────────────┬────────────────────────────────┬─────────────────┘
               │                                │
               ▼                                ▼
┌──────────────────────────┐    ┌───────────────────────────────┐
│  SUPABASE (PostgreSQL)   │    │  CLOUDINARY (Stockage images) │
│                          │    │                               │
│  Table: albums           │    │  Dossier: sap-nmc/{album_id}/ │
│  Table: images           │    │  Transformations auto:        │
│  Table: visites          │    │  - quality: auto              │
│                          │    │  - fetch_format: auto         │
│  Hébergé: supabase.co    │    │  - thumbnails: w_400          │
└──────────────────────────┘    └───────────────────────────────┘
```

### Flux des données pour un upload

```
Admin sélectionne fichiers
        │
        ▼
Multer (memoryStorage) ── buffer en RAM, jamais sur disque
        │
        ▼
cloudinary.uploader.upload_stream(buffer)
        │
        ├── URL sécurisée HTTPS retournée (secure_url)
        ├── public_id retourné pour suppression future
        │
        ▼
INSERT INTO images (album_id, titre, cloudinary_url, cloudinary_public_id, taille_kb)
        │
        ▼
Réponse JSON → frontend met à jour la galerie
```

---

## 3. Structure des fichiers

```
ma_photo_ismgb/
│
├── README.md                    ← Ce fichier
├── DEPLOY.md                    ← Guide de déploiement pas-à-pas
├── supabase_schema.sql          ← SQL à exécuter dans Supabase
│
├── backend/
│   ├── server.js                ← Point d'entrée, config Express + CORS
│   ├── package.json             ← Dépendances npm + scripts
│   ├── .env.example             ← Template variables d'environnement
│   ├── .gitignore               ← Exclut node_modules et .env
│   └── routes/
│       ├── albums.js            ← CRUD albums + génération QR code
│       ├── images.js            ← Upload/suppression/téléchargement images
│       └── visites.js           ← Enregistrement et stats des visites
│
└── frontend/
    ├── index.html               ← Portail public (3 états)
    ├── admin.html               ← Panel communiquant (layout 2 colonnes)
    ├── css/
    │   ├── style.css            ← Styles portail — Poppins, palette verte
    │   └── admin.css            ← Styles admin — Inter, sidebar sombre
    └── js/
        ├── app.js               ← Logique portail public
        └── admin.js             ← Logique panel admin
```

---

## 4. Stack technique

### Backend

| Technologie | Version | Rôle |
|---|---|---|
| Node.js | ≥ 20.0.0 | Runtime JavaScript serveur |
| Express | ^4.18.2 | Framework HTTP, routing, middlewares |
| @supabase/supabase-js | ^2.39.0 | Client PostgreSQL via Supabase |
| cloudinary | ^2.0.0 | SDK upload/suppression/transformation d'images |
| multer | ^1.4.5-lts.1 | Parsing multipart/form-data, stockage mémoire |
| archiver | ^6.0.1 | Création de fichiers ZIP streamés |
| qrcode | ^1.5.3 | Génération QR code PNG en base64 |
| node-fetch | ^2.7.0 | Requêtes HTTP côté serveur (proxy téléchargement) |
| cors | ^2.8.5 | Middleware CORS strict |
| dotenv | ^16.4.1 | Chargement variables d'environnement |
| nodemon | ^3.0.2 | Rechargement auto en développement |

### Frontend

| Technologie | Rôle |
|---|---|
| HTML5 | Structure sémantique |
| CSS3 | Styles, animations, responsive (sans framework) |
| JavaScript ES6+ | Logique applicative (sans framework) |
| Google Fonts — Poppins | Typographie portail public |
| Google Fonts — Inter | Typographie panel admin |

### Services externes

| Service | Usage |
|---|---|
| Supabase | Base de données PostgreSQL hébergée + API REST |
| Cloudinary | Stockage, CDN et transformations d'images |
| Railway | Hébergement backend Node.js |
| Netlify | Hébergement frontend statique |

---

## 5. Schéma de base de données

### Table `albums`

| Colonne | Type | Contrainte | Description |
|---|---|---|---|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | Identifiant unique |
| `nom` | VARCHAR(255) | NOT NULL | Nom affiché de l'album |
| `description` | TEXT | nullable | Description optionnelle |
| `slug` | VARCHAR(100) | UNIQUE, NOT NULL | URL-friendly, généré automatiquement |
| `date_evenement` | DATE | nullable | Date de l'événement |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Date de création |

**Exemple de slug généré** : `ceremonie-remise-diplomes-2026-x8k2`
- Base = nom normalisé (minuscules, sans accents, espaces → tirets)
- Suffixe = 4 caractères alphanumériques aléatoires (anti-collision)

### Table `images`

| Colonne | Type | Contrainte | Description |
|---|---|---|---|
| `id` | UUID | PK | Identifiant unique |
| `album_id` | UUID | FK → albums(id) ON DELETE CASCADE | Album parent |
| `titre` | VARCHAR(255) | nullable | Titre de l'image |
| `cloudinary_url` | TEXT | NOT NULL | URL HTTPS complète Cloudinary |
| `cloudinary_public_id` | VARCHAR(255) | NOT NULL | ID pour suppression Cloudinary |
| `taille_kb` | INTEGER | nullable | Taille originale en Ko |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Date d'upload |

**Note** : La suppression d'un album déclenche `ON DELETE CASCADE` sur les images en base. La suppression sur Cloudinary est effectuée explicitement avant via `cloudinary.api.delete_resources()`.

### Table `visites`

| Colonne | Type | Contrainte | Description |
|---|---|---|---|
| `id` | UUID | PK | Identifiant unique |
| `prenom` | VARCHAR(100) | NOT NULL | Prénom du visiteur |
| `nom` | VARCHAR(100) | NOT NULL | Nom du visiteur |
| `album_id` | UUID | FK → albums(id) ON DELETE SET NULL | Album visité |
| `date_heure` | TIMESTAMPTZ | DEFAULT NOW() | Horodatage de la visite |
| `user_agent` | TEXT | nullable | Navigateur/appareil du visiteur |

**Note** : `ON DELETE SET NULL` sur `album_id` — les logs de visites sont conservés même si l'album est supprimé.

### Index

```sql
CREATE INDEX idx_images_album  ON images(album_id);   -- Requêtes images par album
CREATE INDEX idx_visites_album ON visites(album_id);  -- Stats visiteurs par album
CREATE INDEX idx_albums_slug   ON albums(slug);       -- Lookup album par slug (public)
```

---

## 6. API — Référence complète

### Base URL

```
Production : https://votre-app.up.railway.app
Local      : http://localhost:3000
```

### Authentification admin

Toutes les routes marquées **(admin)** requièrent le header :

```
x-admin-password: <valeur de ADMIN_PASSWORD dans .env>
```

Les routes **(public)** ne requièrent aucun header d'authentification.

---

### `GET /api/health`

Vérification de l'état du serveur. Utilisé par le frontend admin pour valider le mot de passe.

**Accès** : Public  
**Réponse 200** :
```json
{
  "status": "ok",
  "timestamp": "2026-04-14T10:30:00.000Z",
  "project": "MaPhoto-ISMGB"
}
```

---

### `GET /api/albums/:slug`

Récupère un album et toutes ses images, par slug ou par UUID.

**Accès** : Public  
**Paramètre URL** : `slug` — slug de l'album (ex: `ceremonie-avril-2026-x8k2`) ou UUID  
**Réponse 200** :
```json
{
  "album": {
    "id": "uuid",
    "nom": "Cérémonie de remise des diplômes 2026",
    "description": "Photos officielles de la cérémonie",
    "slug": "ceremonie-remise-diplomes-2026-x8k2",
    "date_evenement": "2026-04-10",
    "created_at": "2026-04-01T09:00:00.000Z"
  },
  "images": [
    {
      "id": "uuid",
      "album_id": "uuid",
      "titre": "Remise de diplôme - Jean Dupont",
      "cloudinary_url": "https://res.cloudinary.com/...",
      "cloudinary_public_id": "sap-nmc/uuid/photo_abc123",
      "taille_kb": 1240,
      "created_at": "2026-04-10T14:30:00.000Z"
    }
  ]
}
```
**Réponse 404** : `{ "error": "Album non trouvé" }`

---

### `GET /api/albums`

Liste tous les albums avec statistiques.

**Accès** : Admin  
**Réponse 200** :
```json
[
  {
    "id": "uuid",
    "nom": "Cérémonie de remise des diplômes 2026",
    "slug": "ceremonie-remise-diplomes-2026-x8k2",
    "date_evenement": "2026-04-10",
    "nb_images": 87,
    "nb_visites": 234,
    "qr_code_url": "https://monsite.netlify.app/?album=ceremonie-remise-diplomes-2026-x8k2",
    "created_at": "2026-04-01T09:00:00.000Z"
  }
]
```

---

### `POST /api/albums`

Crée un nouvel album. Génère automatiquement le slug et le QR code.

**Accès** : Admin  
**Body JSON** :
```json
{
  "nom": "Journée portes ouvertes 2026",
  "description": "Photos de la JPO du 15 mai 2026",
  "date_evenement": "2026-05-15"
}
```
**Validations** :
- `nom` : requis, min 2 caractères

**Réponse 201** :
```json
{
  "album": {
    "id": "uuid",
    "nom": "Journée portes ouvertes 2026",
    "slug": "journee-portes-ouvertes-2026-k9m3",
    ...
  },
  "qr_code_base64": "data:image/png;base64,iVBOR...",
  "url": "https://monsite.netlify.app/?album=journee-portes-ouvertes-2026-k9m3"
}
```
**Réponse 400** : `{ "error": "Le nom de l'album est requis (min 2 caractères)" }`  
**Réponse 409** : `{ "error": "Un album avec ce nom existe déjà" }`

---

### `DELETE /api/albums/:id`

Supprime un album, toutes ses images Cloudinary, et ses entrées en base.

**Accès** : Admin  
**Comportement** :
1. Récupère les `cloudinary_public_id` de toutes les images de l'album
2. Appelle `cloudinary.api.delete_resources([...ids])` (suppression groupée)
3. Supprime l'album en base → CASCADE supprime les images, SET NULL sur les visites

**Réponse 200** : `{ "success": true }`

---

### `GET /api/albums/:id/qrcode`

Régénère et retourne le QR code PNG d'un album en base64.

**Accès** : Admin  
**Réponse 200** :
```json
{
  "qr_code_base64": "data:image/png;base64,iVBOR...",
  "url": "https://monsite.netlify.app/?album=slug-de-l-album"
}
```

---

### `POST /api/images/upload`

Upload une ou plusieurs images vers Cloudinary, puis les enregistre en base.

**Accès** : Admin  
**Content-Type** : `multipart/form-data`  
**Champs form-data** :

| Champ | Type | Requis | Description |
|---|---|---|---|
| `images` | File[] | Oui | 1 à 20 fichiers image |
| `album_id` | string | Oui | UUID de l'album cible |
| `titre` | string | Non | Titre appliqué à toutes les images du batch |

**Contraintes Multer** :
- Taille max par fichier : **15 Mo**
- Formats acceptés : `image/jpeg`, `image/png`, `image/webp`, `image/gif`
- Maximum **20 fichiers** par requête

**Options Cloudinary** :
```javascript
{
  folder: `sap-nmc/${album_id}`,
  resource_type: 'image',
  quality: 'auto',
  fetch_format: 'auto'
}
```

**Réponse 200** :
```json
{
  "uploaded": [
    {
      "id": "uuid",
      "album_id": "uuid",
      "titre": "Photo 001",
      "cloudinary_url": "https://res.cloudinary.com/...",
      "cloudinary_public_id": "sap-nmc/uuid/photo_abc",
      "taille_kb": 980,
      "created_at": "..."
    }
  ],
  "errors": [
    { "file": "photo_corrompue.jpg", "error": "Format non supporté" }
  ]
}
```

**Note** : La réponse est 200 même si certains fichiers ont échoué. Elle est 500 uniquement si **tous** les fichiers ont échoué.

---

### `DELETE /api/images/:id`

Supprime une image de Cloudinary et de Supabase.

**Accès** : Admin  
**Comportement** :
1. Récupère le `cloudinary_public_id` depuis Supabase
2. Appelle `cloudinary.uploader.destroy(public_id)`
3. Supprime l'entrée dans la table `images`

**Réponse 200** : `{ "success": true }`  
**Réponse 404** : `{ "error": "Image non trouvée" }`

---

### `GET /api/images/:id/download`

Proxy pour télécharger une image depuis Cloudinary avec un nom de fichier propre.

**Accès** : Public  
**Comportement** : Récupère l'URL Cloudinary depuis Supabase, puis streame le fichier avec les headers appropriés.  
**Headers de réponse** :
```
Content-Type: image/jpeg
Content-Disposition: attachment; filename="titre_de_la_photo.jpg"
```

---

### `POST /api/images/download-zip`

Crée et streame un fichier ZIP contenant plusieurs images.

**Accès** : Public  
**Body JSON** :
```json
{
  "image_ids": ["uuid1", "uuid2", "uuid3"]
}
```
**Limite** : Maximum 100 images par ZIP  
**Headers de réponse** :
```
Content-Type: application/zip
Content-Disposition: attachment; filename="photos-ismgb.zip"
```
**Comportement** : Les images sont récupérées en séquence depuis Cloudinary et ajoutées au ZIP via `archiver`. Le stream est envoyé au client au fur et à mesure (pas de stockage intermédiaire).

**Nommage des fichiers dans le ZIP** : `001_titre_photo.jpg`, `002_autre_photo.jpg`, …

---

### `POST /api/visites`

Enregistre une visite utilisateur sur un album.

**Accès** : Public  
**Body JSON** :
```json
{
  "prenom": "Marie",
  "nom": "Dupont",
  "album_id": "uuid"
}
```
**Validations** :
- `prenom` : requis, min 2 caractères
- `nom` : requis, min 2 caractères
- `album_id` : optionnel

**Réponse 201** : `{ "success": true, "visite_id": "uuid" }`

---

### `GET /api/visites/stats/:album_id`

Retourne les statistiques de visites pour un album donné.

**Accès** : Admin  
**Réponse 200** :
```json
{
  "total": 47,
  "visiteurs": [
    {
      "prenom": "Marie",
      "nom": "Dupont",
      "date_heure": "2026-04-10T15:32:00.000Z"
    }
  ]
}
```

---

## 7. Frontend — Portail public

**Fichiers** : [frontend/index.html](frontend/index.html) + [frontend/js/app.js](frontend/js/app.js) + [frontend/css/style.css](frontend/css/style.css)

### Les 3 états de l'application

#### État 1 — Aucun album (`#screen-no-album`)

Affiché quand l'URL ne contient pas le paramètre `?album=`.

**Condition** : `new URLSearchParams(location.search).get('album')` retourne `null` ou chaîne vide.

**Affichage** : Message invitant à scanner un QR code valide.

#### État 2 — Identification (`#screen-identify`)

Affiché quand un slug est présent dans l'URL mais que l'utilisateur n'est pas identifié.

**Condition** : `localStorage.getItem('sap_user')` est null.

**Fonctionnement** :
1. Chargement de l'album en arrière-plan pour afficher son nom
2. Formulaire prénom + nom avec validation côté client (min 2 chars chacun)
3. Au submit : `POST /api/visites` → stockage dans `localStorage` sous la clé `sap_user`
4. Bascule vers l'état galerie

**Persistance** : Une fois identifié, l'utilisateur n'est plus jamais invité à se réidentifier sur ce navigateur (jusqu'au nettoyage du localStorage).

#### État 3 — Galerie (`#screen-gallery`)

Affichage des photos de l'album avec toutes les interactions.

**Fonctionnalités** :
- Grille responsive : 3 colonnes (≥1024px) → 2 colonnes (≥480px) → 1 colonne (<480px)
- Miniatures optimisées via transformation Cloudinary : `w_400,q_auto,f_auto`
- Bouton téléchargement individuel sur chaque carte
- Bouton "Tout télécharger (ZIP)" en haut
- Clic sur une image → lightbox

### Lightbox

Overlay plein écran `rgba(0,0,0,0.92)` avec :
- Image haute qualité (`q_auto,f_auto` sans redimensionnement)
- Bouton fermer (×) en haut à droite
- Bouton télécharger en bas
- Fermeture par clic sur le fond, clic sur ×, ou touche `Échap`

### Optimisations des URLs Cloudinary

Le frontend applique des transformations à la volée en modifiant les URLs :

```javascript
// Miniature (grille)
url.replace('/upload/', '/upload/w_400,q_auto,f_auto/')

// Haute qualité (lightbox)
url.replace('/upload/', '/upload/q_auto,f_auto/')
```

---

## 8. Frontend — Panel admin

**Fichiers** : [frontend/admin.html](frontend/admin.html) + [frontend/js/admin.js](frontend/js/admin.js) + [frontend/css/admin.css](frontend/css/admin.css)

### Écran de connexion

- Input mot de passe → stocké dans `sessionStorage` sous la clé `sap_admin_pwd`
- Validation en testant `GET /api/albums` avec le header `x-admin-password`
- Si réponse 401 → message d'erreur affiché
- `sessionStorage` = le mot de passe disparaît à la fermeture du navigateur (pas `localStorage`)

### Layout 2 colonnes

```
┌──────────────────┬─────────────────────────────────────────┐
│   SIDEBAR        │   CONTENU PRINCIPAL                     │
│   260px fixe     │   flex: 1, overflow-y: auto             │
│   bg: #1B4D3E    │   bg: #F0F4F8                           │
│                  │                                         │
│  [SAP] MaPhoto   │   [Titre album]           [QR] [Supp.]  │
│                  │   ─────────────────────────────────────  │
│  [+ Nouvel album]│   [ Photos ] [ Upload ] [ Visiteurs ]   │
│                  │                                         │
│  ▶ Cérémonie     │   ┌─────┐┌─────┐┌─────┐┌─────┐        │
│    Journée JPO   │   │ img ││ img ││ img ││ img │        │
│    Conférence    │   └─────┘└─────┘└─────┘└─────┘        │
└──────────────────┴─────────────────────────────────────────┘
```

### Onglet Photos

- Grille responsive `auto-fill, minmax(170px, 1fr)`
- Chaque carte : miniature carrée + nom + taille + bouton suppression rouge
- Confirmation native `confirm()` avant suppression
- Suppression optimiste : la card est retirée du DOM immédiatement, puis l'API est appelée

### Onglet Upload

**Zone drag & drop** :
- Événements : `ondragover`, `ondragleave`, `ondrop`
- Clic → `<input type="file" multiple accept="image/*">`
- Classe CSS `drag-over` ajoutée pendant le survol

**Preview** :
- Génération des miniatures via `FileReader.readAsDataURL()`
- Affichage : nom du fichier + taille en Ko/Mo
- Barre de progression simulée pendant l'upload (incréments de 8% toutes les 120ms jusqu'à 85%, puis 100% à la fin)

**Upload par batch** :
- Maximum **5 fichiers** envoyés simultanément par requête
- Les fichiers sont traités en boucle : `for (let i = 0; i < files.length; i += 5)`
- Indicateurs visuels : ✅ succès, ❌ erreur sur chaque carte de preview

### Onglet Visiteurs

- Deux cartes statistiques : nombre de photos, nombre de visiteurs
- Tableau avec rayures alternées (`:nth-child(even)`)
- Colonnes : #, Prénom, Nom, Date & Heure
- Formatage des dates en `fr-FR` via `Intl.DateTimeFormat`

### Modal Création d'album

- Champs : Nom (requis), Description (optionnel), Date de l'événement (optionnel)
- Fermeture : bouton ×, clic sur l'overlay, touche Échap
- Après création : fermeture automatique + refresh liste + toast de confirmation

### Modal QR Code

- Chargement asynchrone via `GET /api/albums/:id/qrcode`
- Affiche l'image QR (220×220px) + URL en texte
- Bouton "Copier le lien" → `navigator.clipboard.writeText()`
- Bouton "Télécharger PNG" → crée un `<a download>` sur le base64

---

## 9. Sécurité

### Ce qui est protégé

| Vecteur | Mesure |
|---|---|
| Clés API backend | Variables d'environnement uniquement, jamais exposées au frontend |
| Routes admin | Header `x-admin-password` vérifié sur chaque requête (middleware `adminAuth`) |
| Upload | Validation type MIME côté serveur (Multer `fileFilter`) + limite 15 Mo |
| Injection | Pas de requêtes SQL dynamiques (ORM Supabase) |
| CORS | Liste blanche stricte : URL Netlify + localhost uniquement |
| Inputs | Validation longueur et format côté serveur sur tous les champs |

### Ce qui N'est PAS protégé (par conception)

- **Les images sont publiques** : toute personne possédant l'URL Cloudinary peut y accéder directement. Ce système n'est pas conçu pour des documents confidentiels.
- **Le mot de passe admin est unique et partagé** : pas de gestion multi-utilisateurs, pas de révocation individuelle.
- **L'identification des visiteurs n'est pas vérifiée** : n'importe qui peut entrer n'importe quel nom. C'est un log statistique, pas une authentification.

### Slug anti-énumération

Le slug contient 4 caractères aléatoires en suffixe (`Math.random().toString(36).substring(2,6)`), rendant la devinette d'URL improbable mais pas impossible. Ne pas y stocker de contenu sensible.

---

## 10. Installation locale

### Prérequis

- Node.js ≥ 20.0.0 (`node --version`)
- npm ≥ 9 (`npm --version`)
- Un compte Supabase (gratuit)
- Un compte Cloudinary (gratuit)
- Un éditeur de code (VS Code recommandé avec l'extension Live Server)

### Étape 1 — Supabase

1. Créer un projet sur [supabase.com](https://supabase.com)
2. Dans **SQL Editor**, exécuter le contenu de `supabase_schema.sql`
3. Aller dans **Project Settings > API** :
   - Copier **Project URL** → `SUPABASE_URL`
   - Copier la clé **service_role** (pas `anon`) → `SUPABASE_SERVICE_KEY`

### Étape 2 — Cloudinary

1. Créer un compte sur [cloudinary.com](https://cloudinary.com)
2. Dans le **Dashboard** :
   - Copier **Cloud Name** → `CLOUDINARY_CLOUD_NAME`
   - Copier **API Key** → `CLOUDINARY_API_KEY`
   - Copier **API Secret** → `CLOUDINARY_API_SECRET`

### Étape 3 — Configuration backend

```bash
cd backend

# Installer les dépendances
npm install

# Créer le fichier .env
cp .env.example .env
```

Éditer `.env` :
```env
SUPABASE_URL=https://abcdefghij.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIs...
CLOUDINARY_CLOUD_NAME=mon-cloud
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=AbCdEfGhIjKlMnOpQrStUv
ADMIN_PASSWORD=MonMotDePasse2025!
PORT=3000
FRONTEND_URL=http://localhost:5500
NODE_ENV=development
```

### Étape 4 — Démarrer le backend

```bash
# Mode développement (rechargement automatique)
npm run dev

# Mode production
npm start
```

Vérifier : `http://localhost:3000/api/health` doit retourner `{ "status": "ok" }`.

### Étape 5 — Configurer le frontend

Éditer les deux fichiers suivants et remplacer la valeur de `API_URL` :

```javascript
// frontend/js/app.js   (ligne 7)
// frontend/js/admin.js (ligne 7)
const API_URL = 'http://localhost:3000';
```

### Étape 6 — Ouvrir le frontend

**Option A — VS Code Live Server** (recommandé) :
1. Installer l'extension "Live Server"
2. Clic droit sur `frontend/index.html` → "Open with Live Server"
3. Accès sur `http://127.0.0.1:5500`

**Option B — Python** :
```bash
cd frontend
python -m http.server 5500
```

**URLs locales** :
- Portail public : `http://localhost:5500/index.html?album=MON_SLUG`
- Panel admin   : `http://localhost:5500/admin.html`

---

## 11. Déploiement en production

### Backend — Railway

1. Créer un compte sur [railway.app](https://railway.app)
2. **New Project** → **Deploy from GitHub Repo**
3. Sélectionner le dépôt, pointer sur le dossier `backend/` dans les paramètres
4. Dans **Variables** (onglet Settings → Variables), ajouter toutes les clés (voir section 12)
5. Railway détecte automatiquement `package.json` et lance `npm start`
6. Récupérer l'URL générée (ex: `https://image-portal-production.up.railway.app`)

**Note Railway** : Le fichier `package.json` contient `"engines": { "node": ">=20.0.0" }` — Railway respecte cette contrainte.

### Frontend — Netlify

**Option A — Drag & drop** (le plus simple) :
1. Aller sur [netlify.com](https://netlify.com) → **Add new site** → **Deploy manually**
2. Glisser-déposer le dossier `frontend/` dans la zone de dépôt
3. Netlify génère une URL (ex: `https://inspiring-mango-123abc.netlify.app`)

**Option B — GitHub** :
1. Lier le dépôt GitHub
2. Définir **Base directory** = `frontend`
3. Pas de build command nécessaire (HTML/CSS/JS statique)

### Mise à jour post-déploiement obligatoire

Après avoir obtenu les deux URLs :

**1. Dans Railway** — Mettre à jour la variable :
```
FRONTEND_URL=https://votre-site.netlify.app
```

**2. Dans les fichiers frontend** — Mettre à jour `API_URL` et redéployer sur Netlify :
```javascript
// frontend/js/app.js
// frontend/js/admin.js
const API_URL = 'https://votre-app.up.railway.app';
```

---

## 12. Variables d'environnement

| Variable | Requis | Exemple | Description |
|---|---|---|---|
| `SUPABASE_URL` | Oui | `https://abc.supabase.co` | URL du projet Supabase |
| `SUPABASE_SERVICE_KEY` | Oui | `eyJhbGci...` | Clé service_role (accès total, jamais exposée) |
| `CLOUDINARY_CLOUD_NAME` | Oui | `mon-cloud` | Nom du cloud Cloudinary |
| `CLOUDINARY_API_KEY` | Oui | `123456789` | Clé API Cloudinary |
| `CLOUDINARY_API_SECRET` | Oui | `AbCdEfGh...` | Secret API Cloudinary |
| `ADMIN_PASSWORD` | Oui | `SapNmc2025!` | Mot de passe panel admin |
| `PORT` | Non | `3000` | Port d'écoute (Railway l'injecte automatiquement) |
| `FRONTEND_URL` | Oui | `https://monsite.netlify.app` | URL du frontend (pour CORS) |
| `NODE_ENV` | Non | `production` | Environnement (`development` ou `production`) |

**Important** : La clé `SUPABASE_SERVICE_KEY` est la clé `service_role`, pas la clé `anon`. Elle bypass le Row Level Security et ne doit **jamais** apparaître dans le code frontend.

---

## 13. Flux utilisateur détaillé

```
1. L'utilisateur scanne le QR code avec son smartphone
   └── Ouvre : https://monsite.netlify.app/?album=ceremonie-2026-x8k2

2. JavaScript lit l'URL : getAlbumSlug() → "ceremonie-2026-x8k2"

3. Appel GET /api/albums/ceremonie-2026-x8k2
   ├── Succès → currentAlbum = { nom, id, ... }, currentImages = [...]
   └── Échec (404) → affichage "Scannez un QR code valide"

4. Vérification localStorage.getItem('sap_user')
   ├── Présent → passer directement à l'étape 7
   └── Absent → affichage formulaire d'identification

5. L'utilisateur saisit Prénom + Nom
   ├── Validation JS : min 2 chars chacun
   └── Soumission → POST /api/visites { prenom, nom, album_id }

6. localStorage.setItem('sap_user', JSON.stringify({ prenom, nom }))

7. Affichage de la galerie
   └── renderGallery(currentImages) → grille de cards

8. L'utilisateur clique sur une photo
   └── openLightbox(url, imageId, titre)
       └── Overlay avec image haute qualité + bouton télécharger

9. L'utilisateur télécharge une photo
   └── GET /api/images/:id/download
       └── Blob reçu → <a download> créé et cliqué programmatiquement

10. L'utilisateur télécharge toutes les photos (ZIP)
    └── POST /api/images/download-zip { image_ids: [...] }
        └── Stream ZIP reçu → téléchargement déclenché
```

---

## 14. Flux administrateur détaillé

```
1. Ouverture de admin.html
   └── Vérification sessionStorage.getItem('sap_admin_pwd')
       ├── Présent → showApp() + loadAlbums()
       └── Absent → affichage écran connexion

2. Connexion
   └── POST implicite via GET /api/albums avec header x-admin-password
       ├── 401 → "Mot de passe incorrect"
       └── 200 → sessionStorage.setItem + showApp()

3. Création d'un album
   ├── Clic "+ Nouvel album" → modal
   ├── Saisie nom (requis), description, date
   └── POST /api/albums
       ├── Retourne { album, qr_code_base64, url }
       ├── Fermeture modal
       └── loadAlbums() → sidebar mise à jour

4. Sélection d'un album
   └── GET /api/albums/:id (par UUID)
       ├── En-tête mis à jour (nom, description, date)
       ├── renderAdminGallery(images)
       ├── Compteur onglet Photos mis à jour
       └── loadStats(id) → statistiques visiteurs

5. Upload de photos
   ├── Drag & drop ou clic → sélection fichiers
   ├── FileReader → preview miniatures
   ├── Clic "Uploader les photos"
   └── Boucle par batch de 5 :
       ├── FormData avec champ 'images' (max 5 fichiers) + 'album_id'
       ├── POST /api/images/upload (sans Content-Type, FormData auto)
       ├── Mise à jour barres de progression
       └── Affichage ✅/❌ sur chaque preview

6. Suppression d'une image
   ├── Bouton poubelle → confirm()
   ├── DELETE /api/images/:id
   ├── Suppression de la card du DOM
   └── loadAlbums() → compteurs sidebar mis à jour

7. QR Code
   ├── Bouton "QR Code" → modal
   ├── GET /api/albums/:id/qrcode
   ├── Affichage image + URL
   ├── "Copier le lien" → navigator.clipboard.writeText()
   └── "Télécharger PNG" → <a download> sur base64

8. Suppression d'un album
   ├── Bouton "Supprimer l'album" → confirm()
   ├── DELETE /api/albums/:id
   │   ├── Cloudinary : delete_resources([...public_ids])
   │   └── Supabase : DELETE albums WHERE id = :id (CASCADE images)
   ├── Retour à l'état "Sélectionnez un album"
   └── loadAlbums() → sidebar mise à jour

9. Déconnexion
   ├── Bouton déconnexion (icône) → logout()
   ├── sessionStorage.removeItem('sap_admin_pwd')
   └── Retour à l'écran de connexion
```

---

## 15. Gestion des erreurs

### Backend

| Scénario | Comportement |
|---|---|
| Album non trouvé | 404 + `{ "error": "Album non trouvé" }` |
| Mot de passe admin manquant/incorrect | 401 + `{ "error": "Accès non autorisé" }` |
| Fichier trop grand (>15 Mo) | 413 retourné par Multer |
| Type MIME non supporté | 400 + message Multer |
| Erreur Cloudinary upload | L'image est ignorée, ajoutée dans `errors[]` |
| Erreur Cloudinary suppression | Logged en console, suppression Supabase continue |
| Erreur Supabase | 500 + `{ "error": "Erreur interne du serveur" }` |
| Route inconnue | 404 + `{ "error": "Route non trouvée" }` |
| Exception non gérée | 500 via le handler global Express |

### Frontend — Portail public

| Scénario | Comportement |
|---|---|
| Aucun paramètre `?album=` | Affichage "Scannez un QR code valide" |
| Album inexistant (404) | Affichage "Scannez un QR code valide" |
| Erreur réseau | Affichage "Scannez un QR code valide" |
| Visite non enregistrée (erreur API) | Continuité — l'utilisateur accède quand même à la galerie |
| Aucune photo dans l'album | Message "Aucune photo disponible" |
| Erreur téléchargement | Toast rouge "Erreur lors du téléchargement" |

### Frontend — Panel admin

| Scénario | Comportement |
|---|---|
| Serveur injoignable | Toast rouge + message dans la zone login |
| Mauvais mot de passe | Message d'erreur sous le formulaire |
| Session expirée (401) | `logout()` automatique → retour à l'écran connexion |
| Erreur upload (partiel) | ❌ sur les previews échouées + toast de résumé |
| Erreur suppression album/image | Toast rouge |

---

## 16. Limites et contraintes techniques

| Limite | Valeur | Raison |
|---|---|---|
| Taille max par image | 15 Mo | Multer + limite Railway free tier |
| Formats acceptés | JPEG, PNG, WEBP, GIF | Validé côté serveur |
| Fichiers par requête upload | 20 | Multer `maxCount` |
| Images par batch d'upload | 5 | Performance / éviter timeout |
| Images par ZIP | 100 | Prévention surcharge mémoire |
| Longueur slug | 100 chars | Contrainte VARCHAR Supabase |
| Longueur nom album | 255 chars | Contrainte VARCHAR Supabase |
| Longueur prénom/nom visiteur | 100 chars | Contrainte VARCHAR Supabase |

---

## 17. Checklist de validation

### Infrastructure

- [ ] Schéma SQL exécuté sans erreur dans Supabase
- [ ] Tables `albums`, `images`, `visites` visibles dans Supabase Table Editor
- [ ] `npm install` dans `/backend` sans erreurs ni vulnérabilités critiques
- [ ] `node server.js` démarre sans erreur
- [ ] `GET /api/health` retourne `{ "status": "ok" }`

### Backend — Albums

- [ ] `POST /api/albums` crée un album avec slug généré automatiquement
- [ ] `POST /api/albums` retourne un `qr_code_base64` valide (commence par `data:image/png;base64,`)
- [ ] `GET /api/albums` retourne la liste avec `nb_images` et `nb_visites`
- [ ] `GET /api/albums/:slug` retourne l'album et ses images
- [ ] `DELETE /api/albums/:id` supprime l'album et ses images Cloudinary
- [ ] Toutes les routes admin retournent 401 sans le bon mot de passe

### Backend — Images

- [ ] `POST /api/images/upload` uploade une image → visible dans le dashboard Cloudinary
- [ ] L'image est enregistrée dans la table `images` Supabase
- [ ] `DELETE /api/images/:id` supprime l'image de Cloudinary ET de Supabase
- [ ] `GET /api/images/:id/download` déclenche un téléchargement
- [ ] `POST /api/images/download-zip` avec 2+ images retourne un fichier ZIP valide

### Backend — Visites

- [ ] `POST /api/visites` enregistre une visite dans la table `visites`
- [ ] `GET /api/visites/stats/:album_id` retourne le total et la liste des visiteurs

### Frontend — Portail public

- [ ] URL sans `?album=` → écran "Scannez un QR code valide"
- [ ] URL avec slug inexistant → écran "Scannez un QR code valide"
- [ ] URL avec slug valide → écran d'identification
- [ ] Soumission formulaire → visite enregistrée en base + accès galerie
- [ ] Rechargement de page → directement galerie (localStorage)
- [ ] Photos affichées en grille 3 colonnes (desktop)
- [ ] Clic photo → lightbox ouverte
- [ ] Fermeture lightbox (×, fond, Échap)
- [ ] Téléchargement photo individuelle fonctionnel
- [ ] Téléchargement ZIP de tout l'album fonctionnel
- [ ] Responsive mobile (iPhone 12 — 390px de large)

### Frontend — Panel admin

- [ ] Mauvais mot de passe → message d'erreur
- [ ] Bon mot de passe → accès au dashboard
- [ ] Liste des albums visible dans la sidebar
- [ ] Création d'album → apparaît dans la sidebar
- [ ] Sélection d'un album → photos et stats s'affichent
- [ ] Drag & drop de photos → previews affichées
- [ ] Upload → photos apparaissent dans la galerie
- [ ] Suppression image → card retirée de la galerie
- [ ] QR Code modal → image visible + téléchargeable
- [ ] "Copier le lien" → URL dans le presse-papier
- [ ] Suppression album → retiré de la sidebar
- [ ] Déconnexion → retour à l'écran de connexion

---

*MaPhoto-ISMGB — Développé pour le pôle SAP/NMC de l'ISMGB*
#   M a P h o t o - I S M G B  
 