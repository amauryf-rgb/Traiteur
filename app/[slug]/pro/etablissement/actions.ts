"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { establishments, legalEntities } from "@/lib/db/schema";
import { getStaffLegalEntityId } from "@/lib/db/queries";
import { requireStaffTenantContext, runAsTenant, type TenantContext } from "@/lib/tenant";
import { establishmentMediaKeyFromUrl, getEstablishmentMediaStore, ESTABLISHMENT_MEDIA_ROUTE_PREFIX } from "@/lib/blobs";

export type IdentityFormState = { error?: string };
export type BillingProfileState = { error?: string };

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

async function requireOwner(slug: string): Promise<{ establishmentId: string; context: TenantContext }> {
  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant || staffTenant.session.role !== "owner") {
    redirect(`/${slug}/pro/login`);
  }
  return { establishmentId: staffTenant.session.establishmentId, context: staffTenant.context };
}

// Cloisonnement Richard/boutique, Michele/traiteur — même principe que
// Fermetures et Dossier (allowedEntityId vient de staff_members.legal_entity_id,
// jamais d'un champ de formulaire) : un owner scopé ne doit ni voir ni
// modifier les coordonnées de facturation de l'autre entité, contrairement à
// Équipe qui reste volontairement établissement-large.
async function requireOwnerForEntity(
  slug: string,
  entityId: string
): Promise<{ establishmentId: string; context: TenantContext }> {
  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant || staffTenant.session.role !== "owner") {
    redirect(`/${slug}/pro/login`);
  }
  const { establishmentId, context } = { establishmentId: staffTenant.session.establishmentId, context: staffTenant.context };
  const allowedEntityId = await runAsTenant(context, (tx) => getStaffLegalEntityId(tx, staffTenant.session.staffMemberId));
  if (allowedEntityId && allowedEntityId !== entityId) {
    throw new Error("Cette entité n'est pas gérée par ce compte.");
  }
  return { establishmentId, context };
}

// Même logique que resolvePhotoUrl (app/[slug]/pro/catalogue/actions.ts),
// dupliquée plutôt que partagée : un fichier "use server" ne peut exporter
// que des fonctions async, pas les constantes de type/taille qui vont avec.
async function resolveImageUrl(
  formData: FormData,
  fieldName: string,
  removeFieldName: string,
  currentUrl: string | null
): Promise<{ url: string | null } | { error: string }> {
  const removeRequested = formData.get(removeFieldName) === "on";
  const file = formData.get(fieldName);
  const hasNewFile = file instanceof File && file.size > 0;

  if (!hasNewFile && !removeRequested) {
    return { url: currentUrl };
  }

  const store = getEstablishmentMediaStore();
  const oldKey = establishmentMediaKeyFromUrl(currentUrl);

  if (hasNewFile) {
    const extension = ALLOWED_IMAGE_TYPES[file.type];
    if (!extension) return { error: "Format d'image non supporté (JPEG, PNG ou WebP uniquement)." };
    if (file.size > MAX_IMAGE_BYTES) return { error: "Image trop volumineuse (5 Mo maximum)." };

    const key = `${randomUUID()}.${extension}`;
    await store.set(key, await file.arrayBuffer(), { metadata: { contentType: file.type } });
    if (oldKey) await store.delete(oldKey);
    return { url: `${ESTABLISHMENT_MEDIA_ROUTE_PREFIX}${key}` };
  }

  if (oldKey) await store.delete(oldKey);
  return { url: null };
}

// Un seul formulaire, deux images indépendantes : chacune n'est remplacée
// que si un nouveau fichier est fourni ou sa suppression cochée pour ELLE,
// jamais affectée par ce qui se passe sur l'autre champ.
export async function updateEstablishmentIdentity(
  slug: string,
  currentLogoUrl: string | null,
  currentBannerUrl: string | null,
  _prevState: IdentityFormState,
  formData: FormData
): Promise<IdentityFormState> {
  const { establishmentId, context } = await requireOwner(slug);

  const logoResult = await resolveImageUrl(formData, "logo", "removeLogo", currentLogoUrl);
  if ("error" in logoResult) return { error: logoResult.error };

  const bannerResult = await resolveImageUrl(formData, "banner", "removeBanner", currentBannerUrl);
  if ("error" in bannerResult) return { error: bannerResult.error };

  // Forfait de livraison traiteur — un seul montant par établissement (voir
  // lib/db/schema.ts#deliveryFeeDefault) : vide = pas de livraison proposée
  // tant que Michele ne l'a pas configuré.
  const deliveryFeeRaw = String(formData.get("deliveryFeeDefault") ?? "").trim();
  let deliveryFeeDefault: string | null = null;
  if (deliveryFeeRaw) {
    const parsed = Number(deliveryFeeRaw.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) return { error: "Le forfait de livraison doit être un nombre positif." };
    deliveryFeeDefault = parsed.toFixed(2);
  }

  await runAsTenant(context, (tx) =>
    tx
      .update(establishments)
      .set({ logoUrl: logoResult.url, bannerUrl: bannerResult.url, deliveryFeeDefault })
      .where(eq(establishments.id, establishmentId))
  );

  revalidatePath(`/${slug}/pro/etablissement`);
  // Logo/bandeau apparaissent aussi côté client : écran de choix (bannerUrl)
  // et catalogue des deux univers (logoUrl, voir CatalogueHeader).
  revalidatePath(`/${slug}`);
  revalidatePath(`/${slug}/boutique`);
  revalidatePath(`/${slug}/traiteur`);
  return {};
}

// Déplacé depuis facturation/actions.ts : ces coordonnées ne servent pas
// qu'aux factures inter-entités, elles apparaissent aussi sur les factures
// clients (voir lib/pdf/ClientInvoiceDocument.tsx) — leur place naturelle est
// l'identité de l'établissement, pas un écran de facturation particulier.
export async function updateEntityBillingProfile(
  slug: string,
  entityId: string,
  _prevState: BillingProfileState,
  formData: FormData
): Promise<BillingProfileState> {
  const { context } = await requireOwnerForEntity(slug, entityId);

  const vatNumber = String(formData.get("vatNumber") ?? "").trim();
  const addressLine1 = String(formData.get("addressLine1") ?? "").trim();
  const addressLine2 = String(formData.get("addressLine2") ?? "").trim();
  const addressPostalCode = String(formData.get("addressPostalCode") ?? "").trim();
  const addressCity = String(formData.get("addressCity") ?? "").trim();
  const addressCountry = String(formData.get("addressCountry") ?? "").trim();
  const ibanNumber = String(formData.get("ibanNumber") ?? "").trim();
  const bankName = String(formData.get("bankName") ?? "").trim();

  const updated = await runAsTenant(context, (tx) =>
    tx
      .update(legalEntities)
      .set({
        vatNumber: vatNumber || null,
        addressLine1: addressLine1 || null,
        addressLine2: addressLine2 || null,
        addressPostalCode: addressPostalCode || null,
        addressCity: addressCity || null,
        addressCountry: addressCountry || null,
        ibanNumber: ibanNumber || null,
        bankName: bankName || null,
      })
      .where(eq(legalEntities.id, entityId))
      .returning({ id: legalEntities.id })
  );

  if (updated.length === 0) return { error: "Entité introuvable." };

  revalidatePath(`/${slug}/pro/etablissement`);
  return {};
}
