"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { interEntityInvoiceLines, interEntityInvoices, legalEntities, orders, purchaseInvoices } from "@/lib/db/schema";
import { requireStaffTenantContext, runAsTenant, type Tx, type TenantContext } from "@/lib/tenant";

async function requireOwner(slug: string): Promise<{ establishmentId: string; context: TenantContext }> {
  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant || staffTenant.session.role !== "owner") {
    redirect(`/${slug}/pro/login`);
  }
  return { establishmentId: staffTenant.session.establishmentId, context: staffTenant.context };
}

// Séquentiel par établissement et par année civile ("F-2026-0001"), calculé
// dans la même transaction que l'insertion de la facture. Filet de sécurité
// contre une double soumission concurrente : la contrainte unique
// (establishment_id, invoice_number) fait échouer l'insert plutôt que de
// laisser passer un doublon silencieux — voir inter_entity_invoices_number_unique.
// Une facture inter-entités est, du point de vue de l'entité destinataire,
// une facture d'achat comme une autre : sans ce miroir automatique, Richard
// (boutique) ne verrait jamais dans son Dossier ce que Michele (traiteur) lui
// facture, et devrait le ressaisir à la main — avec le risque d'oubli ou de
// montant qui diverge entre les deux saisies. scanUrl pointe vers le PDF de
// la facture elle-même (accessible à tout owner de l'établissement, voir
// facturation/[invoiceId]/pdf/route.ts) plutôt que vers un fichier séparé.
async function mirrorAsPurchaseInvoice(
  tx: Tx,
  slug: string,
  establishmentId: string,
  invoiceId: string,
  invoiceNumber: string,
  fromEntityId: string,
  toEntityId: string,
  invoiceDate: string,
  amount: string
): Promise<void> {
  if (Number(amount) <= 0) return;

  const [fromEntity] = await tx.select({ name: legalEntities.name }).from(legalEntities).where(eq(legalEntities.id, fromEntityId));

  await tx.insert(purchaseInvoices).values({
    establishmentId,
    legalEntityId: toEntityId,
    supplierName: fromEntity?.name ?? "Entité interne",
    invoiceDate,
    amount,
    description: `Facture inter-entités ${invoiceNumber}`,
    scanUrl: `/${slug}/pro/facturation/${invoiceId}/pdf`,
  });
}

async function nextInvoiceNumber(tx: Tx, establishmentId: string): Promise<string> {
  const year = new Date().getFullYear();
  const [{ count }] = await tx
    .select({ count: sql<string>`count(*)` })
    .from(interEntityInvoices)
    .where(
      and(
        eq(interEntityInvoices.establishmentId, establishmentId),
        sql`extract(year from ${interEntityInvoices.createdAt}) = ${year}`
      )
    );
  const seq = Number(count) + 1;
  return `F-${year}-${String(seq).padStart(4, "0")}`;
}

export async function generateInvoice(slug: string, formData: FormData) {
  const { establishmentId, context } = await requireOwner(slug);

  const fromEntityId = String(formData.get("fromEntityId") ?? "");
  const toEntityId = String(formData.get("toEntityId") ?? "");
  const periodStart = String(formData.get("periodStart") ?? "");
  const periodEnd = String(formData.get("periodEnd") ?? "");
  const orderIds = formData.getAll("orderIds").map(String);
  const includedIds = new Set(formData.getAll("included").map(String));

  if (!fromEntityId || !toEntityId || !periodStart || !periodEnd || orderIds.length === 0) {
    return;
  }

  await runAsTenant(context, async (tx) => {
    let total = 0;
    const lines: { orderId: string; description: string; amount: string; included: boolean }[] = [];

    for (const orderId of orderIds) {
      const amount = Number(formData.get(`amount_${orderId}`) ?? 0) || 0;
      const included = includedIds.has(orderId);
      if (included) total += amount;

      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
      lines.push({
        orderId,
        description: order ? `Commande ${order.clientName} — ${order.pickupDate}` : "Commande",
        amount: amount.toFixed(2),
        included,
      });
    }

    const [invoice] = await tx
      .insert(interEntityInvoices)
      .values({
        establishmentId,
        fromEntityId,
        toEntityId,
        invoiceNumber: await nextInvoiceNumber(tx, establishmentId),
        periodStart,
        periodEnd,
        totalAmount: total.toFixed(2),
        status: "generated",
        generatedAt: new Date(),
      })
      .returning();

    await tx.insert(interEntityInvoiceLines).values(lines.map((line) => ({ ...line, invoiceId: invoice.id })));

    await mirrorAsPurchaseInvoice(tx, slug, establishmentId, invoice.id, invoice.invoiceNumber, fromEntityId, toEntityId, periodEnd, invoice.totalAmount);
  });

  revalidatePath(`/${slug}/pro/facturation`);
  revalidatePath(`/${slug}/pro/dossier`);
}

export type ManualInvoiceState = { error?: string };

// Achat interne entre entités, sans commande client derrière (ex. la
// Boutique achète des produits au Traiteur pour son propre usage) —
// inter_entity_invoice_lines.order_id reste NULL pour ce genre de ligne,
// prévu dès le schéma mais jamais exposé jusqu'ici dans l'interface.
export async function createManualInvoice(
  slug: string,
  _prevState: ManualInvoiceState,
  formData: FormData
): Promise<ManualInvoiceState> {
  const { establishmentId, context } = await requireOwner(slug);

  const fromEntityId = String(formData.get("fromEntityId") ?? "");
  const toEntityId = String(formData.get("toEntityId") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const amount = Number(formData.get("amount") ?? 0);
  const date = String(formData.get("date") ?? "");

  if (!fromEntityId || !toEntityId) return { error: "Choisissez les deux entités." };
  if (fromEntityId === toEntityId) return { error: "Les deux entités doivent être différentes." };
  if (!description) return { error: "Merci d'indiquer une description." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Montant invalide." };
  if (!date) return { error: "Merci d'indiquer une date." };

  const result = await runAsTenant(context, async (tx) => {
    const entities = await tx
      .select()
      .from(legalEntities)
      .where(and(eq(legalEntities.establishmentId, establishmentId)));
    const validIds = new Set(entities.map((e) => e.id));
    if (!validIds.has(fromEntityId) || !validIds.has(toEntityId)) {
      return { error: "Entité invalide." } as ManualInvoiceState;
    }

    const [invoice] = await tx
      .insert(interEntityInvoices)
      .values({
        establishmentId,
        fromEntityId,
        toEntityId,
        invoiceNumber: await nextInvoiceNumber(tx, establishmentId),
        periodStart: date,
        periodEnd: date,
        totalAmount: amount.toFixed(2),
        status: "generated",
        generatedAt: new Date(),
      })
      .returning();

    await tx.insert(interEntityInvoiceLines).values({
      invoiceId: invoice.id,
      orderId: null,
      description,
      amount: amount.toFixed(2),
      included: true,
    });

    await mirrorAsPurchaseInvoice(tx, slug, establishmentId, invoice.id, invoice.invoiceNumber, fromEntityId, toEntityId, date, invoice.totalAmount);

    return null;
  });

  if (result?.error) return result;

  revalidatePath(`/${slug}/pro/facturation`);
  revalidatePath(`/${slug}/pro/dossier`);
  return {};
}
