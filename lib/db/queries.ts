import { and, eq, inArray } from "drizzle-orm";
import { db } from "./index";
import {
  allergens,
  categories,
  establishments,
  legalEntities,
  orderItems,
  orders,
  paymentAccounts,
  productAllergens,
  products,
} from "./schema";
import type { OrderType } from "../types";

export async function getEstablishmentBySlug(slug: string) {
  const [establishment] = await db.select().from(establishments).where(eq(establishments.slug, slug));
  return establishment ?? null;
}

export async function getDefaultLegalEntity(establishmentId: string) {
  const [entity] = await db
    .select()
    .from(legalEntities)
    .where(and(eq(legalEntities.establishmentId, establishmentId), eq(legalEntities.isDefault, true)));
  return entity ?? null;
}

export async function getPaymentAccountForEntity(legalEntityId: string) {
  const [account] = await db.select().from(paymentAccounts).where(eq(paymentAccounts.legalEntityId, legalEntityId));
  return account ?? null;
}

export type CatalogueProduct = {
  id: string;
  name: string;
  description: string | null;
  priceAmount: string;
  currency: string;
  photoUrl: string | null;
  categoryName: string | null;
  allergens: string[];
};

export async function getCatalogueProducts(
  establishmentId: string,
  orderType: OrderType
): Promise<CatalogueProduct[]> {
  const availabilityColumn = orderType === "boutique" ? products.availableBoutique : products.availableTraiteur;

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      priceAmount: products.priceAmount,
      currency: products.currency,
      photoUrl: products.photoUrl,
      categoryName: categories.name,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.establishmentId, establishmentId), eq(products.isActive, true), eq(availabilityColumn, true)));

  if (rows.length === 0) return [];

  const allergenRows = await db
    .select({ productId: productAllergens.productId, label: allergens.label })
    .from(productAllergens)
    .innerJoin(allergens, eq(productAllergens.allergenId, allergens.id))
    .where(
      inArray(
        productAllergens.productId,
        rows.map((r) => r.id)
      )
    );

  const allergensByProduct = new Map<string, string[]>();
  for (const row of allergenRows) {
    const list = allergensByProduct.get(row.productId) ?? [];
    list.push(row.label);
    allergensByProduct.set(row.productId, list);
  }

  return rows.map((row) => ({ ...row, allergens: allergensByProduct.get(row.id) ?? [] }));
}

export async function getOrderWithItems(orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return null;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  return { order, items };
}
