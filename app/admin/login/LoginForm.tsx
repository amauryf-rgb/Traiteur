"use client";

import { useActionState } from "react";
import Link from "next/link";
import { PageHeader, ScreenCard } from "@/components/headers";
import { Button } from "@/components/ui/Button";
import { loginPlatformAdmin, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm({ justReset }: { justReset: boolean }) {
  const [state, formAction, isPending] = useActionState(loginPlatformAdmin, initialState);

  return (
    <ScreenCard>
      <PageHeader title="Console plateforme" subtitle="Accès réservé" />
      <form action={formAction} className="px-6 py-6 flex flex-col gap-3">
        {justReset && <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">Mot de passe changé — connecte-toi avec le nouveau.</p>}
        <input
          name="email"
          type="email"
          placeholder="Email"
          autoFocus
          autoComplete="username"
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
        <Button type="submit" disabled={isPending} accentColor="#1a1a1a" className="w-full">
          {isPending ? "Connexion…" : "Se connecter"}
        </Button>
        <Link href="/admin/forgot-password" className="text-xs text-stone-400 hover:text-stone-600 underline text-center">
          Mot de passe oublié ?
        </Link>
      </form>
    </ScreenCard>
  );
}
