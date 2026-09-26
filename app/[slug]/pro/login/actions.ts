"use server";

import { redirect } from "next/navigation";
import { getStaffMemberByAccessCode } from "@/lib/db/queries";
import { getPublicTenantContext, runAsTenant } from "@/lib/tenant";
import { createStaffSession } from "@/lib/auth";
import { currentLockout, getClientIp, getRecentFailureStreak, minutesUntil, recordLoginAttempt } from "@/lib/loginSecurity";

export type LoginState = { error?: string };

export async function login(slug: string, _prevState: LoginState, formData: FormData): Promise<LoginState> {
  const accessCode = String(formData.get("accessCode") ?? "").trim();
  if (!accessCode) return { error: "Merci d'indiquer un code d'accès." };

  const tenant = await getPublicTenantContext(slug);
  if (!tenant) return { error: "Établissement introuvable." };
  const { establishment, context } = tenant;
  const ipAddress = await getClientIp();

  const result = await runAsTenant(context, async (tx) => {
    // Vérifié avant toute chose, sur cet établissement + cette IP
    // précisément — jamais IP seule (ne bloquerait pas que l'attaquant si
    // Richard et Michele partagent le même réseau), jamais établissement
    // seul (bloquerait tout le monde à cause d'un seul attaquant ailleurs).
    const streak = await getRecentFailureStreak(tx, establishment.id, ipAddress);
    const lockedUntil = currentLockout(streak);
    if (lockedUntil) {
      // Aucune tentative enregistrée pendant un verrouillage actif : sinon
      // un attaquant qui continue de spammer repousserait indéfiniment sa
      // propre levée de blocage, ce qui empêcherait aussi le vrai
      // utilisateur de repasser une fois le délai écoulé.
      return { kind: "locked", minutesLeft: minutesUntil(lockedUntil) } as const;
    }

    const staff = await getStaffMemberByAccessCode(tx, accessCode);
    const valid = staff !== null && staff.establishmentId === establishment.id;
    await recordLoginAttempt(tx, { establishmentId: establishment.id, ipAddress, succeeded: valid, staffMemberId: valid ? staff!.id : undefined });

    return valid ? ({ kind: "ok", staff: staff! } as const) : ({ kind: "error" } as const);
  });

  if (result.kind === "locked") {
    return { error: `Trop de tentatives. Réessayez dans ${result.minutesLeft} minute${result.minutesLeft > 1 ? "s" : ""}.` };
  }
  if (result.kind === "error") return { error: "Code d'accès invalide." };

  await createStaffSession(result.staff);
  redirect(`/${slug}/pro`);
}
