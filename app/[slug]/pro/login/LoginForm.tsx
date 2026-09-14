"use client";

import { useActionState } from "react";
import { IdentityHeader, ScreenCard } from "@/components/headers";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm({
  slug,
  establishment,
}: {
  slug: string;
  establishment: { name: string; tagline: string | null; accentColor: string | null };
}) {
  const loginForEstablishment = login.bind(null, slug);
  const [state, formAction, isPending] = useActionState(loginForEstablishment, initialState);
  const accentColor = establishment.accentColor ?? "#1a1a1a";

  return (
    <ScreenCard>
      <IdentityHeader establishment={establishment} line="Espace professionnel" />
      <form action={formAction} className="px-6 pb-6 pt-2 border-t border-stone-200 flex flex-col gap-3">
        <input
          name="accessCode"
          placeholder="Code d'accès"
          autoFocus
          autoComplete="off"
          className="border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400 text-center tracking-widest"
        />
        {state.error && <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">{state.error}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg text-white text-sm font-medium py-3 disabled:opacity-50"
          style={{ backgroundColor: accentColor }}
        >
          {isPending ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </ScreenCard>
  );
}
