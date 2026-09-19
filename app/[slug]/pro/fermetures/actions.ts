"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { establishmentClosures, establishments } from "@/lib/db/schema";
import { requireStaffTenantContext, runAsTenant, type TenantContext } from "@/lib/tenant";

async function requireOwner(slug: string): Promise<{ establishmentId: string; context: TenantContext }> {
  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant || staffTenant.session.role !== "owner") {
    redirect(`/${slug}/pro/login`);
  }
  return { establishmentId: staffTenant.session.establishmentId, context: staffTenant.context };
}

export async function updateClosedWeekdays(slug: string, formData: FormData) {
  const { establishmentId, context } = await requireOwner(slug);

  const closedWeekdays = formData
    .getAll("closedWeekdays")
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v >= 0 && v <= 6);

  // establishments n'a volontairement pas de RLS (bootstrap public par
  // slug) — la seule protection ici est ce WHERE, qui doit donc porter sur
  // l'establishmentId de la session vérifiée, jamais sur une valeur fournie
  // par le formulaire. runAsTenant reste utilisé malgré tout, par cohérence
  // avec le reste du fichier (establishment_closures, lui, en a besoin).
  const updated = await runAsTenant(context, (tx) =>
    tx.update(establishments).set({ closedWeekdays }).where(eq(establishments.id, establishmentId)).returning({ id: establishments.id })
  );
  if (updated.length === 0) {
    throw new Error("Établissement introuvable.");
  }

  revalidatePath(`/${slug}/pro/fermetures`);
}

export type AddClosureState = { error?: string };

export async function addClosure(slug: string, _prevState: AddClosureState, formData: FormData): Promise<AddClosureState> {
  const { establishmentId, context } = await requireOwner(slug);

  const date = String(formData.get("date") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || null;

  if (!date) return { error: "Merci d'indiquer une date." };

  try {
    await runAsTenant(context, (tx) => tx.insert(establishmentClosures).values({ establishmentId, date, reason }));
  } catch (err) {
    // Contrainte unique (establishment_id, date) : une fermeture existe déjà
    // ce jour-là, pas la peine d'en recréer une seconde.
    if (err instanceof Error && err.message.includes("establishment_closures_unique")) {
      return { error: "Ce jour est déjà marqué comme fermé." };
    }
    throw err;
  }

  revalidatePath(`/${slug}/pro/fermetures`);
  return {};
}

export async function removeClosure(slug: string, closureId: string) {
  const { establishmentId, context } = await requireOwner(slug);

  const deleted = await runAsTenant(context, (tx) =>
    tx
      .delete(establishmentClosures)
      .where(and(eq(establishmentClosures.id, closureId), eq(establishmentClosures.establishmentId, establishmentId)))
      .returning({ id: establishmentClosures.id })
  );
  if (deleted.length === 0) {
    throw new Error("Fermeture introuvable ou n'appartenant pas à cet établissement.");
  }

  revalidatePath(`/${slug}/pro/fermetures`);
}
