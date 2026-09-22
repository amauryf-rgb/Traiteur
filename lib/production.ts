import { and, eq, inArray, ne } from "drizzle-orm";
import type { db } from "./db";
import { orderItems, orders, productionLotItems, productionLots, staffMembers } from "./db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Répartit automatiquement la quantité d'un lot sur les articles de commande
// du même produit/jour pas encore couverts (FIFO par heure de retrait) — le
// détail reste consultable mais n'impose aucun découpage manuel (écran 8).
export async function allocateLot(
  tx: Tx,
  lot: { id: string; productId: string; productionDate: string; quantity: number }
) {
  const candidateItems = await tx
    .select({ id: orderItems.id, quantity: orderItems.quantity })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(eq(orderItems.productId, lot.productId), eq(orders.pickupDate, lot.productionDate), ne(orders.status, "cancelled")))
    .orderBy(orders.pickupTime);

  if (candidateItems.length === 0) return;

  const itemIds = candidateItems.map((i) => i.id);
  const existingCoverage = await tx
    .select({ orderItemId: productionLotItems.orderItemId, quantityCovered: productionLotItems.quantityCovered })
    .from(productionLotItems)
    .where(inArray(productionLotItems.orderItemId, itemIds));

  const coveredMap = new Map<string, number>();
  for (const row of existingCoverage) {
    coveredMap.set(row.orderItemId, (coveredMap.get(row.orderItemId) ?? 0) + row.quantityCovered);
  }

  let remaining = lot.quantity;
  for (const item of candidateItems) {
    if (remaining <= 0) break;
    const need = item.quantity - (coveredMap.get(item.id) ?? 0);
    if (need <= 0) continue;
    const take = Math.min(need, remaining);
    await tx.insert(productionLotItems).values({ lotId: lot.id, orderItemId: item.id, quantityCovered: take });
    remaining -= take;
  }
}

// Détermine, pour chaque commande du jour, quelle entité l'a réellement
// exécutée (section 6 de la synthèse). Deux sources, mutuellement
// exclusives par commande :
//   1. Assignation "commande entière" (orders.assigned_to) — directe, prend
//      le pas sur les lots : l'entité exécutante est celle de l'employé assigné.
//   2. Assignation par lots — comme avant, uniquement quand tous les articles
//      sont entièrement couverts par des lots assignés à des membres d'une
//      même entité — sinon laissé à null (ambigu, exclu de la facturation auto).
export async function recomputeExecutingEntities(tx: Tx, establishmentId: string, productionDate: string) {
  const dayOrders = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.establishmentId, establishmentId), eq(orders.pickupDate, productionDate)));

  for (const order of dayOrders) {
    if (order.assignedTo) {
      const [staff] = await tx.select().from(staffMembers).where(eq(staffMembers.id, order.assignedTo));
      const executingEntityId = staff?.legalEntityId ?? null;
      if (order.executingEntityId !== executingEntityId) {
        await tx.update(orders).set({ executingEntityId }).where(eq(orders.id, order.id));
      }
      continue;
    }

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    if (items.length === 0) continue;

    let consistentEntity: string | null | undefined;
    let fullyCovered = true;

    for (const item of items) {
      const coverageRows = await tx
        .select({ lotId: productionLotItems.lotId, quantityCovered: productionLotItems.quantityCovered })
        .from(productionLotItems)
        .where(eq(productionLotItems.orderItemId, item.id));

      const totalCovered = coverageRows.reduce((sum, r) => sum + r.quantityCovered, 0);
      if (totalCovered < item.quantity) {
        fullyCovered = false;
        break;
      }

      for (const row of coverageRows) {
        const [lot] = await tx.select().from(productionLots).where(eq(productionLots.id, row.lotId));
        if (!lot?.assignedTo) {
          fullyCovered = false;
          break;
        }
        const [staff] = await tx.select().from(staffMembers).where(eq(staffMembers.id, lot.assignedTo));
        if (!staff?.legalEntityId) {
          fullyCovered = false;
          break;
        }
        if (consistentEntity === undefined) consistentEntity = staff.legalEntityId;
        else if (consistentEntity !== staff.legalEntityId) consistentEntity = null;
      }
      if (!fullyCovered) break;
    }

    const executingEntityId = fullyCovered ? (consistentEntity ?? null) : null;
    if (order.executingEntityId !== executingEntityId) {
      await tx.update(orders).set({ executingEntityId }).where(eq(orders.id, order.id));
    }
  }
}
