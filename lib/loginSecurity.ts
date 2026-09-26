import { headers } from "next/headers";
import { and, desc, eq } from "drizzle-orm";
import { loginAttempts } from "./db/schema";
import type { Tx } from "./tenant";

// x-nf-client-connection-ip : en-tête posé par l'edge Netlify lui-même,
// donc jamais falsifiable par le client (contrairement à x-forwarded-for,
// que n'importe quelle requête peut prétendre porter). Le repli sur
// x-forwarded-for ne sert qu'en dev local ou hors Netlify.
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const nf = h.get("x-nf-client-connection-ip");
  if (nf) return nf;
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

// Paliers de verrouillage progressif, du plus sévère au plus léger — le
// premier palier atteint (nombre d'échecs consécutifs >= minAttempts)
// s'applique. Ancré sur l'horodatage du DERNIER échec, pas sur le premier :
// le compte à rebours redémarre à chaque nouvel échec dans la même série.
const LOCKOUT_TIERS = [
  { minAttempts: 15, lockMinutes: 30 },
  { minAttempts: 10, lockMinutes: 5 },
  { minAttempts: 5, lockMinutes: 1 },
] as const;

// Plus que le plus haut seuil ci-dessus : suffisant pour déterminer le
// palier applicable sans jamais avoir à relire toute la table.
const LOOKBACK_LIMIT = 20;

export type LoginAttemptStreak = { consecutiveFailures: number; lastFailureAt: Date | null };

// Un succès interrompt la série : on ne remonte que jusqu'à la dernière
// connexion réussie pour ce couple établissement + IP, jamais au-delà.
export async function getRecentFailureStreak(tx: Tx, establishmentId: string, ipAddress: string): Promise<LoginAttemptStreak> {
  const recent = await tx
    .select({ succeeded: loginAttempts.succeeded, createdAt: loginAttempts.createdAt })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.establishmentId, establishmentId), eq(loginAttempts.ipAddress, ipAddress)))
    .orderBy(desc(loginAttempts.createdAt))
    .limit(LOOKBACK_LIMIT);

  let consecutiveFailures = 0;
  let lastFailureAt: Date | null = null;
  for (const attempt of recent) {
    if (attempt.succeeded) break;
    consecutiveFailures++;
    if (!lastFailureAt) lastFailureAt = attempt.createdAt;
  }
  return { consecutiveFailures, lastFailureAt };
}

// null = pas de verrouillage actif. Sinon, la date à laquelle il se lève.
export function currentLockout({ consecutiveFailures, lastFailureAt }: LoginAttemptStreak): Date | null {
  if (!lastFailureAt) return null;
  const tier = LOCKOUT_TIERS.find((t) => consecutiveFailures >= t.minAttempts);
  if (!tier) return null;
  const lockedUntil = new Date(lastFailureAt.getTime() + tier.lockMinutes * 60_000);
  return lockedUntil > new Date() ? lockedUntil : null;
}

export async function recordLoginAttempt(
  tx: Tx,
  params: { establishmentId: string; ipAddress: string; succeeded: boolean; staffMemberId?: string }
) {
  await tx.insert(loginAttempts).values({
    establishmentId: params.establishmentId,
    ipAddress: params.ipAddress,
    succeeded: params.succeeded,
    staffMemberId: params.succeeded ? (params.staffMemberId ?? null) : null,
  });
}

export function minutesUntil(date: Date): number {
  return Math.max(1, Math.ceil((date.getTime() - Date.now()) / 60_000));
}
