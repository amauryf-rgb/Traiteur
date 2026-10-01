"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDateLabel } from "@/lib/slots";
import { formatCHF } from "@/lib/format";
import { INK_MUTED, PAPER_LINE, accentTint } from "@/lib/theme";
import { useWizardEvent, isEventStepComplete, type DeliveryMode } from "@/lib/traiteurWizard";

// Mêmes icônes trait (pas de fond plein) que le reste de la charte client
// (voir CatalogueClient) — dupliquées ici plutôt que partagées : chaque
// fichier qui les utilise n'en reprend que 2-3 parmi une dizaine, pas assez
// de recouvrement pour justifier un module commun pour l'instant.
const CALENDAR_ICON = (
  <>
    <rect x="4" y="5" width="16" height="15" rx="1.5" />
    <path d="M4 9.5h16" />
    <path d="M8 3v3M16 3v3" />
  </>
);
const CLOCK_ICON = (
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </>
);
const PIN_ICON = (
  <>
    <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </>
);
const PEOPLE_ICON = (
  <>
    <circle cx="12" cy="8" r="3.2" />
    <path d="M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5" />
  </>
);
const TRUCK_ICON = (
  <>
    <rect x="2" y="7" width="13" height="10" rx="1" />
    <path d="M15 10h4l3 3v4h-7v-7Z" />
    <circle cx="7" cy="19" r="1.6" />
    <circle cx="17.5" cy="19" r="1.6" />
  </>
);

function FieldIcon({ children, accentColor }: { children: React.ReactNode; accentColor: string }) {
  return (
    <span className="flex items-center justify-center w-[34px] h-[34px] rounded-full shrink-0" style={{ backgroundColor: accentTint(accentColor) }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  );
}

const fieldLabelClass = "block text-[10.5px] uppercase tracking-wide";
const SELECT_CLASS_NAME = "appearance-none bg-transparent bg-no-repeat font-serif text-[17px] outline-none w-full pr-5";
const selectArrowStyle = (accentColor: string): CSSProperties => ({
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='${encodeURIComponent(
    accentColor
  )}' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
  backgroundPosition: "right center",
  backgroundSize: "12px",
});

export function EvenementForm({
  slug,
  dates,
  times,
  accentColor,
  deliveryFeeDefault,
}: {
  slug: string;
  dates: string[];
  times: string[];
  accentColor: string;
  deliveryFeeDefault: string | null;
}) {
  const router = useRouter();
  const { event, setEvent } = useWizardEvent(slug);
  const [touched, setTouched] = useState(false);

  // Saisie directe du nombre de convives — même pattern que le stepper global
  // du catalogue (CatalogueClient) : état local pour taper librement, remis en
  // phase avec le brouillon (source de vérité) via le pattern React
  // "Adjusting state when a prop changes" plutôt qu'un effet.
  const [guestInput, setGuestInput] = useState(String(event.guestCount));
  const [syncedGuestCount, setSyncedGuestCount] = useState(event.guestCount);
  if (event.guestCount !== syncedGuestCount) {
    setSyncedGuestCount(event.guestCount);
    setGuestInput(String(event.guestCount));
  }

  function commitGuestInput() {
    const parsed = parseInt(guestInput, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      setEvent({ guestCount: parsed });
    } else {
      setGuestInput(String(event.guestCount));
    }
  }

  function setDeliveryMode(mode: DeliveryMode) {
    setEvent({ deliveryMode: mode });
  }

  const complete = isEventStepComplete(event);
  const deliveryAvailable = deliveryFeeDefault != null;

  function handleContinue() {
    setTouched(true);
    if (!complete) return;
    router.push(`/${slug}/traiteur/formules`);
  }

  return (
    <div className="pb-4">
      <div style={{ borderTop: `1px solid ${PAPER_LINE}` }}>
        <div className="grid grid-cols-2" style={{ borderBottom: `1px solid ${PAPER_LINE}` }}>
          <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderRight: `1px solid ${PAPER_LINE}` }}>
            <FieldIcon accentColor={accentColor}>{CALENDAR_ICON}</FieldIcon>
            <label className="flex-1 text-left">
              <span className={fieldLabelClass} style={{ color: INK_MUTED }}>
                Date de l&apos;événement
              </span>
              <select
                className={SELECT_CLASS_NAME}
                style={selectArrowStyle(accentColor)}
                value={event.eventDate}
                onChange={(e) => setEvent({ eventDate: e.target.value })}
              >
                <option value="" disabled>
                  Choisir…
                </option>
                {dates.map((date) => (
                  <option key={date} value={date}>
                    {formatDateLabel(date)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2.5 px-4 py-3">
            <FieldIcon accentColor={accentColor}>{CLOCK_ICON}</FieldIcon>
            <label className="flex-1 text-left">
              <span className={fieldLabelClass} style={{ color: INK_MUTED }}>
                Heure
              </span>
              <select
                className={SELECT_CLASS_NAME}
                style={selectArrowStyle(accentColor)}
                value={event.eventTime}
                onChange={(e) => setEvent({ eventTime: e.target.value })}
              >
                <option value="" disabled>
                  Choisir…
                </option>
                {times.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: `1px solid ${PAPER_LINE}` }}>
          <FieldIcon accentColor={accentColor}>{PIN_ICON}</FieldIcon>
          <label className="flex-1 text-left">
            <span className={fieldLabelClass} style={{ color: INK_MUTED }}>
              Lieu de l&apos;événement
            </span>
            <input
              type="text"
              value={event.eventLocation}
              onChange={(e) => setEvent({ eventLocation: e.target.value })}
              placeholder="Adresse de l'événement"
              className="font-serif text-[17px] outline-none w-full bg-transparent"
            />
          </label>
        </div>
      </div>

      <div className="px-4 py-5 text-center" style={{ borderBottom: `1px solid ${PAPER_LINE}` }}>
        <span className={fieldLabelClass} style={{ color: INK_MUTED }}>
          Nombre de convives
        </span>
        <div className="flex items-center justify-center gap-[22px] mt-3">
          <button
            type="button"
            onClick={() => setEvent({ guestCount: Math.max(1, event.guestCount - 1) })}
            aria-label="Retirer un convive"
            className="flex items-center justify-center w-10 h-10 rounded-full font-serif text-xl shrink-0"
            style={{ border: `1px solid ${accentColor}`, color: accentColor }}
          >
            −
          </button>
          <div className="flex flex-col items-center gap-0.5 min-w-[84px]">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={guestInput}
              onChange={(e) => setGuestInput(e.target.value.replace(/[^0-9]/g, ""))}
              onBlur={commitGuestInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              aria-label="Nombre de convives (cliquer pour saisir directement)"
              className="font-serif italic text-[38px] leading-none text-center bg-transparent outline-none w-[70px] border-b-0 border-dotted focus:border-b"
              style={{ color: accentColor, borderColor: accentColor }}
            />
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="1.6" className="opacity-55 mt-0.5">
              {PEOPLE_ICON}
            </svg>
          </div>
          <button
            type="button"
            onClick={() => setEvent({ guestCount: event.guestCount + 1 })}
            aria-label="Ajouter un convive"
            className="flex items-center justify-center w-10 h-10 rounded-full font-serif text-xl shrink-0"
            style={{ border: `1px solid ${accentColor}`, color: accentColor }}
          >
            +
          </button>
        </div>
      </div>

      <div className="px-4 py-5" style={{ borderBottom: `1px solid ${PAPER_LINE}` }}>
        <span className={fieldLabelClass} style={{ color: INK_MUTED }}>
          Retrait ou livraison ?
        </span>
        <div className="grid grid-cols-2 gap-2.5 mt-3">
          <button
            type="button"
            onClick={() => setDeliveryMode("pickup")}
            className="flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-[13px] transition-colors"
            style={
              event.deliveryMode === "pickup"
                ? { borderColor: accentColor, color: accentColor, backgroundColor: accentTint(accentColor) }
                : { borderColor: PAPER_LINE, color: INK_MUTED }
            }
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              {PIN_ICON}
            </svg>
            Retrait sur place
          </button>
          <button
            type="button"
            onClick={() => deliveryAvailable && setDeliveryMode("delivery")}
            disabled={!deliveryAvailable}
            title={deliveryAvailable ? undefined : "Livraison pas encore configurée par l'établissement"}
            className="flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-[13px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={
              event.deliveryMode === "delivery"
                ? { borderColor: accentColor, color: accentColor, backgroundColor: accentTint(accentColor) }
                : { borderColor: PAPER_LINE, color: INK_MUTED }
            }
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              {TRUCK_ICON}
            </svg>
            Livraison
          </button>
        </div>
        {!deliveryAvailable && (
          <p className="text-xs mt-2" style={{ color: INK_MUTED }}>
            La livraison n&apos;est pas encore proposée par cet établissement.
          </p>
        )}
      </div>

      {event.deliveryMode === "pickup" ? (
        <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: `1px solid ${PAPER_LINE}` }}>
          <FieldIcon accentColor={accentColor}>{CLOCK_ICON}</FieldIcon>
          <label className="flex-1 text-left">
            <span className={fieldLabelClass} style={{ color: INK_MUTED }}>
              Heure de retrait
            </span>
            <select
              className={SELECT_CLASS_NAME}
              style={selectArrowStyle(accentColor)}
              value={event.pickupTime}
              onChange={(e) => setEvent({ pickupTime: e.target.value })}
            >
              <option value="" disabled>
                Choisir…
              </option>
              {times.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <div className="px-4 py-4" style={{ borderBottom: `1px solid ${PAPER_LINE}` }}>
          <span className={fieldLabelClass} style={{ color: INK_MUTED }}>
            Adresse de livraison
          </span>
          <textarea
            value={event.deliveryAddress}
            onChange={(e) => setEvent({ deliveryAddress: e.target.value })}
            placeholder="Rue, numéro, code postal, ville"
            rows={2}
            className="font-serif text-[16px] outline-none w-full bg-transparent resize-none mt-1"
          />
          {deliveryFeeDefault != null && (
            <p className="text-xs mt-1.5" style={{ color: INK_MUTED }}>
              Frais de livraison : {formatCHF(Number(deliveryFeeDefault))}
            </p>
          )}
        </div>
      )}

      {touched && !complete && (
        <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2 mt-4">
          Merci de compléter tous les champs de cette étape avant de continuer.
        </p>
      )}

      <div className="flex items-center justify-between pt-6">
        <Link href={`/${slug}`} className="text-xs underline underline-offset-2" style={{ color: INK_MUTED }}>
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
