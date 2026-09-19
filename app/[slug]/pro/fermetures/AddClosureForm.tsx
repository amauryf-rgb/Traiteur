"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { addClosure, type AddClosureState } from "./actions";

const initialState: AddClosureState = {};

export function AddClosureForm({ slug, accentColor }: { slug: string; accentColor: string }) {
  const action = addClosure.bind(null, slug);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex gap-3">
        <input
          name="date"
          type="date"
          required
          className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
        />
        <input
          name="reason"
          placeholder="Raison (optionnel)"
          className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
        />
      </div>
      {state.error && <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">{state.error}</p>}
      <Button type="submit" disabled={isPending} accentColor={accentColor}>
        {isPending ? "Ajout…" : "Ajouter une fermeture"}
      </Button>
    </form>
  );
}
