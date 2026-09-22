"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { establishmentClosures, establishments } from "@/lib/db/schema";
import { getStaffOrderTypeScope } from "@/lib/db/queries";
import { requireStaffTenantContext, runAsTenant, type TenantContext } from "@/lib/tenant";
import type { OrderType } from "@/lib/types";

async function requireOwner(slug: string): Promise<{ establishmentId: string; staffMemberId: string; context: TenantContext }> {
  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant || staffTenant.session.role !== "owner") {
    redirect(`/${slug}/pro/login`);
  }
  return { establishmentId: staffTenant.session.establishmentId, staffMemberId: staffTenant.session.staffMemberId, context: staffTenant.context };
}

// Un owner rattaché à un seul univers (ex. Richard/Boutique) ne peut agir
// que sur cet univers, même si le formulaire soumis prétend autre chose
// (orderType est un argument .bind() côté section Traiteur/Boutique, donc
// fiable pour un owner non scopé, mais pas assez pour empêcher un owner
// scopé de forger une requête sur l'autre univers). Un owner non rattaché à
// un univers précis (établissement mono-entité) garde le contrôle des deux.
async function requireScopeAllows(staffMemberId: string, context: TenantContext, orderType: OrderType) {
  const scope = await runAsTenant(context, (tx) => getStaffOrderTypeScope(tx, staffMemberId));
  if (scope && scope !== orderType) {
    throw new Error("Cet univers n'est pas géré par ce compte.");
  }
}

export async function updateClosedWeekdays(slug: string, orderType: OrderType, formData: FormData) {
  const { establishmentId, staffMemberId, context } = await requireOwner(slug);
  await requireScopeAllows(staffMemberId, context, orderType);

  const closedWeekdays = formData
    .getAll("closedWeekdays")
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v >= 0 && v <= 6);

  const values = orderType === "boutique" ? { closedWeekdaysBoutique: closedWeekdays } : { closedWeekdaysTraiteur: closedWeekdays };

  // establishments n'a volontairement pas de RLS (bootstrap public par
  // slug) — la seule protection ici est ce WHERE, qui doit donc porter sur
  // l'establishmentId de la session vérifiée, jamais sur une valeur fournie
  // par le formulaire. runAsTenant reste utilisé malgré tout, par cohérence
  // avec le reste du fichier (establishment_closures, lui, en a besoin).
  const updated = await runAsTenant(context, (tx) =>
    tx.update(establishments).set(values).where(eq(establishments.id, establishmentId)).returning({ id: establishments.id })
  );
  if (updated.length === 0) {
    throw new Error("Établissement introuvable.");
  }

  revalidatePath(`/${slug}/pro/fermetures`);
}

export type AddClosureState = { error?: string };

export async function addClosure(slug: string, orderType: OrderType, _prevState: AddClosureState, formData: FormData): Promise<AddClosureState> {
  const { establishmentId, staffMemberId, context } = await requireOwner(slug);
  await requireScopeAllows(staffMemberId, context, orderType);

  const date = String(formData.get("date") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || null;

  if (!date) return { error: "Merci d'indiquer une date." };

  try {
    await runAsTenant(context, (tx) => tx.insert(establishmentClosures).values({ establishmentId, date, orderType, reason }));
  } catch (err) {
    // Contrainte unique (establishment_id, date, order_type) : une fermeture
    // existe déjà ce jour-là pour cet univers.
    if (err instanceof Error && err.message.includes("establishment_closures_unique")) {
      return { error: "Ce jour est déjà marqué comme fermé pour cet univers." };
    }
    throw err;
  }

  revalidatePath(`/${slug}/pro/fermetures`);
  return {};
}

export async function removeClosure(slug: string, closureId: string) {
  const { establishmentId, staffMemberId, context } = await requireOwner(slug);
  // Résolu une seule fois, avant la transaction de suppression : runAsTenant
  // ouvre sa propre transaction (sa propre connexion) — l'appeler une
  // deuxième fois depuis l'intérieur d'un runAsTenant déjà ouvert ci-dessous
  // imbriquerait deux transactions pour rien.
  const scope = await runAsTenant(context, (tx) => getStaffOrderTypeScope(tx, staffMemberId));

  const deleted = await runAsTenant(context, async (tx) => {
    const [closure] = await tx
      .select()
      .from(establishmentClosures)
      .where(and(eq(establishmentClosures.id, closureId), eq(establishmentClosures.establishmentId, establishmentId)));
    if (!closure) return [];

    // Une fermeture "les deux univers" (order_type NULL, forcément
    // antérieure à cette fonctionnalité) ou correspondant à son propre
    // univers peut être supprimée ; l'univers de l'autre owner, non.
    if (closure.orderType && scope && closure.orderType !== scope) {
      throw new Error("Cet univers n'est pas géré par ce compte.");
    }

    return tx.delete(establishmentClosures).where(eq(establishmentClosures.id, closureId)).returning({ id: establishmentClosures.id });
  });
  if (deleted.length === 0) {
    throw new Error("Fermeture introuvable, non autorisée, ou n'appartenant pas à cet établissement.");
  }

  revalidatePath(`/${slug}/pro/fermetures`);
}
