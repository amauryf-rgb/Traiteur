"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { interEntityInvoiceLines, interEntityInvoices, legalEntities, orders } from "@/lib/db/schema";
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
  });

  revalidatePath(`/${slug}/pro/facturation`);
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

    return null;
  });

  if (result?.error) return result;

  revalidatePath(`/${slug}/pro/facturation`);
  return {};
}

export type BillingProfileState = { error?: string };

// Modèle de facturation d'une entité (adresse, IBAN, TVA) : rempli une fois,
// réutilisé pour chaque facture inter-entités générée pour cette entité —
// voir isBillingProfileComplete dans lib/billing.ts pour le contrôle fait
// avant de générer un PDF.
export async function updateEntityBillingProfile(
  slug: string,
  entityId: string,
  _prevState: BillingProfileState,
  formData: FormData
): Promise<BillingProfileState> {
  const { context } = await requireOwner(slug);

  const vatNumber = String(formData.get("vatNumber") ?? "").trim();
  const addressLine1 = String(formData.get("addressLine1") ?? "").trim();
  const addressLine2 = String(formData.get("addressLine2") ?? "").trim();
  const addressPostalCode = String(formData.get("addressPostalCode") ?? "").trim();
  const addressCity = String(formData.get("addressCity") ?? "").trim();
  const addressCountry = String(formData.get("addressCountry") ?? "").trim();
  const ibanNumber = String(formData.get("ibanNumber") ?? "").trim();
  const bankName = String(formData.get("bankName") ?? "").trim();

  const updated = await runAsTenant(context, (tx) =>
    tx
      .update(legalEntities)
      .set({
        vatNumber: vatNumber || null,
        addressLine1: addressLine1 || null,
        addressLine2: addressLine2 || null,
        addressPostalCode: addressPostalCode || null,
        addressCity: addressCity || null,
        addressCountry: addressCountry || null,
        ibanNumber: ibanNumber || null,
        bankName: bankName || null,
      })
      .where(eq(legalEntities.id, entityId))
      .returning({ id: legalEntities.id })
  );

  if (updated.length === 0) return { error: "Entité introuvable." };

  revalidatePath(`/${slug}/pro/facturation`);
  return {};
}
