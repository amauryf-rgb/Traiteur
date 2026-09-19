"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { orderItems, orders, payments, products } from "@/lib/db/schema";
import { getPaymentAccountForEntity, getSellingEntity } from "@/lib/db/queries";
import { requireStaffTenantContext, runAsTenant } from "@/lib/tenant";
import { confirmReservations, holdCapacity } from "@/lib/capacity";
import { createSimulatedPayment } from "@/lib/payments/simulate";
import { getCurrentTimeISO, getTodayISO } from "@/lib/slots";

export type ComptoirItem = { productId: string; quantity: number };
export type CheckoutResult = { ok: true; orderId: string } | { ok: false; error: string };

class CapacityError extends Error {
  constructor(public productName: string) {
    super("capacity");
  }
}

class UnavailableProductsError extends Error {}
class NoSellingEntityError extends Error {}
class NoPaymentAccountError extends Error {}

export async function checkoutComptoir(slug: string, items: ComptoirItem[], clientName: string): Promise<CheckoutResult> {
  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant) {
    return { ok: false, error: "Session expirée, merci de vous reconnecter." };
  }
  if (items.length === 0) return { ok: false, error: "Aucun article sélectionné." };

  const { session, context } = staffTenant;
  const establishmentId = session.establishmentId;

  const date = getTodayISO();
  const time = getCurrentTimeISO();

  let orderId: string;
  try {
    orderId = await runAsTenant(context, async (tx) => {
      const productIds = items.map((i) => i.productId);
      const dbProducts = await tx
        .select()
        .from(products)
        .where(and(eq(products.establishmentId, establishmentId), inArray(products.id, productIds)));
      if (dbProducts.length !== productIds.length) throw new UnavailableProductsError();

      const legalEntity = await getSellingEntity(tx, establishmentId, "boutique");
      if (!legalEntity) throw new NoSellingEntityError();

      const paymentAccount = await getPaymentAccountForEntity(tx, legalEntity.id);
      if (!paymentAccount) throw new NoPaymentAccountError();

      const total = items.reduce((sum, item) => {
        const product = dbProducts.find((p) => p.id === item.productId)!;
        return sum + Number(product.priceAmount) * item.quantity;
      }, 0);

      const reservationIds: string[] = [];
      for (const item of items) {
        const product = dbProducts.find((p) => p.id === item.productId)!;
        const result = await holdCapacity(tx, { productId: item.productId, date, time, quantity: item.quantity });
        if (!result.ok) throw new CapacityError(product.name);
        reservationIds.push(result.reservationId);
      }

      const [order] = await tx
        .insert(orders)
        .values({
          establishmentId,
          orderType: "boutique",
          sellingEntityId: legalEntity.id,
          clientName: clientName.trim() || "Client comptoir",
          pickupDate: date,
          pickupTime: time,
          status: "completed",
          paymentStatus: "paid",
          totalAmount: total.toFixed(2),
          paidAmount: total.toFixed(2),
        })
        .returning({ id: orders.id });

      await tx.insert(orderItems).values(
        items.map((item) => {
          const product = dbProducts.find((p) => p.id === item.productId)!;
          return {
            orderId: order.id,
            productId: product.id,
            productNameSnapshot: product.name,
            unitPriceSnapshot: product.priceAmount,
            quantity: item.quantity,
          };
        })
      );

      const confirmation = await confirmReservations(tx, reservationIds, order.id);
      if (!confirmation.ok) throw new Error("reservation_failed");

      const payment = await createSimulatedPayment(paymentAccount.pspProvider);
      await tx.insert(payments).values({
        orderId: order.id,
        paymentAccountId: paymentAccount.id,
        type: "full",
        amount: total.toFixed(2),
        platformFeeAmount: "0",
        externalPaymentId: payment.externalPaymentId,
        status: "succeeded",
      });

      return order.id;
    });
  } catch (err) {
    if (err instanceof CapacityError) {
      return { ok: false, error: `Capacité atteinte pour "${err.productName}".` };
    }
    if (err instanceof NoSellingEntityError) {
      return { ok: false, error: "Aucune entité de vente configurée pour la boutique." };
    }
    if (err instanceof NoPaymentAccountError) {
      return { ok: false, error: "Aucun compte de paiement configuré pour cette entité." };
    }
    if (err instanceof UnavailableProductsError) {
      return { ok: false, error: "Un produit n'est plus disponible." };
    }
    return { ok: false, error: "La commande a expiré, réessayez." };
  }

  revalidatePath(`/${slug}/pro`);
  return { ok: true, orderId };
}
