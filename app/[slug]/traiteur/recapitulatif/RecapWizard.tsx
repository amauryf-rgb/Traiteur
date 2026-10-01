"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatCHF } from "@/lib/format";
import { formatDateLabel } from "@/lib/slots";
import { INK_MUTED, PAPER_LINE } from "@/lib/theme";
import {
  useWizardEvent,
  useWizardFormulas,
  useWizardContact,
  clearWizardDraft,
  isEventStepComplete,
  isContactStepComplete,
} from "@/lib/traiteurWizard";
import { submitQuoteRequest } from "../actions";
import type { CatalogueProduct } from "@/lib/db/queries";

function RecapRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5" style={{ borderBottom: `1px solid ${PAPER_LINE}` }}>
      <span className="text-xs shrink-0" style={{ color: INK_MUTED }}>
        {label}
      </span>
      <span className="font-serif text-right text-[15px]">{value}</span>
    </div>
  );
}

export function RecapWizard({
  slug,
  products,
  accentColor,
  deliveryFeeDefault,
}: {
  slug: string;
  products: CatalogueProduct[];
  accentColor: string;
  deliveryFeeDefault: string | null;
}) {
  const router = useRouter();
  const { event } = useWizardEvent(slug);
  const { formulas } = useWizardFormulas(slug);
  const { contact } = useWizardContact(slug);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Accès direct à cette URL sans être passé par les étapes précédentes
  // (brouillon localStorage vide ou incomplet) — redirige vers la première
  // étape manquante plutôt que de planter en essayant d'afficher des données
  // absentes (ex. formatDateLabel sur une date vide). `done` reste vrai après
  // une soumission réussie même si clearWizardDraft vide le brouillon juste
  // après : ne jamais rediriger une fois la confirmation affichée.
  useEffect(() => {
    if (done) return;
    if (!isEventStepComplete(event)) router.replace(`/${slug}/traiteur/evenement`);
    else if (formulas.length === 0) router.replace(`/${slug}/traiteur/formules`);
    else if (!isContactStepComplete(contact)) router.replace(`/${slug}/traiteur/coordonnees`);
  }, [done, event, formulas, contact, router, slug]);

  const stepIncomplete = !done && (!isEventStepComplete(event) || formulas.length === 0 || !isContactStepComplete(contact));

  const deliveryFee = event.deliveryMode === "delivery" ? Number(deliveryFeeDefault ?? 0) : 0;
  const formulasTotal = formulas.reduce((sum, line) => {
    const product = products.find((p) => p.id === line.productId);
    if (!product) return sum;
    const unitPrice =
      line.withDessert === false && product.priceAmountNoDessert != null ? Number(product.priceAmountNoDessert) : Number(product.priceAmount);
    return sum + unitPrice * line.quantity;
  }, 0);
  const total = formulasTotal + deliveryFee;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const result = await submitQuoteRequest({ slug, event, formulas, contact });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    clearWizardDraft(slug);
    setDone(true);
  }

  if (done) {
    return (
      <div className="text-center py-16">
        <p className="font-serif italic text-xl" style={{ color: accentColor }}>
          Merci !
        </p>
        <p className="text-sm mt-3 max-w-sm mx-auto" style={{ color: INK_MUTED }}>
          Votre demande a bien été transmise. {contact.name.split(" ")[0] || "Vous"} recevrez le devis directement par email de la part de
          l&apos;établissement.
        </p>
        <Link href={`/${slug}`} className="inline-block mt-6 text-xs underline underline-offset-2" style={{ color: INK_MUTED }}>
          Retour à l&apos;accueil
        </Link>
      </div>
    );
  }

  // Le useEffect ci-dessus déclenche déjà la redirection — ce return évite
  // juste d'essayer de calculer/afficher le récapitulatif entre-temps avec
  // des données manquantes (le temps que la navigation s'effectue).
  if (stepIncomplete) return null;

  return (
    <div className="pb-4">
      <div className="pt-2">
        <p className="text-[10.5px] uppercase tracking-wide mb-1" style={{ color: accentColor }}>
          Événement
        </p>
        <RecapRow
          label="Date et heure"
          value={
            <>
              {formatDateLabel(event.eventDate)} · {event.eventTime}
            </>
          }
        />
        <RecapRow label="Lieu" value={event.eventLocation} />
        <RecapRow label="Convives" value={`${event.guestCount} personnes`} />
        <RecapRow
          label={event.deliveryMode === "pickup" ? "Retrait" : "Livraison"}
          value={event.deliveryMode === "pickup" ? `Sur place, ${event.pickupTime}` : event.deliveryAddress}
        />

        <p className="text-[10.5px] uppercase tracking-wide mb-1 mt-6" style={{ color: accentColor }}>
          Formules
        </p>
        {formulas.map((line) => {
          const product = products.find((p) => p.id === line.productId);
          if (!product) return null;
          const unitPrice =
            line.withDessert === false && product.priceAmountNoDessert != null
              ? Number(product.priceAmountNoDessert)
              : Number(product.priceAmount);
          const selectionLabels = product.components
            .map((component) => {
              const optionId = line.selections[component.id];
              const option = component.options.find((o) => o.id === optionId);
              return option ? `${component.label} : ${option.label}` : null;
            })
            .filter((l): l is string => l !== null);
          return (
            <RecapRow
              key={line.productId}
              label={product.name}
              value={
                <div className="flex flex-col items-end gap-0.5">
                  <span>
                    {line.quantity} pers. · {formatCHF(unitPrice * line.quantity)}
                  </span>
                  {product.priceAmountNoDessert != null && (
                    <span className="text-xs" style={{ color: INK_MUTED }}>
                      {line.withDessert === false ? "Sans dessert" : "Avec dessert"}
                    </span>
                  )}
                  {selectionLabels.map((l) => (
                    <span key={l} className="text-xs" style={{ color: INK_MUTED }}>
                      {l}
                    </span>
                  ))}
                  {line.customerNote && (
                    <span className="text-xs italic" style={{ color: INK_MUTED }}>
                      &laquo;&nbsp;{line.customerNote}&nbsp;&raquo;
                    </span>
                  )}
                </div>
              }
            />
          );
        })}
        {deliveryFee > 0 && <RecapRow label="Frais de livraison" value={formatCHF(deliveryFee)} />}

        <p className="text-[10.5px] uppercase tracking-wide mb-1 mt-6" style={{ color: accentColor }}>
          Contact
        </p>
        <RecapRow label="Nom" value={contact.name} />
        <RecapRow label="Téléphone" value={contact.phone} />
        <RecapRow label="Email" value={contact.email2 ? `${contact.email}, ${contact.email2}` : contact.email} />
        <RecapRow
          label="Adresse"
          value={`${contact.contactAddressLine1}, ${contact.contactAddressPostalCode} ${contact.contactAddressCity}`}
        />

        <div className="flex items-center justify-between py-4 mt-4" style={{ borderTop: `2px solid ${accentColor}` }}>
          <span className="text-xs uppercase tracking-wide" style={{ color: INK_MUTED }}>
            Total estimé
          </span>
          <span className="font-serif italic text-xl" style={{ color: accentColor }}>
            {formatCHF(total)}
          </span>
        </div>
      </div>

      {error && <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2 mt-2">{error}</p>}

      <div className="flex items-center justify-between pt-6">
        <Link href={`/${slug}/traiteur/coordonnees`} className="text-xs underline underline-offset-2" style={{ color: INK_MUTED }}>
          ← Retour
        </Link>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="font-serif italic rounded-full px-6 py-2.5 text-[13px] transition-colors disabled:opacity-50"
          style={{ backgroundColor: accentColor, color: "white" }}
        >
          {submitting ? "Envoi…" : "Demander un devis →"}
        </button>
      </div>
    </div>
  );
}
