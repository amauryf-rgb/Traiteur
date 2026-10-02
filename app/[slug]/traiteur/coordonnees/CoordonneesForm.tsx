"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { INK_MUTED, PAPER_LINE, accentTint } from "@/lib/theme";
import {
  useWizardContact,
  useWizardEvent,
  useWizardFormulas,
  isContactStepComplete,
  isEventStepComplete,
  type WizardContactDraft,
} from "@/lib/traiteurWizard";
import { useHydrated } from "@/lib/localStore";

const fieldLabelClass = "block text-[10.5px] uppercase tracking-wide mb-1";
const fieldClass = "font-serif text-[16px] outline-none w-full bg-transparent border-b py-1.5";

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className={fieldLabelClass} style={{ color: INK_MUTED }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={fieldClass}
        style={{ borderColor: PAPER_LINE }}
      />
    </div>
  );
}

function AddressFields({
  values,
  onChange,
  prefix,
}: {
  values: { line1: string; line2: string; postalCode: string; city: string };
  onChange: (patch: Record<string, string>) => void;
  prefix: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Field label="Rue et numéro" value={values.line1} onChange={(v) => onChange({ [`${prefix}Line1`]: v })} />
      <Field
        label="Complément (optionnel)"
        value={values.line2}
        onChange={(v) => onChange({ [`${prefix}Line2`]: v })}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="NPA" value={values.postalCode} onChange={(v) => onChange({ [`${prefix}PostalCode`]: v })} />
        <Field label="Ville" value={values.city} onChange={(v) => onChange({ [`${prefix}City`]: v })} />
      </div>
    </div>
  );
}

export function CoordonneesForm({
  slug,
  accentColor,
  prefill,
}: {
  slug: string;
  accentColor: string;
  prefill: Partial<WizardContactDraft> | null;
}) {
  const router = useRouter();
  const { event } = useWizardEvent(slug);
  const { formulas } = useWizardFormulas(slug);
  const { contact, setContact } = useWizardContact(slug);
  const [touched, setTouched] = useState(false);

  // Accès direct à cette URL sans être passé par les étapes 1/2 (brouillon
  // vide ou incomplet) — redirige vers la première étape manquante. On
  // attend l'hydratation avant de juger "incomplet" : juste après un
  // rechargement complet, les hooks useWizard* rendent encore leur valeur
  // de repli vide le temps que useSyncExternalStore se resynchronise sur le
  // vrai localStorage — agir sur ce rendu transitoire renverrait à tort vers
  // une étape antérieure même avec un brouillon complet.
  const hydrated = useHydrated();
  const previousStepsIncomplete = !isEventStepComplete(event) || formulas.length === 0;
  useEffect(() => {
    if (!hydrated) return;
    if (!isEventStepComplete(event)) router.replace(`/${slug}/traiteur/evenement`);
    else if (formulas.length === 0) router.replace(`/${slug}/traiteur/formules`);
  }, [hydrated, event, formulas, router, slug]);

  // Le pré-remplissage n'agit qu'en valeur de repli pour un champ encore vide
  // — jamais écrit dans le brouillon lui-même, pour ne jamais écraser une
  // saisie déjà faite par le client (ex. revenu en arrière puis modifié).
  function effective<K extends keyof WizardContactDraft>(key: K): WizardContactDraft[K] {
    const current = contact[key];
    const isEmpty = typeof current === "string" && current.trim() === "";
    if (isEmpty && prefill && prefill[key] !== undefined) return prefill[key] as WizardContactDraft[K];
    return current;
  }

  const name = effective("name");
  const email = effective("email");
  const email2 = effective("email2");
  const phone = effective("phone");
  const contactAddress = {
    line1: effective("contactAddressLine1"),
    line2: effective("contactAddressLine2"),
    postalCode: effective("contactAddressPostalCode"),
    city: effective("contactAddressCity"),
  };
  const billingSameAsContact = contact.billingSameAsContact;
  const billingAddress = {
    line1: effective("billingAddressLine1"),
    line2: effective("billingAddressLine2"),
    postalCode: effective("billingAddressPostalCode"),
    city: effective("billingAddressCity"),
  };

  const draftForValidation: WizardContactDraft = {
    ...contact,
    name,
    email,
    email2,
    phone,
    contactAddressLine1: contactAddress.line1,
    contactAddressPostalCode: contactAddress.postalCode,
    contactAddressCity: contactAddress.city,
    billingAddressLine1: billingAddress.line1,
    billingAddressPostalCode: billingAddress.postalCode,
    billingAddressCity: billingAddress.city,
  };
  const complete = isContactStepComplete(draftForValidation);

  function handleContinue() {
    setTouched(true);
    // Fige les valeurs affichées (y compris celles venant du pré-remplissage,
    // jamais encore écrites dans le brouillon) avant de continuer — sinon un
    // champ pré-rempli mais jamais touché par le client resterait vide dans
    // le brouillon au moment de la récapitulation.
    setContact(draftForValidation);
    if (!complete) return;
    router.push(`/${slug}/traiteur/recapitulatif`);
  }

  if (previousStepsIncomplete) return null;

  return (
    <div className="pb-4">
      <div className="flex flex-col gap-5 py-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nom et prénom" value={name} onChange={(v) => setContact({ name: v })} />
          <Field label="Téléphone" value={phone} onChange={(v) => setContact({ phone: v })} type="tel" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Email" value={email} onChange={(v) => setContact({ email: v })} type="email" />
          <Field
            label="Email 2 (optionnel)"
            value={email2}
            onChange={(v) => setContact({ email2: v })}
            type="email"
            placeholder="pour une deuxième personne"
          />
        </div>

        <div className="pt-2" style={{ borderTop: `1px solid ${PAPER_LINE}` }}>
          <p className={fieldLabelClass} style={{ color: INK_MUTED }}>
            Adresse de contact
          </p>
          <AddressFields values={contactAddress} onChange={setContact} prefix="contactAddress" />
        </div>

        <div className="pt-2" style={{ borderTop: `1px solid ${PAPER_LINE}` }}>
          <p className={fieldLabelClass} style={{ color: INK_MUTED }}>
            Adresse de facturation
          </p>
          <div className="grid grid-cols-2 gap-2.5 mb-3">
            <button
              type="button"
              onClick={() => setContact({ billingSameAsContact: true })}
              className="rounded-lg border px-3 py-2 text-[13px] transition-colors"
              style={
                billingSameAsContact
                  ? { borderColor: accentColor, color: accentColor, backgroundColor: accentTint(accentColor) }
                  : { borderColor: PAPER_LINE, color: INK_MUTED }
              }
            >
              Même adresse
            </button>
            <button
              type="button"
              onClick={() => setContact({ billingSameAsContact: false })}
              className="rounded-lg border px-3 py-2 text-[13px] transition-colors"
              style={
                !billingSameAsContact
                  ? { borderColor: accentColor, color: accentColor, backgroundColor: accentTint(accentColor) }
                  : { borderColor: PAPER_LINE, color: INK_MUTED }
              }
            >
              Différente
            </button>
          </div>
          {!billingSameAsContact && <AddressFields values={billingAddress} onChange={setContact} prefix="billingAddress" />}
        </div>
      </div>

      {touched && !complete && (
        <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2 mt-2">
          Merci de compléter tous les champs obligatoires avant de continuer.
        </p>
      )}

      <div className="flex items-center justify-between pt-6">
        <Link href={`/${slug}/traiteur/formules`} className="text-xs underline underline-offset-2" style={{ color: INK_MUTED }}>
          ← Retour
        </Link>
        <button
          type="button"
          onClick={handleContinue}
          className="font-serif italic rounded-full px-6 py-2.5 text-[13px] transition-colors"
          style={{ backgroundColor: accentColor, color: "white" }}
        >
          Continuer →
        </button>
      </div>
    </div>
  );
}
