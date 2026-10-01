"use client";

import { useState } from "react";
import { INK_MUTED } from "@/lib/theme";

// Stepper de quantité avec saisie directe au clavier — partagé entre
// l'ancien catalogue (MenuRow) et le tunnel traiteur (étape 2). Deux
// gabarits : "compact" (~22px, neutre au repos, bascule en accent au survol —
// pour ne pas rivaliser avec le gros stepper "Nombre de personnes") et
// "touch" (~28px, accent en permanence — accordéon mobile, cible tactile).
export function QuantityStepper({
  value,
  onChange,
  unitLabel,
  accentColor,
  ariaLabel,
  size = "compact",
}: {
  value: number;
  onChange: (value: number) => void;
  unitLabel?: string;
  accentColor: string;
  ariaLabel: string;
  size?: "compact" | "touch";
}) {
  // État local pour permettre de vider le champ le temps de taper une
  // nouvelle valeur, resynchronisé avec `value` (source de vérité) via le
  // pattern React "Adjusting state when a prop changes" plutôt qu'un effet.
  const [input, setInput] = useState(String(value));
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setInput(String(value));
  }

  function commit() {
    const parsed = parseInt(input, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      onChange(parsed);
    } else {
      setInput(String(value));
    }
  }

  const buttonClass =
    size === "compact"
      ? "w-[22px] h-[22px] rounded-full border border-[#d9d5c9] text-[#6b5d55] hover:border-[var(--accent)] hover:text-[var(--accent)] flex items-center justify-center text-xs leading-none shrink-0 transition-colors"
      : "w-7 h-7 rounded-full border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white flex items-center justify-center shrink-0 transition-colors";
  const inputClass =
    size === "compact"
      ? "font-serif italic text-base w-7 text-center bg-transparent outline-none border-b-0 border-dotted focus:border-b"
      : "font-serif italic text-base w-8 text-center bg-transparent outline-none border-b-0 border-dotted focus:border-b";

  return (
    <div className="flex items-center gap-1.5 shrink-0" style={{ "--accent": accentColor } as React.CSSProperties} onClick={(e) => e.stopPropagation()}>
      <button onClick={() => onChange(Math.max(0, value - 1))} className={buttonClass} aria-label={`Retirer — ${ariaLabel}`}>
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={input}
        onChange={(e) => setInput(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        aria-label={`${ariaLabel} (cliquer pour saisir directement)`}
        className={inputClass}
        style={{ color: accentColor, borderColor: accentColor }}
      />
      <button onClick={() => onChange(value + 1)} className={buttonClass} aria-label={`Ajouter — ${ariaLabel}`}>
        +
      </button>
      {unitLabel && (
        <span className="text-[10.5px] opacity-75" style={{ color: INK_MUTED }}>
          {unitLabel}
        </span>
      )}
    </div>
  );
}
