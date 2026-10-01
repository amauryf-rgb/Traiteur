"use server";

import { eq, inArray } from "drizzle-orm";
import { clients, orderContacts, orderEventDetails, orderItems, orderItemSelections, orders, products } from "@/lib/db/schema";
import { getSellingEntity } from "@/lib/db/queries";
import { getClientTenantContext, getPublicTenantContext, runAsTenant } from "@/lib/tenant";
import type { WizardContactDraft, WizardEventDraft, WizardFormulaLine } from "@/lib/traiteurWizard";

export type SubmitQuoteInput = {
  slug: string;
  event: WizardEventDraft;
  formulas: WizardFormulaLine[];
  contact: WizardContactDraft;
};

export type SubmitQuoteResult = { ok: true; orderId: string } | { ok: false; error: string };

class NoSellingEntityError extends Error {}
class UnavailableFormulasError extends Error {}

// Contrairement à createOrder (app/[slug]/[type]/actions.ts) : pas de compte
// de paiement requis, pas de paiement simulé, pas de réservation de
// capacité — une demande de devis n'est pas un achat, juste une demande
// structurée que Michele ajuste par email avant toute confirmation. Le statut
// "pending_payment" sur orders.status est le plus proche sémantiquement
// (rien n'est encore acquis) ; orders.quoteStatus porte le vrai suivi.
export async function submitQuoteRequest(input: SubmitQuoteInput): Promise<SubmitQuoteResult> {
  const contact = input.contact;
  if (!contact.name.trim() || !contact.email.trim() || !contact.phone.trim()) {
    return { ok: false, error: "Coordonnées incomplètes." };
  }
  if (input.formulas.length === 0) {
    return { ok: false, error: "Aucune formule sélectionnée." };
  }

  const tenant = await getPublicTenantContext(input.slug);
  if (!tenant) return { ok: false, error: "Établissement introuvable." };
  const { establishment, context } = tenant;

  // Optionnel — commande en invité toujours possible de bout en bout. Quand
  // le client est connecté, ses coordonnées (hors nom/email, identifiants du
  // compte) sont réécrites sur `clients` à la fin de cette même transaction
  // pour éviter la ressaisie à la prochaine commande (voir décision du
  // chantier : un compte qui n'évite pas cette friction ne sert à rien).
  const clientTenant = await getClientTenantContext(input.slug);

  try {
    const orderId = await runAsTenant(context, async (tx) => {
      const legalEntity = await getSellingEntity(tx, establishment.id, "traiteur");
      if (!legalEntity) throw new NoSellingEntityError();

      const productIds = input.formulas.map((f) => f.productId);
      const dbProducts = await tx.select().from(products).where(inArray(products.id, productIds));
      if (dbProducts.length !== productIds.length) throw new UnavailableFormulasError();

      const resolveUnitPrice = (product: (typeof dbProducts)[number], withDessert: boolean | undefined) =>
        withDessert === false && product.priceAmountNoDessert != null ? product.priceAmountNoDessert : product.priceAmount;

      const deliveryFee = input.event.deliveryMode === "delivery" ? Number(establishment.deliveryFeeDefault ?? 0) : 0;
      const formulasTotal = input.formulas.reduce((sum, f) => {
        const product = dbProducts.find((p) => p.id === f.productId)!;
        return sum + Number(resolveUnitPrice(product, f.withDessert)) * f.quantity;
      }, 0);
      const totalAmount = formulasTotal + deliveryFee;

      // Heure retenue pour la production/capacité interne : l'heure de
      // retrait saisie en mode retrait, l'heure de l'événement elle-même en
      // mode livraison (pas de créneau de préparation distinct demandé pour
      // ce cas — voir chantier "Avant de commencer", étape 1).
      const pickupTime = input.event.deliveryMode === "pickup" ? input.event.pickupTime : input.event.eventTime;

      const [order] = await tx
        .insert(orders)
        .values({
          establishmentId: establishment.id,
          orderType: "traiteur",
          sellingEntityId: legalEntity.id,
          clientName: contact.name.trim(),
          clientContact: `${contact.email.trim()} · ${contact.phone.trim()}`,
          pickupDate: input.event.eventDate,
          pickupTime,
          status: "pending_payment",
          paymentStatus: "unpaid",
          quoteStatus: "devis_envoye",
          currency: dbProducts[0]?.currency ?? "CHF",
          totalAmount: totalAmount.toFixed(2),
          paidAmount: "0.00",
        })
        .returning({ id: orders.id });

      // Insertion ligne par ligne (pas de bulk insert) : il faut l'id généré
      // de chaque order_item pour y rattacher ses order_item_selections —
      // plus simple qu'un bulk insert suivi d'un rapprochement par productId.
      for (const line of input.formulas) {
        const product = dbProducts.find((p) => p.id === line.productId)!;
        const [item] = await tx
          .insert(orderItems)
          .values({
            orderId: order.id,
            productId: product.id,
            productNameSnapshot: product.name,
            unitPriceSnapshot: resolveUnitPrice(product, line.withDessert),
            quantity: line.quantity,
            withDessert: product.priceAmountNoDessert != null ? (line.withDessert ?? true) : null,
            customerNote: line.customerNote.trim() || null,
          })
          .returning({ id: orderItems.id });

        const selectionEntries = Object.entries(line.selections);
        if (selectionEntries.length > 0) {
          await tx.insert(orderItemSelections).values(
            selectionEntries.map(([componentId, selectedOptionId]) => ({
              orderItemId: item.id,
              componentId,
              selectedOptionId,
            }))
          );
        }
      }

      await tx.insert(orderEventDetails).values({
        orderId: order.id,
        eventDate: input.event.eventDate,
        eventTime: input.event.eventTime,
        eventLocation: input.event.eventLocation.trim(),
        deliveryMode: input.event.deliveryMode,
        deliveryAddress: input.event.deliveryMode === "delivery" ? input.event.deliveryAddress.trim() : null,
        deliveryFee: input.event.deliveryMode === "delivery" ? deliveryFee.toFixed(2) : null,
      });

      await tx.insert(orderContacts).values({
        orderId: order.id,
        email: contact.email.trim(),
        email2: contact.email2.trim() || null,
        phone: contact.phone.trim(),
        contactAddressLine1: contact.contactAddressLine1.trim(),
        contactAddressLine2: contact.contactAddressLine2.trim() || null,
        contactAddressPostalCode: contact.contactAddressPostalCode.trim(),
        contactAddressCity: contact.contactAddressCity.trim(),
        billingSameAsContact: contact.billingSameAsContact,
        billingAddressLine1: contact.billingSameAsContact ? null : contact.billingAddressLine1.trim() || null,
        billingAddressLine2: contact.billingSameAsContact ? null : contact.billingAddressLine2.trim() || null,
        billingAddressPostalCode: contact.billingSameAsContact ? null : contact.billingAddressPostalCode.trim() || null,
        billingAddressCity: contact.billingSameAsContact ? null : contact.billingAddressCity.trim() || null,
      });

      if (clientTenant) {
        await tx
          .update(clients)
          .set({
            phone: contact.phone.trim(),
            contactAddressLine1: contact.contactAddressLine1.trim() || null,
            contactAddressLine2: contact.contactAddressLine2.trim() || null,
            contactAddressPostalCode: contact.contactAddressPostalCode.trim() || null,
            contactAddressCity: contact.contactAddressCity.trim() || null,
            billingSameAsContact: contact.billingSameAsContact,
            billingAddressLine1: contact.billingSameAsContact ? null : contact.billingAddressLine1.trim() || null,
            billingAddressLine2: contact.billingSameAsContact ? null : contact.billingAddressLine2.trim() || null,
            billingAddressPostalCode: contact.billingSameAsContact ? null : contact.billingAddressPostalCode.trim() || null,
            billingAddressCity: contact.billingSameAsContact ? null : contact.billingAddressCity.trim() || null,
          })
          .where(eq(clients.id, clientTenant.session.clientId));
      }

      return order.id;
    });

    return { ok: true, orderId };
  } catch (error) {
    if (error instanceof NoSellingEntityError) return { ok: false, error: "Aucune entité n'est configurée pour le traiteur." };
    if (error instanceof UnavailableFormulasError) return { ok: false, error: "Une formule n'est plus disponible, merci de revenir à l'étape 2." };
    throw error;
  }
}
