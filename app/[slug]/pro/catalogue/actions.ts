"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, productAllergens, productCapacityRules, products } from "@/lib/db/schema";
import { getStaffSession } from "@/lib/auth";
import { getEstablishmentBySlug } from "@/lib/db/queries";

export type ProductFormState = { error?: string };

async function requireManager(slug: string) {
  const session = await getStaffSession();
  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment || !session || session.establishmentId !== establishment.id || session.role === "employee") {
    redirect(`/${slug}/pro/login`);
  }
  return establishment!;
}

async function resolveCategoryId(establishmentId: string, categoryName: string): Promise<string | null> {
  const name = categoryName.trim();
  if (!name) return null;

  const [existing] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.establishmentId, establishmentId), eq(categories.name, name)));
  if (existing) return existing.id;

  const [created] = await db.insert(categories).values({ establishmentId, name, sortOrder: 0 }).returning();
  return created.id;
}

async function syncCapacityRule(productId: string, scope: "per_day" | "per_slot", max: number | null, alertThresholdPct: number) {
  if (max === null || max <= 0) {
    await db
      .delete(productCapacityRules)
      .where(and(eq(productCapacityRules.productId, productId), eq(productCapacityRules.scope, scope)));
    return;
  }

  await db
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
  const establishment = await requireManager(slug);

  const name = String(formData.get("name") ?? "").trim();
  const priceAmount = String(formData.get("priceAmount") ?? "").trim();
  if (!name) return { error: "Merci d'indiquer un nom." };
  const price = Number(priceAmount);
  if (!Number.isFinite(price) || price < 0) return { error: "Prix invalide." };

  const description = String(formData.get("description") ?? "").trim() || null;
  const categoryId = await resolveCategoryId(establishment.id, String(formData.get("categoryName") ?? ""));
  const isActive = formData.get("isActive") === "on";
  const availableBoutique = formData.get("availableBoutique") === "on";
  const availableTraiteur = formData.get("availableTraiteur") === "on";
  const allergenIds = formData.getAll("allergenIds").map(String);
  const perDayMax = parseOptionalInt(formData, "perDayMax");
  const perSlotMax = parseOptionalInt(formData, "perSlotMax");
  const alertThresholdPct = parseOptionalInt(formData, "alertThresholdPct") ?? 80;

  const values = {
    name,
    priceAmount: price.toFixed(2),
    description,
    categoryId,
    isActive,
    availableBoutique,
    availableTraiteur,
  };

  let id = productId;
  if (id) {
    const [existing] = await db.select().from(products).where(and(eq(products.id, id), eq(products.establishmentId, establishment.id)));
    if (!existing) return { error: "Produit introuvable." };
    await db.update(products).set({ ...values, updatedAt: new Date() }).where(eq(products.id, id));
  } else {
    const [created] = await db
      .insert(products)
      .values({ ...values, establishmentId: establishment.id })
      .returning({ id: products.id });
    id = created.id;
  }

  await db.delete(productAllergens).where(eq(productAllergens.productId, id));
  if (allergenIds.length > 0) {
    await db.insert(productAllergens).values(allergenIds.map((allergenId) => ({ productId: id!, allergenId })));
  }

  await syncCapacityRule(id, "per_day", perDayMax, alertThresholdPct);
  await syncCapacityRule(id, "per_slot", perSlotMax, alertThresholdPct);

  revalidatePath(`/${slug}/pro/catalogue`);
  redirect(`/${slug}/pro/catalogue`);
}

export async function toggleActive(slug: string, productId: string, currentActive: boolean) {
  const establishment = await requireManager(slug);
  await db
    .update(products)
    .set({ isActive: !currentActive, updatedAt: new Date() })
    .where(and(eq(products.id, productId), eq(products.establishmentId, establishment.id)));
  revalidatePath(`/${slug}/pro/catalogue`);
}
