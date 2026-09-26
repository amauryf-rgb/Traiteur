"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { changeOwnAccessCode, type ChangeAccessCodeState } from "./actions";

const initialState: ChangeAccessCodeState = {};

export function ChangeAccessCodeForm({ slug, accentColor }: { slug: string; accentColor: string }) {
  const action = changeOwnAccessCode.bind(null, slug);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input
        name="oldCode"
        type="password"
        inputMode="numeric"
        maxLength={6}
        placeholder="Code actuel"
        autoComplete="off"
        required
        className="border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400 text-center tracking-widest"
      />
      <input
        name="newCode"
        type="password"
        inputMode="numeric"
        maxLength={6}
        placeholder="Nouveau code (6 chiffres)"
        autoComplete="off"
        required
        className="border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400 text-center tracking-widest"
      />
      <input
        name="confirmCode"
        type="password"
        inputMode="numeric"
        maxLength={6}
        placeholder="Confirmer le nouveau code"
        autoComplete="off"
        required
        className="border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400 text-center tracking-widest"
      />
      {state.error && <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">{state.error}</p>}
      {state.success && <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">Code d&apos;accès mis à jour.</p>}
      <Button type="submit" disabled={isPending} accentColor={accentColor} className="self-start">
        {isPending ? "Enregistrement…" : "Changer mon code"}
      </Button>
    </form>
  );
}
