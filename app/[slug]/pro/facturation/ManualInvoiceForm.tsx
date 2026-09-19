"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { createManualInvoice, type ManualInvoiceState } from "./actions";

const initialState: ManualInvoiceState = {};

export function ManualInvoiceForm({
  slug,
  entities,
  accentColor,
}: {
  slug: string;
  entities: { id: string; name: string }[];
  accentColor: string;
}) {
  const action = createManualInvoice.bind(null, slug);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="border border-stone-200 rounded-lg p-4 flex flex-col gap-3">
      <p className="text-sm font-medium">Achat interne (sans commande)</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-stone-400 mb-1">Entité qui facture</label>
          <select name="fromEntityId" className="w-full border border-stone-200 rounded-md px-2 py-1.5 text-sm">
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-stone-400 mb-1">Entité facturée</label>
          <select name="toEntityId" defaultValue={entities[1]?.id} className="w-full border border-stone-200 rounded-md px-2 py-1.5 text-sm">
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-stone-400 mb-1">Description</label>
        <input
          name="description"
          placeholder="ex. Achat de 10 focaccias pour un événement privé"
          className="w-full border border-stone-200 rounded-md px-2 py-1.5 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-stone-400 mb-1">Montant (CHF)</label>
          <input name="amount" type="number" step="0.05" min="0" className="w-full border border-stone-200 rounded-md px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-stone-400 mb-1">Date</label>
          <input name="date" type="date" className="w-full border border-stone-200 rounded-md px-2 py-1.5 text-sm" />
        </div>
      </div>

      {state.error && <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">{state.error}</p>}

      <Button type="submit" disabled={isPending} accentColor={accentColor} className="self-start">
        {isPending ? "Création…" : "Créer la facture"}
      </Button>
    </form>
  );
}
