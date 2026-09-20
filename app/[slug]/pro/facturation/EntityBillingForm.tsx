"use client";

import { useActionState, useState } from "react";
import { Button, buttonClassName } from "@/components/ui/Button";
import { isBillingProfileComplete } from "@/lib/billing";
import { updateEntityBillingProfile, type BillingProfileState } from "./actions";
import type { legalEntities } from "@/lib/db/schema";

type LegalEntity = typeof legalEntities.$inferSelect;

const initialState: BillingProfileState = {};

export function EntityBillingForm({
  slug,
  entity,
  accentColor,
}: {
  slug: string;
  entity: LegalEntity;
  accentColor: string;
}) {
  const [open, setOpen] = useState(false);
  const action = updateEntityBillingProfile.bind(null, slug, entity.id);
  const [state, formAction, isPending] = useActionState(action, initialState);
  const complete = isBillingProfileComplete(entity);

  return (
    <div className="border border-stone-200 rounded-lg">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <p className="text-sm font-medium">{entity.name}</p>
          <p className={`text-xs mt-0.5 ${complete ? "text-stone-400" : "text-amber-700"}`}>
            {complete ? "Coordonnées de facturation complètes" : "Coordonnées de facturation incomplètes"}
          </p>
        </div>
        <span className="text-xs text-stone-400">{open ? "Fermer" : "Modifier"}</span>
      </button>

      {open && (
        <form action={formAction} className="px-4 pb-4 border-t border-stone-200 pt-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-stone-400 mb-1">Adresse</label>
              <input
                name="addressLine1"
                defaultValue={entity.addressLine1 ?? ""}
                placeholder="Rue et numéro"
                className="w-full border border-stone-200 rounded-md px-2 py-1.5 text-sm"
              />
            </div>
            <div className="col-span-2">
              <input
                name="addressLine2"
                defaultValue={entity.addressLine2 ?? ""}
                placeholder="Complément (optionnel)"
                className="w-full border border-stone-200 rounded-md px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">NPA</label>
              <input
                name="addressPostalCode"
                defaultValue={entity.addressPostalCode ?? ""}
                className="w-full border border-stone-200 rounded-md px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">Ville</label>
              <input
                name="addressCity"
                defaultValue={entity.addressCity ?? ""}
                className="w-full border border-stone-200 rounded-md px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">Pays</label>
              <input
                name="addressCountry"
                defaultValue={entity.addressCountry ?? "CH"}
                className="w-full border border-stone-200 rounded-md px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">N° TVA (optionnel)</label>
              <input
                name="vatNumber"
                defaultValue={entity.vatNumber ?? ""}
                placeholder="CHE-123.456.789 TVA"
                className="w-full border border-stone-200 rounded-md px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">IBAN</label>
              <input
                name="ibanNumber"
                defaultValue={entity.ibanNumber ?? ""}
                placeholder="CH00 0000 0000 0000 0000 0"
                className="w-full border border-stone-200 rounded-md px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">Banque (optionnel)</label>
              <input
                name="bankName"
                defaultValue={entity.bankName ?? ""}
                className="w-full border border-stone-200 rounded-md px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          {state.error && <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">{state.error}</p>}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isPending} accentColor={accentColor} className="self-start">
              {isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <button type="button" onClick={() => setOpen(false)} className={`${buttonClassName("secondary")} !px-3 !py-1.5 text-xs`}>
              Annuler
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
