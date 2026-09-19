"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { interEntityInvoiceLines, interEntityInvoices, legalEntities, orders } from "@/lib/db/schema";
import { requireStaffTenantContext, runAsTenant, type TenantContext } from "@/lib/tenant";

async function requireOwner(slug: string): Promise<{ establishmentId: string; context: TenantContext }> {
  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant || staffTenant.session.role !== "owner") {
    redirect(`/${slug}/pro/login`);
  }
  return { establishmentId: staffTenant.session.establishmentId, context: staffTenant.context };
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
