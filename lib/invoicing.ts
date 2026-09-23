import { and, eq, sql } from "drizzle-orm";
import { clientInvoices, legalEntities, orderItems, orders } from "./db/schema";
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

export type ClientInvoiceBundle = {
  invoice: typeof clientInvoices.$inferSelect;
  order: typeof orders.$inferSelect;
  items: (typeof orderItems.$inferSelect)[];
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

  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
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
