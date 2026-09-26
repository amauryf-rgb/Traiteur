"use server";

import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { cancellationPolicies, orderItems, orders, payments, products } from "@/lib/db/schema";
import {
  getCapacityStatusForMonth,
  getClosuresInRange,
  getPaymentAccountForEntity,
  getSellingEntity,
  markClientInvoiceEmailSent,
  type DayCapacityStatus,
} from "@/lib/db/queries";
import { getPublicTenantContext, runAsTenant } from "@/lib/tenant";
import { confirmReservations, holdCapacity } from "@/lib/capacity";
import { createSimulatedPayment } from "@/lib/payments/simulate";
import { closureDatesForType, getClosedDatesInRange, getMonthBounds } from "@/lib/slots";
import { getOrCreateClientInvoice, type ClientInvoiceBundle } from "@/lib/invoicing";
import { renderToBuffer } from "@react-pdf/renderer";
import { ClientInvoiceDocument } from "@/lib/pdf/ClientInvoiceDocument";
import { sendEmail, isValidEmail } from "@/lib/email";
import type { CartLine, OrderType } from "@/lib/types";

// Best-effort, jamais dans la transaction de création de commande : un envoi
// qui échoue (Resend en panne, clé manquante) ne doit jamais faire échouer
// ni annuler une commande déjà confirmée et payée. La facture (client_invoices)
// est, elle, créée dans la même transaction que la commande — voir plus bas.
async function sendClientInvoiceEmail(bundle: ClientInvoiceBundle, establishmentName: string): Promise<boolean> {
  const email = bundle.order.clientContact;
  if (!email || !isValidEmail(email)) return false;

  try {
    const buffer = await renderToBuffer(
      ClientInvoiceDocument({ invoice: bundle.invoice, order: bundle.order, items: bundle.items, sellingEntity: bundle.sellingEntity, establishmentName })
    );
    return await sendEmail({
      to: email,
      subject: `Votre facture ${bundle.invoice.invoiceNumber} — ${establishmentName}`,
      html: `<p>Bonjour ${bundle.order.clientName},</p><p>Merci pour votre commande chez ${establishmentName}. Vous trouverez votre facture en pièce jointe.</p>`,
      attachments: [{ filename: `${bundle.invoice.invoiceNumber}.pdf`, content: Buffer.from(buffer) }],
    });
  } catch (err) {
    console.error("sendClientInvoiceEmail: échec", err);
    return false;
  }
}

// Statut de capacité par jour pour le calendrier client du tunnel traiteur —
// productIds vient du panier (état client, localStorage), donc fourni par
// l'appelant. Sûr malgré tout : establishmentId ne vient jamais de ce
// paramètre mais de getPublicTenantContext(slug), et RLS filtre de toute
// façon silencieusement tout productId qui n'appartiendrait pas à ce tenant
// (aucune ligne renvoyée), sans qu'aucune écriture ne soit en jeu ici.
export async function getMonthCapacityStatus(slug: string, productIds: string[], monthISO: string): Promise<DayCapacityStatus[]> {
  const tenant = await getPublicTenantContext(slug);
  if (!tenant) return [];
  const { context } = tenant;

  if (productIds.length === 0) return [];

  const { start, end } = getMonthBounds(monthISO);
  return runAsTenant(context, (tx) => getCapacityStatusForMonth(tx, productIds, start, end));
}

// Jours fermés (ponctuels) sur le mois affiché, pour un univers donné —
// closed_weekdays_traiteur/boutique (récurrence) est déjà connu côté client
// (statique, passé en prop depuis la page), donc pas besoin de le refaire
// transiter ici.
export async function getMonthClosureDates(slug: string, monthISO: string, orderType: OrderType): Promise<string[]> {
  const tenant = await getPublicTenantContext(slug);
  if (!tenant) return [];
  const { establishment, context } = tenant;

  const { start, end } = getMonthBounds(monthISO);
  const closures = await runAsTenant(context, (tx) => getClosuresInRange(tx, establishment.id, start, end));
  return closureDatesForType(closures, orderType);
}

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

class UnavailableProductsError extends Error {}
class ClosedDateError extends Error {}

export async function reserveSlot(input: ReserveSlotInput): Promise<ReserveSlotResult> {
  if (input.items.length === 0) {
    return { ok: false, error: "Le panier est vide." };
  }

  const tenant = await getPublicTenantContext(input.slug);
  if (!tenant) return { ok: false, error: "Établissement introuvable." };
  const { establishment, context } = tenant;

  const productIds = input.items.map((i) => i.productId);
  const availabilityColumn = input.orderType === "boutique" ? products.availableBoutique : products.availableTraiteur;

  try {
    const { reservationIds, expiresAt } = await runAsTenant(context, async (tx) => {
      // Un jour fermé doit être rejeté ici, pas seulement grisé côté client :
      // input.date est un argument direct d'action serveur non liée par
      // .bind(), donc modifiable dans le corps de la requête — exactement le
      // même traitement que la capacité, qui n'est jamais fiée à l'UI seule.
      const closureRows = await getClosuresInRange(tx, establishment.id, input.date, input.date);
      const closedWeekdays = input.orderType === "boutique" ? establishment.closedWeekdaysBoutique : establishment.closedWeekdaysTraiteur;
      const closedDates = getClosedDatesInRange(closedWeekdays, closureDatesForType(closureRows, input.orderType), input.date, input.date);
      if (closedDates.has(input.date)) {
        throw new ClosedDateError();
      }

      const dbProducts = await tx
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
        throw new UnavailableProductsError();
      }

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
    if (err instanceof UnavailableProductsError) {
      return { ok: false, error: "Un ou plusieurs produits ne sont plus disponibles." };
    }
    if (err instanceof ClosedDateError) {
      return { ok: false, error: "Ce jour est fermé. Merci de choisir une autre date." };
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

class NoSellingEntityError extends Error {}
class NoPaymentAccountError extends Error {}

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const clientName = input.clientName.trim();
  if (!clientName) return { ok: false, error: "Merci d'indiquer votre nom." };
  if (input.items.length === 0) return { ok: false, error: "Le panier est vide." };

  const tenant = await getPublicTenantContext(input.slug);
  if (!tenant) return { ok: false, error: "Établissement introuvable." };
  const { establishment, context } = tenant;

  const orderType = input.orderType;

  let orderId: string;
  let invoiceBundle: ClientInvoiceBundle | null = null;
  try {
    orderId = await runAsTenant(context, async (tx) => {
      const legalEntity = await getSellingEntity(tx, establishment.id, orderType);
      if (!legalEntity) throw new NoSellingEntityError();

      const paymentAccount = await getPaymentAccountForEntity(tx, legalEntity.id);
      if (!paymentAccount) throw new NoPaymentAccountError();

      const productIds = input.items.map((line) => line.productId);
      const dbProducts = await tx.select().from(products).where(inArray(products.id, productIds));
      if (dbProducts.length !== productIds.length) {
        throw new UnavailableProductsError();
      }

      const totalAmount = input.items.reduce((sum, line) => {
        const product = dbProducts.find((p) => p.id === line.productId)!;
        return sum + Number(product.priceAmount) * line.quantity;
      }, 0);

      const paymentMode = orderType === "boutique" ? "full" : input.paymentMode;
      const depositAmount = paymentMode === "deposit" ? Math.round(totalAmount * DEPOSIT_RATE * 100) / 100 : null;
      const paidAmount = depositAmount ?? totalAmount;

      const [policy] = await tx
        .select()
        .from(cancellationPolicies)
        .where(and(eq(cancellationPolicies.establishmentId, establishment.id), eq(cancellationPolicies.orderType, orderType)));

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

      // Générée dans la même transaction que la commande (bon marché, un
      // simple insert numéroté) — jamais l'envoi de l'email, qui lui attend
      // le commit (voir sendClientInvoiceEmail, appelé après ce bloc).
      invoiceBundle = await getOrCreateClientInvoice(tx, order.id);

      return order.id;
    });
  } catch (err) {
    if (err instanceof SlotExpiredError) {
      return { ok: false, error: "Votre créneau a expiré. Merci de refaire votre sélection." };
    }
    if (err instanceof NoSellingEntityError) {
      return { ok: false, error: "Aucune entité de vente configurée pour cet établissement." };
    }
    if (err instanceof NoPaymentAccountError) {
      return { ok: false, error: "Aucun compte de paiement configuré pour cette entité." };
    }
    if (err instanceof UnavailableProductsError) {
      return { ok: false, error: "Un ou plusieurs produits ne sont plus disponibles." };
    }
    throw err;
  }

  if (invoiceBundle) {
    // Annotation explicite nécessaire : sans elle, tsc perd le typage de
    // invoiceBundle dans la closure ci-dessous (variable réassignée dans le
    // callback async de runAsTenant plus haut) et infère `never`.
    const bundle: ClientInvoiceBundle = invoiceBundle;
    const sent = await sendClientInvoiceEmail(bundle, establishment.name);
    if (sent) {
      await runAsTenant(context, (tx) => markClientInvoiceEmailSent(tx, bundle.invoice.id));
    }
  }

  redirect(`/${input.slug}/${orderType}/confirmation/${orderId}`);
}
