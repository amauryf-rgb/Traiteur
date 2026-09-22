"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { addPartner, type AddPartnerState } from "./actions";

const initialState: AddPartnerState = {};

export function AddPartnerForm() {
  const [state, formAction, isPending] = useActionState(addPartner, initialState);

  if (state.success) {
    return (
      <div className="px-6 py-5 flex flex-col gap-2">
        <p className="text-sm font-medium text-green-700">Partenaire créé.</p>
        <p className="text-sm text-stone-600">
          Espace pro : <span className="font-mono">/{state.success.slug}/pro</span>
        </p>
        <p className="text-sm text-stone-600">
          Code d&apos;accès propriétaire : <span className="font-mono tracking-widest">{state.success.ownerAccessCode}</span>
        </p>
        <p className="text-xs text-stone-400 mt-1">
          Le reste (logo, couleur, catalogue) se configure depuis l&apos;espace pro du partenaire.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="px-6 py-5 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-stone-400 mb-1">Nom de l&apos;établissement</label>
          <input
            name="name"
            required
            placeholder="ex. Traiteur Rossi"
            className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
          />
        </div>
        <div>
          <label className="block text-xs text-stone-400 mb-1">URL (optionnel, déduite du nom sinon)</label>
          <input
            name="slug"
            placeholder="ex. traiteur-rossi"
            className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-stone-400 mb-1">Nom du propriétaire</label>
        <input
          name="ownerName"
          required
          placeholder="ex. Marco Rossi"
          className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
        />
      </div>
      {state.error && <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">{state.error}</p>}
      <Button type="submit" disabled={isPending} accentColor="#1a1a1a" className="self-start">
        {isPending ? "Création…" : "Ajouter un partenaire"}
      </Button>
    </form>
  );
}
