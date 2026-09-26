"use client";

import { useActionState } from "react";
import { PageHeader, ScreenCard } from "@/components/headers";
import { Button } from "@/components/ui/Button";
import { requestPasswordReset, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = {};

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(requestPasswordReset, initialState);

  if (state.submitted) {
    return (
      <ScreenCard>
        <PageHeader title="Console plateforme" subtitle="Vérifiez votre boîte mail" />
        <div className="px-6 py-6">
          <p className="text-sm text-stone-600">
            Si un compte existe avec cette adresse, un email contenant un lien de réinitialisation vient d&apos;être envoyé
            (valable 1 heure).
          </p>
        </div>
      </ScreenCard>
    );
  }

  return (
    <ScreenCard>
      <PageHeader title="Console plateforme" subtitle="Mot de passe oublié" />
      <form action={formAction} className="px-6 py-6 flex flex-col gap-3">
        <input
          name="email"
          type="email"
          placeholder="Email"
          autoFocus
          required
          className="border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
        />
        <Button type="submit" disabled={isPending} accentColor="#1a1a1a" className="w-full">
          {isPending ? "Envoi…" : "Envoyer le lien de réinitialisation"}
        </Button>
      </form>
    </ScreenCard>
  );
}
