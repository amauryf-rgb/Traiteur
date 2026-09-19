"use client";

import Link from "next/link";
import { useActionState } from "react";
import { IdentityHeader, ScreenCard } from "@/components/headers";
import { Button } from "@/components/ui/Button";
import { login, type AuthFormState } from "../actions";

const initialState: AuthFormState = {};

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
      <IdentityHeader establishment={establishment} line="Connexion" />
      <form action={formAction} className="px-6 pb-4 pt-2 border-t border-stone-200 flex flex-col gap-3">
        <input
          name="email"
          type="email"
          placeholder="Email"
          autoFocus
          autoComplete="email"
          required
          className="border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
        />
        <input
          name="password"
          type="password"
          placeholder="Mot de passe"
          autoComplete="current-password"
          required
          className="border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
        />
        {state.error && <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">{state.error}</p>}
        <Button type="submit" disabled={isPending} accentColor={accentColor} className="w-full">
          {isPending ? "Connexion…" : "Se connecter"}
        </Button>
      </form>
      <p className="px-6 pb-6 text-center text-xs text-stone-400">
        Pas de compte ?{" "}
        <Link href={`/${slug}/compte/signup`} className="underline" style={{ color: accentColor }}>
          Créer un compte
        </Link>
      </p>
    </ScreenCard>
  );
}
