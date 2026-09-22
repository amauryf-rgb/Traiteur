"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { categories, productAllergens, productCapacityRules, products } from "@/lib/db/schema";
import { requireStaffTenantContext, runAsTenant, type Tx, type TenantContext } from "@/lib/tenant";
import { getProductPhotoStore, productPhotoKeyFromUrl, PRODUCT_PHOTO_ROUTE_PREFIX } from "@/lib/blobs";

export type ProductFormState = { error?: string };

const ALLOWED_PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

// Remplace la photo existante d'un produit : upload la nouvelle (si fournie),
// supprime l'ancienne du store si elle provient de ce même mécanisme (pas de
// fuite de blobs orphelins), et retourne la nouvelle URL à stocker en base.
// `null` = pas de changement (garder la photo actuelle) ; `""` = suppression demandée.
async function resolvePhotoUrl(formData: FormData, currentPhotoUrl: string | null): Promise<{ url: string | null } | { error: string }> {
  const removeRequested = formData.get("removePhoto") === "on";
  const photo = formData.get("photo");
  const hasNewFile = photo instanceof File && photo.size > 0;

  if (!hasNewFile && !removeRequested) {
    return { url: currentPhotoUrl };
  }

  const store = getProductPhotoStore();
  const oldKey = productPhotoKeyFromUrl(currentPhotoUrl);

  if (hasNewFile) {
    const file = photo as File;
    const extension = ALLOWED_PHOTO_TYPES[file.type];
    if (!extension) return { error: "Format de photo non supporté (JPEG, PNG ou WebP uniquement)." };
    if (file.size > MAX_PHOTO_BYTES) return { error: "Photo trop volumineuse (5 Mo maximum)." };

    const key = `${randomUUID()}.${extension}`;
    await store.set(key, await file.arrayBuffer(), { metadata: { contentType: file.type } });
    if (oldKey) await store.delete(oldKey);
    return { url: `${PRODUCT_PHOTO_ROUTE_PREFIX}${key}` };
  }

  if (oldKey) await store.delete(oldKey);
  return { url: null };
}

async function requireManager(slug: string): Promise<{ establishmentId: string; context: TenantContext }> {
  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant || staffTenant.session.role === "employee") {
    redirect(`/${slug}/pro/login`);
  }
  return { establishmentId: staffTenant.session.establishmentId, context: staffTenant.context };
}

async function resolveCategoryId(tx: Tx, establishmentId: string, categoryName: string): Promise<string | null> {
  const name = categoryName.trim();
  if (!name) return null;

  const [existing] = await tx
    .select()
    .from(categories)
    .where(and(eq(categories.establishmentId, establishmentId), eq(categories.name, name)));
  if (existing) return existing.id;

  const [created] = await tx.insert(categories).values({ establishmentId, name, sortOrder: 0 }).returning();
  return created.id;
}

async function syncCapacityRule(tx: Tx, productId: string, scope: "per_day" | "per_slot", max: number | null, alertThresholdPct: number) {
  if (max === null || max <= 0) {
    await tx
      .delete(productCapacityRules)
      .where(and(eq(productCapacityRules.productId, productId), eq(productCapacityRules.scope, scope)));
    return;
  }

  await tx
    .insert(productCapacityRules)
    .values({ productId, scope, maxQuantity: max, alertThresholdPct })
    .onConflictDoUpdate({
      target: [productCapacityRules.productId, productCapacityRules.scope],
      set: { maxQuantity: max, alertThresholdPct },
    });
}

function parseOptionalInt(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.trunc(value) : null;
}

export async function saveProduct(
  slug: string,
  productId: string | null,
  _prevState: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const { establishmentId, context } = await requireManager(slug);

  const name = String(formData.get("name") ?? "").trim();
  const priceAmount = String(formData.get("priceAmount") ?? "").trim();
  if (!name) return { error: "Merci d'indiquer un nom." };
  const price = Number(priceAmount);
  if (!Number.isFinite(price) || price < 0) return { error: "Prix invalide." };

  const description = String(formData.get("description") ?? "").trim() || null;
  const sectionTitle = String(formData.get("sectionTitle") ?? "").trim() || null;
  const isActive = formData.get("isActive") === "on";
  const availableBoutique = formData.get("availableBoutique") === "on";
  const availableTraiteur = formData.get("availableTraiteur") === "on";
  const allergenIds = formData.getAll("allergenIds").map(String);
  const perDayMax = parseOptionalInt(formData, "perDayMax");
  const perSlotMax = parseOptionalInt(formData, "perSlotMax");
  const alertThresholdPct = parseOptionalInt(formData, "alertThresholdPct") ?? 80;

  const result = await runAsTenant(context, async (tx) => {
    const categoryId = await resolveCategoryId(tx, establishmentId, String(formData.get("categoryName") ?? ""));

    let id = productId;
    let currentPhotoUrl: string | null = null;
    if (id) {
      const [existing] = await tx.select().from(products).where(and(eq(products.id, id), eq(products.establishmentId, establishmentId)));
      if (!existing) return { error: "Produit introuvable." } as ProductFormState;
      currentPhotoUrl = existing.photoUrl;
    }

    const photoResult = await resolvePhotoUrl(formData, currentPhotoUrl);
    if ("error" in photoResult) return { error: photoResult.error } as ProductFormState;

    const values = {
      name,
      priceAmount: price.toFixed(2),
      description,
      sectionTitle,
      photoUrl: photoResult.url,
      categoryId,
      isActive,
      availableBoutique,
      availableTraiteur,
    };

    if (id) {
      await tx.update(products).set({ ...values, updatedAt: new Date() }).where(eq(products.id, id));
    } else {
      const [created] = await tx
        .insert(products)
        .values({ ...values, establishmentId })
        .returning({ id: products.id });
      id = created.id;
    }

    await tx.delete(productAllergens).where(eq(productAllergens.productId, id));
    if (allergenIds.length > 0) {
      await tx.insert(productAllergens).values(allergenIds.map((allergenId) => ({ productId: id!, allergenId })));
    }

    await syncCapacityRule(tx, id, "per_day", perDayMax, alertThresholdPct);
    await syncCapacityRule(tx, id, "per_slot", perSlotMax, alertThresholdPct);

    return null;
  });

  if (result?.error) return result;

  revalidatePath(`/${slug}/pro/catalogue`);
  redirect(`/${slug}/pro/catalogue`);
}

export async function toggleActive(slug: string, productId: string, currentActive: boolean) {
  const { establishmentId, context } = await requireManager(slug);
  const updated = await runAsTenant(context, (tx) =>
    tx
      .update(products)
      .set({ isActive: !currentActive, updatedAt: new Date() })
      .where(and(eq(products.id, productId), eq(products.establishmentId, establishmentId)))
      .returning({ id: products.id })
  );
  if (updated.length === 0) {
    throw new Error("Produit introuvable ou n'appartenant pas à cet établissement.");
  }
  revalidatePath(`/${slug}/pro/catalogue`);
}
