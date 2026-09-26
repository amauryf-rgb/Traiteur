"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { staffMembers } from "@/lib/db/schema";
import { getStaffMemberById } from "@/lib/db/queries";
import { requireStaffTenantContext, runAsTenant } from "@/lib/tenant";

export type ChangeAccessCodeState = { error?: string; success?: boolean };

const ACCESS_CODE_PATTERN = /^\d{6}$/;

// Accessible à n'importe quel rôle (owner, manager, employé) — chacun ne
// change que SON PROPRE code, jamais celui d'un autre (voir resetStaffAccessCode
// dans equipe/actions.ts pour la réinitialisation par un owner, un mécanisme
// volontairement distinct). Redemande l'ancien code même si la session est
// déjà active : une session ouverte oubliée sur un appareil ne doit pas
// suffire à elle seule pour changer ce qui protège l'accès.
export async function changeOwnAccessCode(slug: string, _prevState: ChangeAccessCodeState, formData: FormData): Promise<ChangeAccessCodeState> {
  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant) redirect(`/${slug}/pro/login`);
  const { session, context } = staffTenant;

  const oldCode = String(formData.get("oldCode") ?? "").trim();
  const newCode = String(formData.get("newCode") ?? "").trim();
  const confirmCode = String(formData.get("confirmCode") ?? "").trim();

  if (!ACCESS_CODE_PATTERN.test(newCode)) return { error: "Le nouveau code doit comporter exactement 6 chiffres." };
  if (newCode !== confirmCode) return { error: "Les deux codes ne correspondent pas." };

  const result = await runAsTenant(context, async (tx) => {
    const staff = await getStaffMemberById(tx, session.staffMemberId);
    if (!staff) return { error: "Compte introuvable." } as ChangeAccessCodeState;
    if (staff.accessCode !== oldCode) return { error: "Ancien code incorrect." } as ChangeAccessCodeState;
    if (newCode === oldCode) return { error: "Le nouveau code doit être différent de l'ancien." } as ChangeAccessCodeState;

    try {
      await tx.update(staffMembers).set({ accessCode: newCode }).where(eq(staffMembers.id, session.staffMemberId));
    } catch (err) {
      // Contrainte unique (establishment_id, access_code) : quelqu'un
      // d'autre dans le même établissement a déjà ce code.
      if (err instanceof Error && err.message.includes("staff_members_establishment_access_code_unique")) {
        return { error: "Ce code est déjà utilisé par quelqu'un d'autre — choisis-en un autre." } as ChangeAccessCodeState;
      }
      throw err;
    }

    return { success: true } as ChangeAccessCodeState;
  });

  return result;
}
