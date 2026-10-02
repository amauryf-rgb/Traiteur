import { and, eq, inArray, sql } from "drizzle-orm";
import { clientInvoices, legalEntities, orderItemExclusions, orderItems, orderItemSelections, orders, productComponentOptions, productComponents } from "./db/schema";
import type { Tx } from "./tenant";

// Même patron que nextInvoiceNumber dans app/[slug]/pro/facturation/actions.ts
// (séquentiel par établissement et par année), préfixe "C" pour Client
// plutôt que "F" (inter-entités) — jamais le même compteur, pour ne jamais
// risquer une collision entre les deux séries.
async function nextClientInvoiceNumber(tx: Tx, establishmentId: string): Promise<string> {
  const year = new Date().getFullYear();
  const [{ count }] = await tx
    .select({ count: sql<string>`count(*)` })
    .from(clientInvoices)
    .where(
      and(eq(clientInvoices.establishmentId, establishmentId), sql`extract(year from ${clientInvoices.generatedAt}) = ${year}`)
    );
  const seq = Number(count) + 1;
  return `C-${year}-${String(seq).padStart(4, "0")}`;
}

// Une ligne de commande enrichie des substitutions/exclusions choisies par le
// client (voir product_components.type) — reprend le même libellé "Composant
// : Option" déjà calculé côté client dans RecapWizard.tsx, pour que
// l'établissement voie exactement ce que le client a vu sur son récapitulatif,
// que ce soit sur le PDF devis ou facture.
export type OrderItemWithDetails = typeof orderItems.$inferSelect & {
  selectionLabels: string[];
  exclusionLabels: string[];
};

async function getOrderItemsWithDetails(tx: Tx, orderId: string): Promise<OrderItemWithDetails[]> {
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  if (items.length === 0) return [];
  const itemIds = items.map((i) => i.id);

  const selectionRows = await tx
    .select({
      orderItemId: orderItemSelections.orderItemId,
      componentLabel: productComponents.label,
      optionLabel: productComponentOptions.label,
    })
    .from(orderItemSelections)
    .innerJoin(productComponents, eq(productComponents.id, orderItemSelections.componentId))
    .innerJoin(productComponentOptions, eq(productComponentOptions.id, orderItemSelections.selectedOptionId))
    .where(inArray(orderItemSelections.orderItemId, itemIds));

  const exclusionRows = await tx
    .select({
      orderItemId: orderItemExclusions.orderItemId,
      componentLabel: productComponents.label,
    })
    .from(orderItemExclusions)
    .innerJoin(productComponents, eq(productComponents.id, orderItemExclusions.componentId))
    .where(inArray(orderItemExclusions.orderItemId, itemIds));

  const selectionsByItem = new Map<string, string[]>();
  for (const row of selectionRows) {
    const list = selectionsByItem.get(row.orderItemId) ?? [];
    list.push(`${row.componentLabel} : ${row.optionLabel}`);
    selectionsByItem.set(row.orderItemId, list);
  }

  const exclusionsByItem = new Map<string, string[]>();
  for (const row of exclusionRows) {
    const list = exclusionsByItem.get(row.orderItemId) ?? [];
    list.push(row.componentLabel);
    exclusionsByItem.set(row.orderItemId, list);
  }

  return items.map((item) => ({
    ...item,
    selectionLabels: selectionsByItem.get(item.id) ?? [],
    exclusionLabels: exclusionsByItem.get(item.id) ?? [],
  }));
}

export type ClientInvoiceBundle = {
  invoice: typeof clientInvoices.$inferSelect;
  order: typeof orders.$inferSelect;
  items: OrderItemWithDetails[];
  sellingEntity: typeof legalEntities.$inferSelect;
};

export type DevisBundle = {
  invoice: { invoiceNumber: string; generatedAt: Date };
  order: typeof orders.$inferSelect;
  items: OrderItemWithDetails[];
  sellingEntity: typeof legalEntities.$inferSelect;
};

// Génère la facture au premier accès (à la création de la commande, ou plus
// tard depuis le Dossier pour une commande passée avant ce chantier) et la
// réutilise ensuite — jamais un deuxième numéro pour la même commande
// (contrainte unique sur order_id, voir lib/db/schema.ts). Retourne tout ce
// qu'il faut pour rendre le PDF ou composer l'email en un seul appel.
export async function getOrCreateClientInvoice(tx: Tx, orderId: string): Promise<ClientInvoiceBundle | null> {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return null;

  const items = await getOrderItemsWithDetails(tx, orderId);
  const [sellingEntity] = await tx.select().from(legalEntities).where(eq(legalEntities.id, order.sellingEntityId));
  if (!sellingEntity) return null;

  const [existing] = await tx.select().from(clientInvoices).where(eq(clientInvoices.orderId, orderId));
  if (existing) return { invoice: existing, order, items, sellingEntity };

  const [invoice] = await tx
    .insert(clientInvoices)
    .values({
      establishmentId: order.establishmentId,
      orderId: order.id,
      sellingEntityId: order.sellingEntityId,
      invoiceNumber: await nextClientInvoiceNumber(tx, order.establishmentId),
    })
    .returning();

  return { invoice, order, items, sellingEntity };
}

// Équivalent devis de getOrCreateClientInvoice — ne persiste jamais de ligne
// client_invoices ni ne consomme de numéro de facture réel, tant que
// orders.quoteStatus n'est pas 'confirmee' (voir app/[slug]/traiteur/actions.ts
// et le commentaire sur orders.quoteStatus, lib/db/schema.ts). Le numéro de
// devis est dérivé de l'id de commande, pas d'une séquence dédiée : ce n'est
// pas un document comptable, juste une référence lisible pour l'échange par
// email entre Michele et son client.
export async function getDevisBundle(tx: Tx, orderId: string): Promise<DevisBundle | null> {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return null;

  const items = await getOrderItemsWithDetails(tx, orderId);
  const [sellingEntity] = await tx.select().from(legalEntities).where(eq(legalEntities.id, order.sellingEntityId));
  if (!sellingEntity) return null;

  return {
    invoice: { invoiceNumber: `DEVIS-${order.id.slice(0, 8).toUpperCase()}`, generatedAt: new Date() },
    order,
    items,
    sellingEntity,
  };
}
