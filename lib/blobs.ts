import { getStore } from "@netlify/blobs";

// Stockage des photos produit — Netlify Blobs, déjà disponible sans compte
// tiers puisque l'app est hébergée sur Netlify (le contexte est injecté
// automatiquement dans les déploiements Netlify ; en dev local pur, sans
// `netlify dev`, ce store n'est pas accessible).
export function getProductPhotoStore() {
  return getStore({ name: "product-photos", consistency: "strong" });
}

export const PRODUCT_PHOTO_ROUTE_PREFIX = "/api/product-photo/";

export function productPhotoKeyFromUrl(url: string | null): string | null {
  if (!url || !url.startsWith(PRODUCT_PHOTO_ROUTE_PREFIX)) return null;
  return url.slice(PRODUCT_PHOTO_ROUTE_PREFIX.length);
}
