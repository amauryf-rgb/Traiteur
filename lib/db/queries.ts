import { and, asc, eq, inArray } from "drizzle-orm";
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
  productCapacityRules,
  products,
  staffMembers,
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

// Détermine quelle entité juridique encaisse pour un univers de vente donné
// (cas multi-entité, ex. Boutique Sàrl vs Traiteur SA) — remonte à l'entité
// par défaut si aucune entité n'est spécifiquement rattachée à ce type
// (établissement mono-entité).
export async function getSellingEntity(establishmentId: string, orderType: OrderType) {
  const [specific] = await db
    .select()
    .from(legalEntities)
    .where(and(eq(legalEntities.establishmentId, establishmentId), eq(legalEntities.defaultOrderType, orderType)));
  if (specific) return specific;
  return getDefaultLegalEntity(establishmentId);
}

export async function getLegalEntitiesForEstablishment(establishmentId: string) {
  return db.select().from(legalEntities).where(eq(legalEntities.establishmentId, establishmentId));
}

export async function getStaffForEstablishment(establishmentId: string) {
  return db.select().from(staffMembers).where(eq(staffMembers.establishmentId, establishmentId));
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

export async function getStaffMemberByAccessCode(accessCode: string) {
  const [staff] = await db.select().from(staffMembers).where(eq(staffMembers.accessCode, accessCode));
  return staff ?? null;
}

export type OrderWithItems = typeof orders.$inferSelect & {
  items: (typeof orderItems.$inferSelect)[];
};

export async function getOrdersForDate(establishmentId: string, date: string): Promise<OrderWithItems[]> {
  const dayOrders = await db
    .select()
    .from(orders)
    .where(and(eq(orders.establishmentId, establishmentId), eq(orders.pickupDate, date)))
    .orderBy(asc(orders.pickupTime));

  if (dayOrders.length === 0) return [];

  const items = await db
    .select()
    .from(orderItems)
    .where(
      inArray(
        orderItems.orderId,
        dayOrders.map((o) => o.id)
      )
    );

  return dayOrders.map((order) => ({ ...order, items: items.filter((i) => i.orderId === order.id) }));
}

export async function getCapacityRulesForProducts(productIds: string[]) {
  if (productIds.length === 0) return [];
  return db.select().from(productCapacityRules).where(inArray(productCapacityRules.productId, productIds));
}

export async function getCategoriesForEstablishment(establishmentId: string) {
  return db.select().from(categories).where(eq(categories.establishmentId, establishmentId)).orderBy(asc(categories.sortOrder));
}

export async function getAllergensForEstablishment(establishmentId: string) {
  return db.select().from(allergens).where(eq(allergens.establishmentId, establishmentId));
}

export type ManagedProduct = {
  id: string;
  name: string;
  description: string | null;
  priceAmount: string;
  categoryId: string | null;
  categoryName: string | null;
  photoUrl: string | null;
  isActive: boolean;
  availableBoutique: boolean;
  availableTraiteur: boolean;
  allergenIds: string[];
  perDayMax: number | null;
  perSlotMax: number | null;
  alertThresholdPct: number;
};

// Tous les produits de l'établissement (actifs et inactifs) — vue de gestion,
// à distinguer de getCatalogueProducts qui ne montre que ce qui est vendable
// côté client.
export async function getManagedProducts(establishmentId: string): Promise<ManagedProduct[]> {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      priceAmount: products.priceAmount,
      categoryId: products.categoryId,
      categoryName: categories.name,
      photoUrl: products.photoUrl,
      isActive: products.isActive,
      availableBoutique: products.availableBoutique,
      availableTraiteur: products.availableTraiteur,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.establishmentId, establishmentId))
    .orderBy(asc(categories.sortOrder), asc(products.name));

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const [allergenRows, rules] = await Promise.all([
    db.select({ productId: productAllergens.productId, allergenId: productAllergens.allergenId }).from(productAllergens).where(inArray(productAllergens.productId, ids)),
    db.select().from(productCapacityRules).where(inArray(productCapacityRules.productId, ids)),
  ]);

  const allergensByProduct = new Map<string, string[]>();
  for (const row of allergenRows) {
    const list = allergensByProduct.get(row.productId) ?? [];
    list.push(row.allergenId);
    allergensByProduct.set(row.productId, list);
  }

  const rulesByProduct = new Map<string, { perDayMax: number | null; perSlotMax: number | null; alertThresholdPct: number }>();
  for (const rule of rules) {
    const entry = rulesByProduct.get(rule.productId) ?? { perDayMax: null, perSlotMax: null, alertThresholdPct: 80 };
    if (rule.scope === "per_day") entry.perDayMax = rule.maxQuantity;
    if (rule.scope === "per_slot") entry.perSlotMax = rule.maxQuantity;
    entry.alertThresholdPct = rule.alertThresholdPct;
    rulesByProduct.set(rule.productId, entry);
  }

  return rows.map((row) => ({
    ...row,
    allergenIds: allergensByProduct.get(row.id) ?? [],
    perDayMax: rulesByProduct.get(row.id)?.perDayMax ?? null,
    perSlotMax: rulesByProduct.get(row.id)?.perSlotMax ?? null,
    alertThresholdPct: rulesByProduct.get(row.id)?.alertThresholdPct ?? 80,
  }));
}

export async function getManagedProductById(establishmentId: string, productId: string): Promise<ManagedProduct | null> {
  const all = await getManagedProducts(establishmentId);
  return all.find((p) => p.id === productId) ?? null;
}
