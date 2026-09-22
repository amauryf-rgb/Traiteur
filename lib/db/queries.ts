import { and, asc, desc, eq, gte, inArray, isNotNull, lte, ne, sql } from "drizzle-orm";
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
  orderItems,
  orders,
  paymentAccounts,
  productAllergens,
  productCapacityRules,
  productionLots,
  products,
  staffMembers,
} from "./schema";
import type { OrderType } from "../types";

// Seule fonction de ce fichier qui n'a pas besoin d'un tx tenant-scopé :
// establishments n'a volontairement aucune policy RLS (il faut pouvoir
// résoudre un slug en establishment_id avant même de connaître un tenant
// courant). Utilisée pour amorcer le contexte, jamais pour lire des
// données protégées.
export async function getEstablishmentBySlug(slug: string) {
  const [establishment] = await db.select().from(establishments).where(eq(establishments.slug, slug));
  return establishment ?? null;
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
// establishments.closed_weekdays (récurrence hebdomadaire, déjà présent sur
// la ligne renvoyée par getEstablishmentBySlug, pas besoin d'une requête à
// part) pour obtenir l'ensemble complet des jours fermés.
export type EstablishmentClosure = { id: string; date: string; reason: string | null };

export async function getClosuresInRange(
  tx: Tx,
  establishmentId: string,
  rangeStart: string,
  rangeEnd: string
): Promise<EstablishmentClosure[]> {
  return tx
    .select({ id: establishmentClosures.id, date: establishmentClosures.date, reason: establishmentClosures.reason })
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
    .select({ id: establishmentClosures.id, date: establishmentClosures.date, reason: establishmentClosures.reason })
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
