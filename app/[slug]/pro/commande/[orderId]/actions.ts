"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { capacityReservations, orderItems, orders, payments } from "@/lib/db/schema";
import { getPaymentAccountForEntity } from "@/lib/db/queries";
import { requireStaffTenantContext, runAsTenant } from "@/lib/tenant";
import { createSimulatedPayment } from "@/lib/payments/simulate";

export type UpdateOrderResult = { error?: string };

class OrderNotFoundError extends Error {}
class NoPaymentAccountError extends Error {}

export async function updateOrderQuantities(
  slug: string,
  orderId: string,
  quantities: Record<string, number>
): Promise<UpdateOrderResult> {
  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant || staffTenant.session.role === "employee") {
    redirect(`/${slug}/pro/login`);
  }
  const { session, context } = staffTenant;
  const establishmentId = session.establishmentId;

  try {
    await runAsTenant(context, async (tx) => {
      const [order] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.establishmentId, establishmentId)));
      if (!order) throw new OrderNotFoundError();

      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));

      const newTotal = items.reduce((sum, item) => {
        const quantity = quantities[item.id] ?? item.quantity;
        return sum + Number(item.unitPriceSnapshot) * quantity;
      }, 0);

      const paidAmount = Number(order.paidAmount);
      const refundAmount = Math.max(0, Math.round((paidAmount - newTotal) * 100) / 100);

      const paymentAccount = refundAmount > 0 ? await getPaymentAccountForEntity(tx, order.sellingEntityId) : null;
      if (refundAmount > 0 && !paymentAccount) {
        throw new NoPaymentAccountError();
      }

      // Commission remboursée au prorata de la part remboursée au client (et non
      // conservée intégralement) — se base sur la commission nette déjà retenue
      // sur cette commande, encore à 0 tant qu'aucun vrai PSP n'est branché.
      let feeRefundAmount = 0;
      if (refundAmount > 0) {
        const priorPayments = await tx.select().from(payments).where(eq(payments.orderId, orderId));
        const netFeeRetained = priorPayments.reduce(
          (sum, p) => sum + (p.type === "refund" ? -Number(p.platformFeeAmount) : Number(p.platformFeeAmount)),
          0
        );
        feeRefundAmount = Math.min(netFeeRetained, Math.round(netFeeRetained * (refundAmount / paidAmount) * 100) / 100);
      }

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
  } catch (err) {
    if (err instanceof OrderNotFoundError) {
      return { error: "Commande introuvable." };
    }
    if (err instanceof NoPaymentAccountError) {
      return { error: "Aucun compte de paiement configuré pour rembourser cette commande." };
    }
    throw err;
  }

  revalidatePath(`/${slug}/pro`);
  redirect(`/${slug}/pro`);
}
