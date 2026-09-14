# Traiteur App — projet de départ

Base de code initiale : Next.js 16 (TypeScript, Tailwind, App Router) + Drizzle ORM (PostgreSQL).

## Ce qui fonctionne déjà (testé)

- Schéma complet (19 tables) dans `lib/db/schema.ts`, migré avec succès sur PostgreSQL
- Script de seed (`lib/db/seed.ts`) qui crée LabTraiteur Da Michele avec 2 produits
- Route API `GET /api/establishments/[slug]/products`
- Page catalogue `app/[slug]/page.tsx` — testée avec `/labtraiteur`, affiche les vrais
  produits depuis la base, avec la couleur de marque appliquée

## Démarrer en local

1. Avoir PostgreSQL installé et lancé sur ta machine (ou un service managé
   type Neon/Supabase — copie l'URL de connexion dans ce cas)
2. Copier `.env.example` en `.env` et ajuster `DATABASE_URL`
3. Installer les dépendances :
   ```
   npm install
   ```
4. Créer les tables :
   ```
   npx drizzle-kit generate
   npx drizzle-kit migrate
   ```
5. Peupler avec les données de test :
   ```
   npx tsx lib/db/seed.ts
   ```
6. Lancer le serveur de développement :
   ```
   npm run dev
   ```
7. Ouvrir http://localhost:3000/labtraiteur

## Note sur les polices (Geist)

Le layout n'utilise plus `next/font/google` (Geist) car l'environnement de
développement utilisé pour construire ce projet n'avait pas accès à
fonts.googleapis.com. Ça n'a aucune importance sur ta machine ou en
production — tu peux réactiver Geist dans `app/layout.tsx` si tu veux, ou
choisir une police auto-hébergée.

## Prochaines étapes suggérées

- Écran de commande client complet (panier, créneaux, réservation de
  capacité atomique — voir `capacity_reservations` dans le schéma)
- Intégration paiement (Stripe Connect Standard et/ou PSP suisse à
  Split Payment — voir `payment_accounts`, volontairement abstrait du PSP)
- Dashboard professionnel (planning, répartition des tâches)
- Authentification (propriétaire/employé — voir `staff_members.access_code`
  pour l'accès allégé employé)

Voir `schema.sql` (transmis séparément) pour le détail de chaque table et
les décisions produit associées.
