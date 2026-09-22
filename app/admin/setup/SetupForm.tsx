"use client";

import { useActionState } from "react";
import { PageHeader, ScreenCard } from "@/components/headers";
import { Button } from "@/components/ui/Button";
import { createFirstAdmin, type SetupState } from "./actions";

const initialState: SetupState = {};

export function SetupForm() {
  const [state, formAction, isPending] = useActionState(createFirstAdmin, initialState);

  return (
    <ScreenCard>
      <PageHeader title="Console plateforme" subtitle="Créer le compte administrateur — cette page ne fonctionne qu'une seule fois" />
      <form action={formAction} className="px-6 py-6 flex flex-col gap-3">
        <input
          name="name"
          placeholder="Nom"
          autoFocus
          required
          className="border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
        />
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
        />
        <input
          name="password"
          type="password"
          placeholder="Mot de passe (10 caractères minimum)"
          required
          minLength={10}
          className="border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
        />
        <input
          name="passwordConfirm"
          type="password"
          placeholder="Confirmer le mot de passe"
          required
          minLength={10}
          className="border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
        />
        {state.error && <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">{state.error}</p>}
        <Button type="submit" disabled={isPending} accentColor="#1a1a1a" className="w-full">
          {isPending ? "Création…" : "Créer le compte"}
        </Button>
      </form>
    </ScreenCard>
  );
}
