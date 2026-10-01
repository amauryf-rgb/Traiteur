"use client";

import { useState } from "react";
import { updateQuoteStatus } from "./actions";

const LABELS: Record<string, string> = {
  devis_envoye: "Devis envoyé",
  ajustements_en_cours: "Ajustements en cours",
  confirmee: "Confirmée",
};

// Suivi manuel, pas de workflow : un simple select qui écrit directement,
// sans confirmation ni étape intermédiaire — Michele peut aussi bien avancer
// que revenir en arrière si la discussion par email reprend. État local
// miroir (pas juste la prop) pour refléter le choix immédiatement, sans
// attendre qu'un revalidatePath ne redescende la nouvelle valeur du serveur.
export function QuoteStatusSelect({ slug, orderId, quoteStatus }: { slug: string; orderId: string; quoteStatus: string }) {
  const [value, setValue] = useState(quoteStatus);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: string) {
    const previous = value;
    setValue(next);
    setIsPending(true);
    setError(null);
    try {
      await updateQuoteStatus(slug, orderId, next);
    } catch (e) {
      setValue(previous);
      setError(e instanceof Error ? e.message : "Échec de la mise à jour.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div>
      <select
        value={value}
        disabled={isPending}
        onChange={(e) => handleChange(e.target.value)}
        className="text-xs border border-stone-200 rounded-lg px-2 py-1 outline-none disabled:opacity-50"
      >
        {Object.entries(LABELS).map(([optionValue, label]) => (
          <option key={optionValue} value={optionValue}>
            {label}
          </option>
        ))}
      </select>
      {error && <p className="text-[10px] text-red-700 mt-0.5">{error}</p>}
    </div>
  );
}
