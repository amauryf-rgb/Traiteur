"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { capacityReservations, orderItems, orders, payments } from "@/lib/db/schema";
import { getStaffSession } from "@/lib/auth";
import { getEstablishmentBySlug, getPaymentAccountForEntity } from "@/lib/db/queries";
import { createSimulatedPayment } from "@/lib/payments/simulate";

export type UpdateOrderResult = { error?: string };

export async function updateOrderQuantities(
  slug: string,
  orderId: string,
  quantities: Record<string, number>
): Promise<UpdateOrderResult> {
  const session = await getStaffSession();
  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment || !session || session.establishmentId !== establishment.id || session.role === "employee") {
    redirect(`/${slug}/pro/login`);
  }

  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.establishmentId, establishment.id)));
  if (!order) return { error: "Commande introuvable." };

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));

  const newTotal = items.reduce((sum, item) => {
    const quantity = quantities[item.id] ?? item.quantity;
    return sum + Number(item.unitPriceSnapshot) * quantity;
  }, 0);

  const paidAmount = Number(order.paidAmount);
  const refundAmount = Math.max(0, Math.round((paidAmount - newTotal) * 100) / 100);

  const paymentAccount = refundAmount > 0 ? await getPaymentAccountForEntity(order.sellingEntityId) : null;
  if (refundAmount > 0 && !paymentAccount) {
    return { error: "Aucun compte de paiement configuré pour rembourser cette commande." };
  }

  // Commission remboursée au prorata de la part remboursée au client (et non
  // conservée intégralement) — se base sur la commission nette déjà retenue
  // sur cette commande, encore à 0 tant qu'aucun vrai PSP n'est branché.
  let feeRefundAmount = 0;
  if (refundAmount > 0) {
    const priorPayments = await db.select().from(payments).where(eq(payments.orderId, orderId));
    const netFeeRetained = priorPayments.reduce(
      (sum, p) => sum + (p.type === "refund" ? -Number(p.platformFeeAmount) : Number(p.platformFeeAmount)),
      0
    );
    feeRefundAmount = Math.min(netFeeRetained, Math.round(netFeeRetained * (refundAmount / paidAmount) * 100) / 100);
  }

  await db.transaction(async (tx) => {
    for (const item of items) {
      const quantity = quantities[item.id] ?? item.quantity;
      if (quantity === item.quantity) continue;

      if (quantity <= 0) {
        await tx.delete(orderItems).where(eq(orderItems.id, item.id));
      } else {
        await tx.update(orderItems).set({ quantity }).where(eq(orderItems.id, item.id));
      }

      // Libère la capacité correspondant à la quantité retirée — sans ça, un
      // créneau resterait bloqué même après réduction de la commande.
      const [reservation] = await tx
        .select()
        .from(capacityReservations)
        .where(and(eq(capacityReservations.orderId, orderId), eq(capacityReservations.productId, item.productId)));
      if (reservation) {
        if (quantity <= 0) {
          await tx.delete(capacityReservations).where(eq(capacityReservations.id, reservation.id));
        } else {
          await tx.update(capacityReservations).set({ quantity }).where(eq(capacityReservations.id, reservation.id));
        }
      }
    }

    const newPaidAmount = refundAmount > 0 ? newTotal : paidAmount;
    const newStatus = newTotal <= 0 ? "cancelled" : order.status;
    const newPaymentStatus = refundAmount > 0 ? (newTotal <= 0 ? "refunded_full" : "paid") : order.paymentStatus;

    await tx
      .update(orders)
      .set({
        totalAmount: newTotal.toFixed(2),
        paidAmount: newPaidAmount.toFixed(2),
        status: newStatus,
        paymentStatus: newPaymentStatus,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));

    if (refundAmount > 0 && paymentAccount) {
      const refundPayment = await createSimulatedPayment(paymentAccount.pspProvider);

      await tx.insert(payments).values({
        orderId,
        paymentAccountId: paymentAccount.id,
        type: "refund",
        amount: refundAmount.toFixed(2),
        platformFeeAmount: feeRefundAmount.toFixed(2),
        refundKeepsFee: false,
        externalPaymentId: refundPayment.externalPaymentId,
        status: "succeeded",
      });
    }
  });

  revalidatePath(`/${slug}/pro`);
  redirect(`/${slug}/pro`);
}
