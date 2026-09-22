import { sql } from "drizzle-orm";
import { db } from "./db";
import { getClientSession, getPlatformAdminSession, getStaffSession } from "./auth";
import { getEstablishmentBySlug } from "./db/queries";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type TenantContext = { establishmentId: string | null; isPlatformAdmin: boolean };

// Point d'entrée unique pour toute requête métier : pose les variables de
// session PostgreSQL (SET LOCAL, via set_config paramétré — jamais de
// concaténation de chaîne) dans LA MÊME transaction que la requête qui
// suit, puis exécute fn avec ce tx. Ne jamais faire un SET séparé suivi
// d'un pool.query() indépendant : deux connexions différentes du pool
// rendraient le SET LOCAL sans effet, silencieusement.
export async function runAsTenant<T>(context: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_establishment_id', ${context.establishmentId ?? ""}, true)`);
    await tx.execute(sql`SELECT set_config('app.is_platform_admin', ${context.isPlatformAdmin ? "true" : "false"}, true)`);
    return fn(tx);
  });
}

// Contexte pour une page/action PROFESSIONNELLE : dérivé exclusivement de la
// session staff signée (cookie HMAC, lib/auth.ts) — jamais d'un slug d'URL,
// d'un champ de formulaire ou d'un paramètre de requête. Un membre du staff
// de Richard ne peut pas forger une requête prétendant appartenir à
// l'établissement de Michele : la valeur n'existe nulle part côté client,
// elle est relue depuis le cookie signé à chaque appel.
export async function requireStaffTenantContext() {
  const session = await getStaffSession();
  if (!session) return null;
  return {
    session,
    context: { establishmentId: session.establishmentId, isPlatformAdmin: false } satisfies TenantContext,
  };
}

// Contexte pour une page ADMIN PLATEFORME (app/admin/**) : dérivé
// exclusivement de la session platform_admin signée (cookie séparé de
// staff_session, jamais du même cookie avec un rôle "owner" élargi — voir
// lib/auth.ts). establishmentId reste null : isPlatformAdmin=true suffit à
// lui seul à faire sauter RLS sur chaque table concernée (voir schema.sql,
// section 12), donc aucun tenant courant n'a besoin d'être fixé ici.
export async function requirePlatformAdminContext() {
  const session = await getPlatformAdminSession();
  if (!session) return null;
  return {
    session,
    context: { establishmentId: null, isPlatformAdmin: true } satisfies TenantContext,
  };
}

// Contexte pour une page PUBLIQUE (catalogue client, checkout invité) :
// dérivé du slug de l'URL, résolu contre establishments — la seule table
// volontairement sans RLS, précisément pour permettre cette résolution
// avant qu'un tenant courant soit connu. isPlatformAdmin reste toujours
// false ici : une page publique n'est jamais un accès plateforme.
export async function getPublicTenantContext(slug: string) {
  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) return null;
  return {
    establishment,
    context: { establishmentId: establishment.id, isPlatformAdmin: false } satisfies TenantContext,
  };
}

// Contexte pour une page/action CLIENT authentifié : dérivé exclusivement de
// la session client signée (cookie HMAC, lib/auth.ts) — jamais du slug seul.
// Le cookie ne porte aucune notion d'univers (traiteur/boutique), donc rien
// à re-dériver au changement d'univers : la même session sert aux deux.
// Le contrôle croisé avec establishment.id (résolu depuis le slug) empêche
// qu'une session valide pour un autre établissement soit acceptée ici,
// même si le cookie du domaine est techniquement visible sur toute URL.
export async function getClientTenantContext(slug: string) {
  const session = await getClientSession();
  if (!session) return null;

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment || establishment.id !== session.establishmentId) return null;

  return {
    session,
    establishment,
    context: { establishmentId: session.establishmentId, isPlatformAdmin: false } satisfies TenantContext,
  };
}
