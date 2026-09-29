"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { establishments } from "@/lib/db/schema";
import { requireStaffTenantContext, runAsTenant, type TenantContext } from "@/lib/tenant";
import { establishmentMediaKeyFromUrl, getEstablishmentMediaStore, ESTABLISHMENT_MEDIA_ROUTE_PREFIX } from "@/lib/blobs";

export type IdentityFormState = { error?: string };

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

  await runAsTenant(context, (tx) =>
    tx.update(establishments).set({ logoUrl: logoResult.url, bannerUrl: bannerResult.url }).where(eq(establishments.id, establishmentId))
  );

  revalidatePath(`/${slug}/pro/etablissement`);
  // Logo/bandeau apparaissent aussi côté client : écran de choix (bannerUrl)
  // et catalogue des deux univers (logoUrl, voir CatalogueHeader).
  revalidatePath(`/${slug}`);
  revalidatePath(`/${slug}/boutique`);
  revalidatePath(`/${slug}/traiteur`);
  return {};
}
