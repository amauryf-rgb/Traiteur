"use server";

import { redirect } from "next/navigation";
import { getPlatformAdminByEmail } from "@/lib/db/queries";
import { createPlatformAdminSession, verifyPassword } from "@/lib/auth";
import { runAsTenant } from "@/lib/tenant";
import { currentLockout, getClientIp, getRecentFailureStreak, minutesUntil, recordLoginAttempt } from "@/lib/loginSecurity";

export type LoginState = { error?: string };

// Même verrouillage progressif que /pro/login (voir lib/loginSecurity.ts) —
// login_attempts.establishment_id vaut NULL ici, puisqu'une tentative sur la
// console plateforme n'est rattachée à aucun établissement. isPlatformAdmin
// est nécessaire pour que la policy RLS laisse passer une ligne à
// establishment_id NULL (voir schema.sql, table login_attempts) — ce n'est
// qu'un contexte technique pour cette seule table, jamais une authentification
// accordée avant que l'email/mot de passe n'aient été vérifiés plus bas.
export async function loginPlatformAdmin(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Merci d'indiquer un email et un mot de passe." };

  const ipAddress = await getClientIp();
  const context = { establishmentId: null, isPlatformAdmin: true } as const;

  const result = await runAsTenant(context, async (tx) => {
    const streak = await getRecentFailureStreak(tx, null, ipAddress);
    const lockedUntil = currentLockout(streak);
    if (lockedUntil) {
      // Aucune tentative enregistrée pendant un verrouillage actif — sinon
      // un spam continu repousserait indéfiniment sa propre levée (même
      // raisonnement que app/[slug]/pro/login/actions.ts).
      return { kind: "locked", minutesLeft: minutesUntil(lockedUntil) } as const;
    }

    const admin = await getPlatformAdminByEmail(email);
    const valid = admin !== null && verifyPassword(password, admin.passwordHash);
    await recordLoginAttempt(tx, { establishmentId: null, ipAddress, succeeded: valid });

    return valid ? ({ kind: "ok", admin: admin! } as const) : ({ kind: "error" } as const);
  });

  if (result.kind === "locked") {
    return { error: `Trop de tentatives. Réessayez dans ${result.minutesLeft} minute${result.minutesLeft > 1 ? "s" : ""}.` };
  }
  if (result.kind === "error") return { error: "Email ou mot de passe invalide." };

  await createPlatformAdminSession(result.admin);
  redirect("/admin");
}
