import { cache } from "react";
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, lte, ne, sql } from "drizzle-orm";
import { db } from "./index";
import type { Tx } from "../tenant";
import {
  allergens,
  capacityReservations,
  categories,
  clients,
  establishmentClosures,
  establishments,
  interEntityInvoiceLines,
  interEntityInvoices,
  legalEntities,
  clientInvoices,
  loginAttempts,
  orderItems,
  orders,
  paymentAccounts,
  platformAdmins,
  productAllergens,
  productCapacityRules,
  productionLots,
  products,
  purchaseInvoices,
  staffMembers,
} from "./schema";
import type { OrderType } from "../types";

// Seule fonction de ce fichier qui n'a pas besoin d'un tx tenant-scopé :
// establishments n'a volontairement aucune policy RLS (il faut pouvoir
// résoudre un slug en establishment_id avant même de connaître un tenant
// courant). Utilisée pour amorcer le contexte, jamais pour lire des
// données protégées.
//
// React.cache() : dédoublonne les appels avec le même slug au sein d'une
// même passe de rendu (une requête) — Drizzle n'est pas du fetch(), donc
// pas de mémoïsation automatique comme documentée dans le guide caching de
// Next.js. Plusieurs endroits du rendu d'une même page (ex. getPublicTenantContext
// et getClientTenantContext sur le catalogue client) appellent cette fonction avec
// le même slug ; sans ce cache, chacun déclenchait un aller-retour base
// séparé pour la même ligne.
export const getEstablishmentBySlug = cache(async (slug: string) => {
  const [establishment] = await db.select().from(establishments).where(eq(establishments.slug, slug));
  return establishment ?? null;
});

// platform_admins n'a lui non plus aucune policy RLS (schema.sql, section
// 12) : c'est cette table qui détermine qui a le droit de tout voir, elle
// ne peut donc pas dépendre elle-même d'un tenant courant.
export async function getPlatformAdminCount(): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(platformAdmins);
  return row.count;
}

export async function getPlatformAdminByEmail(email: string) {
  const [admin] = await db.select().from(platformAdmins).where(eq(platformAdmins.email, email));
  return admin ?? null;
}

export async function setPlatformAdminPasswordResetToken(id: string, tokenHash: string, expiresAt: Date) {
  await db.update(platformAdmins).set({ passwordResetTokenHash: tokenHash, passwordResetExpiresAt: expiresAt }).where(eq(platformAdmins.id, id));
}

export async function getPlatformAdminByResetTokenHash(tokenHash: string) {
  const [admin] = await db.select().from(platformAdmins).where(eq(platformAdmins.passwordResetTokenHash, tokenHash));
  return admin ?? null;
}

// Appelée après un reset réussi (jeton consommé) ou pour invalider un jeton
// en cours sans en émettre un nouveau — jamais appelée pour un jeton déjà NULL.
export async function clearPlatformAdminPasswordResetToken(id: string) {
  await db.update(platformAdmins).set({ passwordResetTokenHash: null, passwordResetExpiresAt: null }).where(eq(platformAdmins.id, id));
}

export async function updatePlatformAdminPassword(id: string, passwordHash: string) {
  await db.update(platformAdmins).set({ passwordHash }).where(eq(platformAdmins.id, id));
}

export type PlatformEstablishmentSummary = {
  id: string;
  name: string;
  slug: string;
  onboardingStatus: string;
  orderCount: number;
  revenue: string;
  clientCount: number;
  // Un établissement peut avoir plusieurs owners (ex. LabTraiteur : Michele
  // pour l'entité Traiteur SA, Richard pour la Boutique Sàrl — un par
  // entité juridique, voir lib/db/seed.ts) : n'en retenir qu'un seul serait
  // trompeur, donc la liste complète, pas un accès unique.
  owners: { name: string; accessCode: string | null }[];
};

// Lecture cross-tenant — n'a de sens que sous un tx ouvert avec
// isPlatformAdmin=true (voir requirePlatformAdminContext), seul cas où les
// policies RLS de orders/clients/staff_members laissent passer des lignes
// de plusieurs établissements à la fois.
export async function getPlatformEstablishmentSummaries(tx: Tx): Promise<PlatformEstablishmentSummary[]> {
  const allEstablishments = await tx
    .select({ id: establishments.id, name: establishments.name, slug: establishments.slug, onboardingStatus: establishments.onboardingStatus })
    .from(establishments)
    .orderBy(asc(establishments.name));

  const orderStats = await tx
    .select({
      establishmentId: orders.establishmentId,
      orderCount: sql<number>`count(*)::int`,
      revenue: sql<string>`coalesce(sum(${orders.totalAmount}), 0)`,
    })
    .from(orders)
    .where(ne(orders.status, "cancelled"))
    .groupBy(orders.establishmentId);
  const orderStatsById = new Map(orderStats.map((row) => [row.establishmentId, row]));

  const clientCounts = await tx
    .select({ establishmentId: clients.establishmentId, count: sql<number>`count(*)::int` })
    .from(clients)
    .groupBy(clients.establishmentId);
  const clientCountById = new Map(clientCounts.map((row) => [row.establishmentId, row.count]));

  const owners = await tx
    .select({ establishmentId: staffMembers.establishmentId, name: staffMembers.name, accessCode: staffMembers.accessCode })
    .from(staffMembers)
    .where(eq(staffMembers.role, "owner"))
    .orderBy(asc(staffMembers.createdAt));
  const ownersById = new Map<string, { name: string; accessCode: string | null }[]>();
  for (const owner of owners) {
    const list = ownersById.get(owner.establishmentId) ?? [];
    list.push({ name: owner.name, accessCode: owner.accessCode });
    ownersById.set(owner.establishmentId, list);
  }

  return allEstablishments.map((establishment) => ({
    ...establishment,
    orderCount: orderStatsById.get(establishment.id)?.orderCount ?? 0,
    revenue: orderStatsById.get(establishment.id)?.revenue ?? "0",
    clientCount: clientCountById.get(establishment.id) ?? 0,
    owners: ownersById.get(establishment.id) ?? [],
  }));
}

export async function getDefaultLegalEntity(tx: Tx, establishmentId: string) {
  const [entity] = await tx
    .select()
    .from(legalEntities)
    .where(and(eq(legalEntities.establishmentId, establishmentId), eq(legalEntities.isDefault, true)));
  return entity ?? null;
}

// Détermine quelle entité juridique encaisse pour un univers de vente donné
// (cas multi-entité, ex. Boutique Sàrl vs Traiteur SA) — remonte à l'entité
// par défaut si aucune entité n'est spécifiquement rattachée à ce type
// (établissement mono-entité).
export async function getSellingEntity(tx: Tx, establishmentId: string, orderType: OrderType) {
  const [specific] = await tx
    .select()
    .from(legalEntities)
    .where(and(eq(legalEntities.establishmentId, establishmentId), eq(legalEntities.defaultOrderType, orderType)));
  if (specific) return specific;
  return getDefaultLegalEntity(tx, establishmentId);
}

export async function getLegalEntitiesForEstablishment(tx: Tx, establishmentId: string) {
  return tx.select().from(legalEntities).where(eq(legalEntities.establishmentId, establishmentId));
}

export async function getStaffForEstablishment(tx: Tx, establishmentId: string) {
  return tx.select().from(staffMembers).where(eq(staffMembers.establishmentId, establishmentId));
}

export async function getStaffMemberById(tx: Tx, staffMemberId: string) {
  const [staff] = await tx.select().from(staffMembers).where(eq(staffMembers.id, staffMemberId));
  return staff ?? null;
}

// Univers (traiteur/boutique) auquel ce membre du staff est rattaché, via
// l'entité juridique par défaut de son entité — ex. Richard (Boutique Sàrl)
// → "boutique", Michele (Traiteur SA) → "traiteur". Retourne null si le
// membre n'a pas d'entité, ou si son entité gère les deux univers
// (defaultOrderType NULL, cas mono-entité) : dans ce cas, aucun filtrage à
// appliquer côté planning — voir DayViewSection dans app/[slug]/pro/page.tsx.
export async function getStaffOrderTypeScope(tx: Tx, staffMemberId: string): Promise<OrderType | null> {
  const [row] = await tx
    .select({ orderType: legalEntities.defaultOrderType })
    .from(staffMembers)
    .leftJoin(legalEntities, eq(staffMembers.legalEntityId, legalEntities.id))
    .where(eq(staffMembers.id, staffMemberId));
  return (row?.orderType as OrderType | null) ?? null;
}

export async function getPaymentAccountForEntity(tx: Tx, legalEntityId: string) {
  const [account] = await tx.select().from(paymentAccounts).where(eq(paymentAccounts.legalEntityId, legalEntityId));
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
  categorySortOrder: number | null;
  sectionTitle: string | null;
  allergens: string[];
};

export async function getCatalogueProducts(
  tx: Tx,
  establishmentId: string,
  orderType: OrderType
): Promise<CatalogueProduct[]> {
  const availabilityColumn = orderType === "boutique" ? products.availableBoutique : products.availableTraiteur;

  const rows = await tx
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      priceAmount: products.priceAmount,
      currency: products.currency,
      photoUrl: products.photoUrl,
      categoryName: categories.name,
      categorySortOrder: categories.sortOrder,
      sectionTitle: products.sectionTitle,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.establishmentId, establishmentId), eq(products.isActive, true), eq(availabilityColumn, true)))
    .orderBy(asc(categories.sortOrder), asc(products.createdAt));

  if (rows.length === 0) return [];

  const allergenRows = await tx
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

export async function getOrderWithItems(tx: Tx, orderId: string) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return null;
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  return { order, items };
}

export async function getStaffMemberByAccessCode(tx: Tx, accessCode: string) {
  const [staff] = await tx.select().from(staffMembers).where(eq(staffMembers.accessCode, accessCode));
  return staff ?? null;
}

// Login client — email cloisonné par établissement (clients_establishment_email_unique),
// donc la même adresse peut exister sous deux établissements différents sans
// collision : toujours scoper par establishmentId, jamais par email seul.
export async function getClientByEmail(tx: Tx, establishmentId: string, email: string) {
  const [client] = await tx
    .select()
    .from(clients)
    .where(and(eq(clients.establishmentId, establishmentId), eq(clients.email, email)));
  return client ?? null;
}

export type OrderWithItems = typeof orders.$inferSelect & {
  items: (typeof orderItems.$inferSelect)[];
};

export async function getOrdersForDate(tx: Tx, establishmentId: string, date: string): Promise<OrderWithItems[]> {
  const dayOrders = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.establishmentId, establishmentId), eq(orders.pickupDate, date)))
    .orderBy(asc(orders.pickupTime));

  if (dayOrders.length === 0) return [];

  const items = await tx
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

export async function getCapacityRulesForProducts(tx: Tx, productIds: string[]) {
  if (productIds.length === 0) return [];
  return tx.select().from(productCapacityRules).where(inArray(productCapacityRules.productId, productIds));
}

// Nombre de commandes actives par jour sur une plage — vue mensuelle du
// dashboard pro (écran 3 bis). "Actives" au même sens que le dashboard
// journalier : tout sauf annulé.
export type DailyOrderCount = { date: string; count: number };

export async function getOrderCountsForMonth(
  tx: Tx,
  establishmentId: string,
  monthStart: string,
  monthEnd: string
): Promise<DailyOrderCount[]> {
  const rows = await tx
    .select({ date: orders.pickupDate, count: sql<string>`count(*)` })
    .from(orders)
    .where(
      and(
        eq(orders.establishmentId, establishmentId),
        gte(orders.pickupDate, monthStart),
        lte(orders.pickupDate, monthEnd),
        ne(orders.status, "cancelled")
      )
    )
    .groupBy(orders.pickupDate);

  return rows.map((row) => ({ date: row.date, count: Number(row.count) }));
}

// Statut de capacité par jour, pour un ensemble de produits (typiquement le
// panier en cours), sur une plage d'un mois — calendrier client du tunnel
// traiteur. Ne considère que les règles "per_day" : une règle "per_slot" ne
// dit rien sur le jour dans son ensemble, chaque créneau ayant sa propre
// marge (même restriction que dailyMaxByProduct sur le dashboard pro).
// Ne renvoie que les jours où au moins un produit approche ou atteint sa
// limite — un jour absent du résultat est un jour sans signal particulier.
export type DayCapacityStatus = { date: string; nearLimitProductIds: string[]; fullProductIds: string[] };

export async function getCapacityStatusForMonth(
  tx: Tx,
  productIds: string[],
  monthStart: string,
  monthEnd: string
): Promise<DayCapacityStatus[]> {
  if (productIds.length === 0) return [];

  const rules = await tx
    .select()
    .from(productCapacityRules)
    .where(and(inArray(productCapacityRules.productId, productIds), eq(productCapacityRules.scope, "per_day")));

  if (rules.length === 0) return [];

  const ruleByProduct = new Map(rules.map((rule) => [rule.productId, rule]));

  const reservations = await tx
    .select({
      productId: capacityReservations.productId,
      date: capacityReservations.reservationDate,
      quantity: capacityReservations.quantity,
    })
    .from(capacityReservations)
    .where(
      and(
        inArray(capacityReservations.productId, [...ruleByProduct.keys()]),
        gte(capacityReservations.reservationDate, monthStart),
        lte(capacityReservations.reservationDate, monthEnd),
        sql`(${capacityReservations.status} = 'confirmed' OR (${capacityReservations.status} = 'held' AND ${capacityReservations.expiresAt} > now()))`
      )
    );

  const usedByDateProduct = new Map<string, Map<string, number>>();
  for (const reservation of reservations) {
    const byProduct = usedByDateProduct.get(reservation.date) ?? new Map<string, number>();
    byProduct.set(reservation.productId, (byProduct.get(reservation.productId) ?? 0) + reservation.quantity);
    usedByDateProduct.set(reservation.date, byProduct);
  }

  const statuses: DayCapacityStatus[] = [];
  for (const [date, byProduct] of usedByDateProduct) {
    const nearLimitProductIds: string[] = [];
    const fullProductIds: string[] = [];
    for (const [productId, rule] of ruleByProduct) {
      const used = byProduct.get(productId) ?? 0;
      if (used >= rule.maxQuantity) fullProductIds.push(productId);
      else if ((used / rule.maxQuantity) * 100 >= rule.alertThresholdPct) nearLimitProductIds.push(productId);
    }
    if (nearLimitProductIds.length > 0 || fullProductIds.length > 0) {
      statuses.push({ date, nearLimitProductIds, fullProductIds });
    }
  }

  return statuses;
}

// Fermetures ponctuelles sur une plage — combinée côté appelant avec
// establishments.closed_weekdays_traiteur/boutique (récurrence hebdomadaire,
// déjà présent sur la ligne renvoyée par getEstablishmentBySlug, pas besoin
// d'une requête à part) pour obtenir l'ensemble complet des jours fermés.
// orderType : null = ferme les deux univers ce jour-là ; sinon un seul —
// voir closureDatesForType dans lib/slots.ts pour filtrer par univers.
export type EstablishmentClosure = { id: string; date: string; orderType: string | null; reason: string | null };

export async function getClosuresInRange(
  tx: Tx,
  establishmentId: string,
  rangeStart: string,
  rangeEnd: string
): Promise<EstablishmentClosure[]> {
  return tx
    .select({
      id: establishmentClosures.id,
      date: establishmentClosures.date,
      orderType: establishmentClosures.orderType,
      reason: establishmentClosures.reason,
    })
    .from(establishmentClosures)
    .where(
      and(
        eq(establishmentClosures.establishmentId, establishmentId),
        gte(establishmentClosures.date, rangeStart),
        lte(establishmentClosures.date, rangeEnd)
      )
    )
    .orderBy(asc(establishmentClosures.date));
}

// Toutes les fermetures ponctuelles à venir (pas de borne de fin) — pour
// l'écran de gestion, où on veut voir/supprimer les prochaines fermetures
// sans se limiter à un mois particulier.
export async function getUpcomingClosures(tx: Tx, establishmentId: string, fromDate: string): Promise<EstablishmentClosure[]> {
  return tx
    .select({
      id: establishmentClosures.id,
      date: establishmentClosures.date,
      orderType: establishmentClosures.orderType,
      reason: establishmentClosures.reason,
    })
    .from(establishmentClosures)
    .where(and(eq(establishmentClosures.establishmentId, establishmentId), gte(establishmentClosures.date, fromDate)))
    .orderBy(asc(establishmentClosures.date));
}

export type ProductionLotWithAssignee = {
  id: string;
  productId: string;
  quantity: number;
  readyByTime: string;
  status: string;
  assignedTo: string | null;
  assigneeName: string | null;
};

// Répartition des tâches (écrans 8, 9) : un produit peut être produit en un
// seul lot agrégé ou découpé en plusieurs lots assignés à des personnes
// différentes — jamais un découpage imposé par créneau de retrait.
export async function getProductionLotsForDate(tx: Tx, establishmentId: string, date: string): Promise<ProductionLotWithAssignee[]> {
  return tx
    .select({
      id: productionLots.id,
      productId: productionLots.productId,
      quantity: productionLots.quantity,
      readyByTime: productionLots.readyByTime,
      status: productionLots.status,
      assignedTo: productionLots.assignedTo,
      assigneeName: staffMembers.name,
    })
    .from(productionLots)
    .leftJoin(staffMembers, eq(productionLots.assignedTo, staffMembers.id))
    .where(and(eq(productionLots.establishmentId, establishmentId), eq(productionLots.productionDate, date)));
}

// Deux origines pour une tâche employé, gardées distinctes (jamais fusionnées
// en un seul objet ambigu) : un lot de production (assignation par produit
// agrégé, potentiellement partagée entre plusieurs commandes) ou une
// commande entière assignée directement (écran 8 bis). Même discrétion dans
// les deux cas : jamais de nom ni de coordonnées client, voir "order" ci-dessous
// qui n'expose que le contenu (produits × quantités) et l'heure de retrait.
export type StaffTask =
  | {
      kind: "lot";
      id: string;
      productName: string;
      quantity: number;
      readyByTime: string;
      status: string;
    }
  | {
      kind: "order";
      id: string;
      orderType: string;
      items: { productName: string; quantity: number }[];
      readyByTime: string;
      // Statut brut de la commande (orders.status) — pas simplifié en
      // pending/done, pour rester compatible avec togglePrepared qui bascule
      // spécifiquement entre "confirmed" et "completed" (même logique que le
      // planning général, voir DayView.tsx).
      status: string;
    };

// Vue employé (écran 10) : accès allégé, sans prix ni informations client —
// uniquement les tâches (des deux origines) qui lui sont assignées ce jour-là.
export async function getTasksForStaffMember(tx: Tx, staffMemberId: string, date: string): Promise<StaffTask[]> {
  const lotRows = await tx
    .select({
      id: productionLots.id,
      productName: products.name,
      quantity: productionLots.quantity,
      readyByTime: productionLots.readyByTime,
      status: productionLots.status,
    })
    .from(productionLots)
    .innerJoin(products, eq(productionLots.productId, products.id))
    .where(and(eq(productionLots.assignedTo, staffMemberId), eq(productionLots.productionDate, date)));
  const lotTasks: StaffTask[] = lotRows.map((row) => ({ kind: "lot", ...row }));

  const assignedOrders = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.assignedTo, staffMemberId), eq(orders.pickupDate, date), ne(orders.status, "cancelled")));

  const orderTasks: StaffTask[] = [];
  for (const order of assignedOrders) {
    const items = await tx
      .select({ productName: orderItems.productNameSnapshot, quantity: orderItems.quantity })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));
    orderTasks.push({
      kind: "order",
      id: order.id,
      orderType: order.orderType,
      items,
      readyByTime: order.pickupTime,
      status: order.status,
    });
  }

  return [...lotTasks, ...orderTasks].sort((a, b) => a.readyByTime.localeCompare(b.readyByTime));
}

export async function getCategoriesForEstablishment(tx: Tx, establishmentId: string) {
  return tx.select().from(categories).where(eq(categories.establishmentId, establishmentId)).orderBy(asc(categories.sortOrder));
}

export async function getAllergensForEstablishment(tx: Tx, establishmentId: string) {
  return tx.select().from(allergens).where(eq(allergens.establishmentId, establishmentId));
}

export type ManagedProduct = {
  id: string;
  name: string;
  description: string | null;
  priceAmount: string;
  categoryId: string | null;
  categoryName: string | null;
  sectionTitle: string | null;
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
export async function getManagedProducts(tx: Tx, establishmentId: string): Promise<ManagedProduct[]> {
  const rows = await tx
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      priceAmount: products.priceAmount,
      categoryId: products.categoryId,
      categoryName: categories.name,
      sectionTitle: products.sectionTitle,
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
  // Séquentiel, pas Promise.all : tx est une connexion unique retenue pour
  // toute la transaction (SET LOCAL), pas un pool — node-postgres ne
  // supporte pas deux requêtes concurrentes sur le même client.
  const allergenRows = await tx
    .select({ productId: productAllergens.productId, allergenId: productAllergens.allergenId })
    .from(productAllergens)
    .where(inArray(productAllergens.productId, ids));
  const rules = await tx.select().from(productCapacityRules).where(inArray(productCapacityRules.productId, ids));

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

export async function getManagedProductById(tx: Tx, establishmentId: string, productId: string): Promise<ManagedProduct | null> {
  const all = await getManagedProducts(tx, establishmentId);
  return all.find((p) => p.id === productId) ?? null;
}

export type UninvoicedOrder = {
  orderId: string;
  clientName: string;
  pickupDate: string;
  totalAmount: string;
  executingEntityId: string;
  sellingEntityId: string;
};

// Commandes exécutées par une entité différente de celle qui les a vendues
// (section 6 de la synthèse), pas encore incluses sur une facture — dans les
// deux sens : Boutique exécute pour Traiteur, ou Traiteur exécute pour Boutique.
export async function getUninvoicedInterEntityOrders(
  tx: Tx,
  establishmentId: string,
  periodStart: string,
  periodEnd: string
): Promise<UninvoicedOrder[]> {
  const rows = await tx
    .select({
      orderId: orders.id,
      clientName: orders.clientName,
      pickupDate: orders.pickupDate,
      totalAmount: orders.totalAmount,
      executingEntityId: orders.executingEntityId,
      sellingEntityId: orders.sellingEntityId,
    })
    .from(orders)
    .where(
      and(
        eq(orders.establishmentId, establishmentId),
        isNotNull(orders.executingEntityId),
        sql`${orders.executingEntityId} != ${orders.sellingEntityId}`,
        gte(orders.pickupDate, periodStart),
        lte(orders.pickupDate, periodEnd),
        ne(orders.status, "cancelled")
      )
    );

  if (rows.length === 0) return [];

  const alreadyInvoiced = await tx
    .select({ orderId: interEntityInvoiceLines.orderId })
    .from(interEntityInvoiceLines)
    .where(
      inArray(
        interEntityInvoiceLines.orderId,
        rows.map((r) => r.orderId)
      )
    );
  const invoicedSet = new Set(alreadyInvoiced.map((a) => a.orderId));

  return rows.filter((r) => !invoicedSet.has(r.orderId)) as UninvoicedOrder[];
}

export async function getInterEntityInvoices(tx: Tx, establishmentId: string) {
  return tx
    .select()
    .from(interEntityInvoices)
    .where(eq(interEntityInvoices.establishmentId, establishmentId))
    .orderBy(desc(interEntityInvoices.createdAt));
}

// Détail complet d'une facture inter-entités (écran de détail + génération
// PDF) : la facture, ses lignes, et les deux entités avec leur modèle de
// facturation (adresse/TVA/IBAN) tel qu'il existe au moment de la
// consultation — pas figé à la génération, donc une correction d'adresse
// après coup se répercute sur les PDF re-téléchargés ensuite.
export async function getInterEntityInvoiceDetail(tx: Tx, invoiceId: string) {
  const [invoice] = await tx.select().from(interEntityInvoices).where(eq(interEntityInvoices.id, invoiceId));
  if (!invoice) return null;

  const lines = await tx
    .select()
    .from(interEntityInvoiceLines)
    .where(eq(interEntityInvoiceLines.invoiceId, invoiceId));

  const [fromEntity] = await tx.select().from(legalEntities).where(eq(legalEntities.id, invoice.fromEntityId));
  const [toEntity] = await tx.select().from(legalEntities).where(eq(legalEntities.id, invoice.toEntityId));
  if (!fromEntity || !toEntity) return null;

  return { invoice, lines, fromEntity, toEntity };
}

// ---------------------------------------------------------------------
// Dossier des commandes, factures d'achat, rapport comptable
// ---------------------------------------------------------------------
// Cloisonnement Richard/boutique, Michele/traiteur : partout ci-dessous,
// allowedEntityId vient de staff_members.legal_entity_id (jamais recalculé
// depuis un rôle ou une session côté client) — voir requireOwnerScope dans
// app/[slug]/pro/dossier/actions.ts. Un établissement mono-entité a un
// allowedEntityId qui pointe vers sa seule entité : filtrer dessus ne
// restreint rien dans ce cas (toutes les lignes lui appartiennent déjà).

export async function getStaffLegalEntityId(tx: Tx, staffMemberId: string): Promise<string | null> {
  const [row] = await tx.select({ legalEntityId: staffMembers.legalEntityId }).from(staffMembers).where(eq(staffMembers.id, staffMemberId));
  return row?.legalEntityId ?? null;
}

export type OrderArchiveFilters = {
  establishmentId: string;
  dateFrom: string;
  dateTo: string;
  clientName?: string;
  entityId?: string | null;
  allowedEntityId: string | null;
};

export type OrderArchiveRow = {
  id: string;
  orderType: string;
  clientName: string;
  pickupDate: string;
  totalAmount: string;
  paymentStatus: string;
  sellingEntityId: string;
  invoiceNumber: string | null;
};

export async function getOrdersArchive(tx: Tx, filters: OrderArchiveFilters): Promise<OrderArchiveRow[]> {
  const entityFilter = filters.allowedEntityId ?? filters.entityId;

  const rows = await tx
    .select({
      id: orders.id,
      orderType: orders.orderType,
      clientName: orders.clientName,
      pickupDate: orders.pickupDate,
      totalAmount: orders.totalAmount,
      paymentStatus: orders.paymentStatus,
      sellingEntityId: orders.sellingEntityId,
      invoiceNumber: clientInvoices.invoiceNumber,
    })
    .from(orders)
    .leftJoin(clientInvoices, eq(clientInvoices.orderId, orders.id))
    .where(
      and(
        eq(orders.establishmentId, filters.establishmentId),
        gte(orders.pickupDate, filters.dateFrom),
        lte(orders.pickupDate, filters.dateTo),
        ne(orders.status, "cancelled"),
        filters.clientName ? ilike(orders.clientName, `%${filters.clientName}%`) : undefined,
        entityFilter ? eq(orders.sellingEntityId, entityFilter) : undefined
      )
    )
    .orderBy(desc(orders.pickupDate));

  return rows;
}

export type PurchaseInvoiceFilters = {
  establishmentId: string;
  dateFrom?: string;
  dateTo?: string;
  allowedEntityId: string | null;
};

export async function getPurchaseInvoices(tx: Tx, filters: PurchaseInvoiceFilters) {
  return tx
    .select()
    .from(purchaseInvoices)
    .where(
      and(
        eq(purchaseInvoices.establishmentId, filters.establishmentId),
        filters.dateFrom ? gte(purchaseInvoices.invoiceDate, filters.dateFrom) : undefined,
        filters.dateTo ? lte(purchaseInvoices.invoiceDate, filters.dateTo) : undefined,
        filters.allowedEntityId ? eq(purchaseInvoices.legalEntityId, filters.allowedEntityId) : undefined
      )
    )
    .orderBy(desc(purchaseInvoices.invoiceDate));
}

export type AccountingReportData = {
  periodStart: string;
  periodEnd: string;
  revenueByEntity: { entityId: string; entityName: string; revenue: string; orderCount: number }[];
  totalRevenue: string;
  invoices: OrderArchiveRow[];
  purchases: (typeof purchaseInvoices.$inferSelect)[];
  totalPurchases: string;
};

// Une seule requête par bloc, réutilisée à la fois pour le PDF de synthèse
// et les deux CSV de détail — jamais recalculée séparément pour chaque
// format (voir les routes PDF/CSV dans app/[slug]/pro/dossier/rapport/).
export async function getAccountingReportData(
  tx: Tx,
  params: { establishmentId: string; periodStart: string; periodEnd: string; allowedEntityId: string | null }
): Promise<AccountingReportData> {
  const entities = await tx.select().from(legalEntities).where(eq(legalEntities.establishmentId, params.establishmentId));
  const entityNameById = new Map(entities.map((e) => [e.id, e.name]));

  const invoices = await getOrdersArchive(tx, {
    establishmentId: params.establishmentId,
    dateFrom: params.periodStart,
    dateTo: params.periodEnd,
    allowedEntityId: params.allowedEntityId,
  });

  const revenueByEntityMap = new Map<string, { revenue: number; orderCount: number }>();
  for (const row of invoices) {
    const current = revenueByEntityMap.get(row.sellingEntityId) ?? { revenue: 0, orderCount: 0 };
    current.revenue += Number(row.totalAmount);
    current.orderCount += 1;
    revenueByEntityMap.set(row.sellingEntityId, current);
  }
  const revenueByEntity = [...revenueByEntityMap.entries()].map(([entityId, v]) => ({
    entityId,
    entityName: entityNameById.get(entityId) ?? "Entité inconnue",
    revenue: v.revenue.toFixed(2),
    orderCount: v.orderCount,
  }));
  const totalRevenue = invoices.reduce((sum, row) => sum + Number(row.totalAmount), 0).toFixed(2);

  const purchases = await getPurchaseInvoices(tx, {
    establishmentId: params.establishmentId,
    dateFrom: params.periodStart,
    dateTo: params.periodEnd,
    allowedEntityId: params.allowedEntityId,
  });
  const totalPurchases = purchases.reduce((sum, p) => sum + Number(p.amount), 0).toFixed(2);

  return {
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    revenueByEntity,
    totalRevenue,
    invoices,
    purchases,
    totalPurchases,
  };
}

// ---------------------------------------------------------------------
// Journalisation des connexions (écran Équipe)
// ---------------------------------------------------------------------

// Une seule ligne par membre (la plus récente), pas tout l'historique — voir
// getRecentFailedAttempts ci-dessous pour l'historique des échecs, affiché
// séparément puisqu'un échec n'est jamais rattaché à un membre précis.
export async function getLastLoginByStaffMember(tx: Tx, establishmentId: string): Promise<Map<string, Date>> {
  const rows = await tx
    .select({ staffMemberId: loginAttempts.staffMemberId, createdAt: loginAttempts.createdAt })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.establishmentId, establishmentId), eq(loginAttempts.succeeded, true)))
    .orderBy(desc(loginAttempts.createdAt));

  const lastLoginByStaffMember = new Map<string, Date>();
  for (const row of rows) {
    if (row.staffMemberId && !lastLoginByStaffMember.has(row.staffMemberId)) {
      lastLoginByStaffMember.set(row.staffMemberId, row.createdAt);
    }
  }
  return lastLoginByStaffMember;
}

export type RecentFailedAttempt = { ipAddress: string; createdAt: Date };

export async function getRecentFailedAttempts(tx: Tx, establishmentId: string, limit = 20): Promise<RecentFailedAttempt[]> {
  return tx
    .select({ ipAddress: loginAttempts.ipAddress, createdAt: loginAttempts.createdAt })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.establishmentId, establishmentId), eq(loginAttempts.succeeded, false)))
    .orderBy(desc(loginAttempts.createdAt))
    .limit(limit);
}

export async function markClientInvoiceEmailSent(tx: Tx, invoiceId: string): Promise<void> {
  await tx.update(clientInvoices).set({ emailSentAt: new Date() }).where(eq(clientInvoices.id, invoiceId));
}
