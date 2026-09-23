"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { addPurchaseInvoice, type AddPurchaseInvoiceState } from "./actions";

const initialState: AddPurchaseInvoiceState = {};

export function AddPurchaseInvoiceForm({
  slug,
  entities,
  accentColor,
}: {
  slug: string;
  entities: { id: string; name: string }[];
  accentColor: string;
}) {
  const action = addPurchaseInvoice.bind(null, slug);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <input
          name="supplierName"
          placeholder="Fournisseur"
          required
          className="border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
        />
        <input
          name="invoiceDate"
          type="date"
          required
          className="border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input
          name="amount"
          type="number"
          step="0.05"
          min="0"
          placeholder="Montant (CHF)"
          required
          className="border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
        />
        {/* Un owner scopé (Richard/boutique, Michele/traiteur) n'a jamais ce
            champ dans le DOM — son entité est déterminée côté serveur depuis
            sa session, jamais depuis un select qu'il pourrait bricoler. */}
        {entities.length > 0 && (
          <select name="legalEntityId" required className="border border-stone-200 rounded-lg px-3 py-2 text-sm">
            <option value="">Entité</option>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <input
        name="description"
        placeholder="Description (optionnel)"
        className="border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
      />
      <div>
        <label className="block text-xs text-stone-400 mb-1">Photo ou scan de la facture (optionnel)</label>
        <input name="scan" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="text-xs text-stone-500" />
      </div>
      {state.error && <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">{state.error}</p>}
      <Button type="submit" disabled={isPending} accentColor={accentColor} className="self-start">
        {isPending ? "Ajout…" : "Ajouter la facture d'achat"}
      </Button>
    </form>
  );
}
