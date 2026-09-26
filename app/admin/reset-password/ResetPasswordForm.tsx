"use client";

import { useActionState } from "react";
import { PageHeader, ScreenCard } from "@/components/headers";
import { Button } from "@/components/ui/Button";
import { resetPassword, type ResetPasswordState } from "./actions";

const initialState: ResetPasswordState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(resetPassword, initialState);

  return (
    <ScreenCard>
      <PageHeader title="Console plateforme" subtitle="Choisir un nouveau mot de passe" />
      <form action={formAction} className="px-6 py-6 flex flex-col gap-3">
        <input type="hidden" name="token" value={token} />
        <input
          name="password"
          type="password"
          placeholder="Nouveau mot de passe (10 caractères minimum)"
          autoFocus
          required
          minLength={10}
          className="border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
        />
        <input
          name="confirmPassword"
          type="password"
          placeholder="Confirmer le mot de passe"
          required
          minLength={10}
          className="border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
        />
        {state.error && <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">{state.error}</p>}
        <Button type="submit" disabled={isPending} accentColor="#1a1a1a" className="w-full">
          {isPending ? "Enregistrement…" : "Changer le mot de passe"}
        </Button>
      </form>
    </ScreenCard>
  );
}
