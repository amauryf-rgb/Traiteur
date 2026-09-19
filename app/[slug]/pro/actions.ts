"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { orders, productionLots, products, staffMembers } from "@/lib/db/schema";
import { clearStaffSession } from "@/lib/auth";
import { requireStaffTenantContext, runAsTenant, type TenantContext } from "@/lib/tenant";
import { allocateLot, recomputeExecutingEntities } from "@/lib/production";

async function requireManager(slug: string): Promise<{ establishmentId: string; context: TenantContext }> {
  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant || staffTenant.session.role === "employee") {
    redirect(`/${slug}/pro/login`);
  }
  return { establishmentId: staffTenant.session.establishmentId, context: staffTenant.context };
}

export async function logout(slug: string) {
  await clearStaffSession();
  redirect(`/${slug}/pro/login`);
}

export async function togglePrepared(slug: string, orderId: string, currentStatus: string) {
  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant) {
    redirect(`/${slug}/pro/login`);
  }
  const { context } = staffTenant;

  const nextStatus = currentStatus === "completed" ? "confirmed" : "completed";
  const updated = await runAsTenant(context, (tx) =>
    tx
      .update(orders)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(orders.id, orderId))
      .returning({ id: orders.id })
  );
  // RLS filtre silencieusement une commande d'un autre établissement (0 ligne
  // affectée, pas d'erreur SQL) — sans ce contrôle, l'employé verrait un
  // succès alors que rien n'a été modifié en base.
  if (updated.length === 0) {
    throw new Error("Commande introuvable ou n'appartenant pas à cet établissement.");
  }
  revalidatePath(`/${slug}/pro`);
}

export async function assignLot(slug: string, formData: FormData) {
  const { establishmentId, context } = await requireManager(slug);

  const productId = String(formData.get("productId") ?? "");
  const date = String(formData.get("date") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);
  const readyByTime = String(formData.get("readyByTime") ?? "");
  const assignedTo = String(formData.get("assignedTo") ?? "") || null;

  if (!productId || !date || !readyByTime || !Number.isFinite(quantity) || quantity <= 0) {
    return;
  }

  await runAsTenant(context, async (tx) => {
    // productId et assignedTo viennent d'un <input hidden>/<select> réel,
    // donc modifiables côté client — contrairement à establishmentId (issu
    // de la session), ils ne sont pas dignes de confiance par défaut. La
    // contrainte de clé étrangère seule ne suffit pas : elle est vérifiée en
    // bypassant RLS, donc un productId ou un assignedTo d'un autre
    // établissement satisferait quand même la FK et créerait un lot avec une
    // référence pointant hors du tenant. Piège général documenté dans
    // schema.sql, section 11 (RLS), piège n°3 — ne pas retirer cette
    // validation en pensant qu'elle fait doublon avec la FK.
    const [product] = await tx.select({ id: products.id }).from(products).where(and(eq(products.id, productId), eq(products.establishmentId, establishmentId)));
    if (!product) throw new Error("Produit introuvable ou n'appartenant pas à cet établissement.");

    if (assignedTo) {
      const [staff] = await tx.select({ id: staffMembers.id }).from(staffMembers).where(and(eq(staffMembers.id, assignedTo), eq(staffMembers.establishmentId, establishmentId)));
      if (!staff) throw new Error("Membre du personnel introuvable ou n'appartenant pas à cet établissement.");
    }

    const [lot] = await tx
      .insert(productionLots)
      .values({
        establishmentId,
        productId,
        productionDate: date,
        quantity: Math.trunc(quantity),
        readyByTime,
        assignedTo,
      })
      .returning();

    await allocateLot(tx, lot);
    await recomputeExecutingEntities(tx, establishmentId, date);
  });

  revalidatePath(`/${slug}/pro`);
}

export async function deleteLot(slug: string, lotId: string) {
  const { establishmentId, context } = await requireManager(slug);

  await runAsTenant(context, async (tx) => {
    const [lot] = await tx
      .select()
      .from(productionLots)
      .where(and(eq(productionLots.id, lotId), eq(productionLots.establishmentId, establishmentId)));
    // Un lot inexistant ou d'un autre établissement ne doit pas se traduire
    // par un "succès" silencieux (transaction qui commit sans rien supprimer).
    if (!lot) throw new Error("Lot de production introuvable ou n'appartenant pas à cet établissement.");

    await tx.delete(productionLots).where(eq(productionLots.id, lotId));
    await recomputeExecutingEntities(tx, establishmentId, lot.productionDate);
  });

  revalidatePath(`/${slug}/pro`);
}

export async function toggleTaskDone(slug: string, lotId: string, currentStatus: string) {
  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant) {
    redirect(`/${slug}/pro/login`);
  }
  const { session, context } = staffTenant;

  // Un employé ne peut cocher que ses propres tâches ; owner/manager peuvent
  // ajuster n'importe laquelle depuis le planning général.
  const conditions = [eq(productionLots.id, lotId), eq(productionLots.establishmentId, session.establishmentId)];
  if (session.role === "employee") {
    conditions.push(eq(productionLots.assignedTo, session.staffMemberId));
  }

  const nextStatus = currentStatus === "done" ? "pending" : "done";
  const updated = await runAsTenant(context, (tx) =>
    tx
      .update(productionLots)
      .set({ status: nextStatus })
      .where(and(...conditions))
      .returning({ id: productionLots.id })
  );
  if (updated.length === 0) {
    throw new Error("Tâche introuvable, non autorisée, ou n'appartenant pas à cet établissement.");
  }
  revalidatePath(`/${slug}/pro`);
}
