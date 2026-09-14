"use server";

import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { cancellationPolicies, orderItems, orders, payments, products } from "@/lib/db/schema";
import { getEstablishmentBySlug, getPaymentAccountForEntity, getSellingEntity } from "@/lib/db/queries";
import { confirmReservations, holdCapacity } from "@/lib/capacity";
import { createSimulatedPayment } from "@/lib/payments/simulate";
import type { CartLine, OrderType } from "@/lib/types";

export type CartItemInput = { productId: string; quantity: number };

export type ReserveSlotInput = {
  slug: string;
  orderType: OrderType;
  date: string;
  time: string;
  items: CartItemInput[];
};

export type ReserveSlotResult = { ok: true; reservationIds: string[]; expiresAt: string } | { ok: false; error: string };

class CapacityError extends Error {
  constructor(
    public productName: string,
    public scope: "per_day" | "per_slot"
  ) {
    super("capacity");
  }
}

export async function reserveSlot(input: ReserveSlotInput): Promise<ReserveSlotResult> {
  if (input.items.length === 0) {
    return { ok: false, error: "Le panier est vide." };
  }

  const establishment = await getEstablishmentBySlug(input.slug);
  if (!establishment) return { ok: false, error: "Établissement introuvable." };

  const productIds = input.items.map((i) => i.productId);
  const availabilityColumn = input.orderType === "boutique" ? products.availableBoutique : products.availableTraiteur;
  const dbProducts = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.establishmentId, establishment.id),
        eq(products.isActive, true),
        eq(availabilityColumn, true),
        inArray(products.id, productIds)
      )
    );

  if (dbProducts.length !== productIds.length) {
    return { ok: false, error: "Un ou plusieurs produits ne sont plus disponibles." };
  }

  try {
    const { reservationIds, expiresAt } = await db.transaction(async (tx) => {
      const ids: string[] = [];
      let expiresAt = new Date();
      for (const item of input.items) {
        const product = dbProducts.find((p) => p.id === item.productId)!;
        const result = await holdCapacity(tx, {
          productId: item.productId,
          date: input.date,
          time: input.time,
          quantity: item.quantity,
        });
        if (!result.ok) {
          throw new CapacityError(product.name, result.scope);
        }
        ids.push(result.reservationId);
        expiresAt = result.expiresAt;
      }
      return { reservationIds: ids, expiresAt };
    });

    return { ok: true, reservationIds, expiresAt: expiresAt.toISOString() };
  } catch (err) {
    if (err instanceof CapacityError) {
      const when = err.scope === "per_slot" ? "à ce créneau" : "pour ce jour";
      return {
        ok: false,
        error: `Capacité atteinte pour "${err.productName}" ${when}. Réduisez la quantité ou choisissez un autre créneau.`,
      };
    }
    throw err;
  }
}

export type CreateOrderInput = {
  slug: string;
  orderType: OrderType;
  date: string;
  time: string;
  items: CartLine[];
  reservationIds: string[];
  clientName: string;
  clientContact: string;
  paymentMode: "deposit" | "full";
};

export type CreateOrderResult = { ok: false; error: string };

const DEPOSIT_RATE = 0.3;

class SlotExpiredError extends Error {}

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const clientName = input.clientName.trim();
  if (!clientName) return { ok: false, error: "Merci d'indiquer votre nom." };
  if (input.items.length === 0) return { ok: false, error: "Le panier est vide." };

  const establishment = await getEstablishmentBySlug(input.slug);
  if (!establishment) return { ok: false, error: "Établissement introuvable." };

  const legalEntity = await getSellingEntity(establishment.id, input.orderType);
  if (!legalEntity) return { ok: false, error: "Aucune entité de vente configurée pour cet établissement." };

  const paymentAccount = await getPaymentAccountForEntity(legalEntity.id);
  if (!paymentAccount) return { ok: false, error: "Aucun compte de paiement configuré pour cette entité." };

  const productIds = input.items.map((line) => line.productId);
  const dbProducts = await db.select().from(products).where(inArray(products.id, productIds));
  if (dbProducts.length !== productIds.length) {
    return { ok: false, error: "Un ou plusieurs produits ne sont plus disponibles." };
  }

  const totalAmount = input.items.reduce((sum, line) => {
    const product = dbProducts.find((p) => p.id === line.productId)!;
    return sum + Number(product.priceAmount) * line.quantity;
  }, 0);

  const orderType = input.orderType;
  const paymentMode = orderType === "boutique" ? "full" : input.paymentMode;
  const depositAmount = paymentMode === "deposit" ? Math.round(totalAmount * DEPOSIT_RATE * 100) / 100 : null;
  const paidAmount = depositAmount ?? totalAmount;

  const [policy] = await db
    .select()
    .from(cancellationPolicies)
    .where(and(eq(cancellationPolicies.establishmentId, establishment.id), eq(cancellationPolicies.orderType, orderType)));

  let orderId: string;
  try {
    orderId = await db.transaction(async (tx) => {
      const [order] = await tx
        .insert(orders)
        .values({
          establishmentId: establishment.id,
          orderType,
          sellingEntityId: legalEntity.id,
          clientName,
          clientContact: input.clientContact.trim() || null,
          pickupDate: input.date,
          pickupTime: input.time,
          status: "confirmed",
          paymentStatus: paymentMode === "deposit" ? "deposit_paid" : "paid",
          currency: dbProducts[0]?.currency ?? "CHF",
          totalAmount: totalAmount.toFixed(2),
          depositAmount: depositAmount !== null ? depositAmount.toFixed(2) : null,
          paidAmount: paidAmount.toFixed(2),
          cancellationPolicySnapshot: policy
            ? {
                refundableDaysBefore: policy.refundableDaysBefore,
                nonRefundableAfterHours: policy.nonRefundableAfterHours,
              }
            : null,
        })
        .returning({ id: orders.id });

      await tx.insert(orderItems).values(
        input.items.map((line) => {
          const product = dbProducts.find((p) => p.id === line.productId)!;
          return {
            orderId: order.id,
            productId: product.id,
            productNameSnapshot: product.name,
            unitPriceSnapshot: product.priceAmount,
            quantity: line.quantity,
          };
        })
      );

      const confirmation = await confirmReservations(tx, input.reservationIds, order.id);
      if (!confirmation.ok) {
        throw new SlotExpiredError();
      }

      const payment = await createSimulatedPayment(paymentAccount.pspProvider);
      await tx.insert(payments).values({
        orderId: order.id,
        paymentAccountId: paymentAccount.id,
        type: paymentMode,
        amount: paidAmount.toFixed(2),
        platformFeeAmount: "0",
        externalPaymentId: payment.externalPaymentId,
        status: "succeeded",
      });

      return order.id;
    });
  } catch (err) {
    if (err instanceof SlotExpiredError) {
      return { ok: false, error: "Votre créneau a expiré. Merci de refaire votre sélection." };
    }
    throw err;
  }

  redirect(`/${input.slug}/${orderType}/confirmation/${orderId}`);
}
