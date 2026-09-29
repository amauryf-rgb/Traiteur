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

// Même mécanisme, store séparé — scans de factures d'achat (photo ou PDF,
// contrairement à une photo produit qui n'est jamais un PDF).
export function getPurchaseInvoiceScanStore() {
  return getStore({ name: "purchase-invoice-scans", consistency: "strong" });
}

export const PURCHASE_INVOICE_SCAN_ROUTE_PREFIX = "/api/purchase-invoice-scan/";

// Logo + bandeau photo de l'établissement (identité visuelle, /pro/etablissement)
// — store séparé des photos produit, même si le mécanisme est identique, pour
// ne jamais mélanger les deux familles de blobs.
export function getEstablishmentMediaStore() {
  return getStore({ name: "establishment-media", consistency: "strong" });
}

export const ESTABLISHMENT_MEDIA_ROUTE_PREFIX = "/api/establishment-media/";

export function establishmentMediaKeyFromUrl(url: string | null): string | null {
  if (!url || !url.startsWith(ESTABLISHMENT_MEDIA_ROUTE_PREFIX)) return null;
  return url.slice(ESTABLISHMENT_MEDIA_ROUTE_PREFIX.length);
}
