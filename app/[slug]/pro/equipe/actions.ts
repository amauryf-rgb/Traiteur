"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { staffMembers, legalEntities } from "@/lib/db/schema";
import { requireStaffTenantContext, runAsTenant, type Tx, type TenantContext } from "@/lib/tenant";

export type StaffFormState = { error?: string };

async function requireOwner(slug: string): Promise<{ establishmentId: string; context: TenantContext }> {
  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant || staffTenant.session.role !== "owner") {
    redirect(`/${slug}/pro/login`);
  }
  return { establishmentId: staffTenant.session.establishmentId, context: staffTenant.context };
}

// 6 chiffres (100000-999999) depuis le renforcement sécurité — voir
// lib/loginSecurity.ts pour le verrouillage progressif qui l'accompagne.
async function generateAccessCode(tx: Tx): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const [existing] = await tx.select().from(staffMembers).where(eq(staffMembers.accessCode, code));
    if (!existing) return code;
  }
  throw new Error("Impossible de générer un code d'accès unique.");
}

export async function addStaffMember(slug: string, _prevState: StaffFormState, formData: FormData): Promise<StaffFormState> {
  const { establishmentId, context } = await requireOwner(slug);

  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  const legalEntityId = String(formData.get("legalEntityId") ?? "");

  if (!name) return { error: "Merci d'indiquer un nom." };
  if (!["owner", "manager", "employee"].includes(role)) return { error: "Rôle invalide." };

  const result = await runAsTenant(context, async (tx) => {
    const [entity] = await tx
      .select()
      .from(legalEntities)
      .where(and(eq(legalEntities.id, legalEntityId), eq(legalEntities.establishmentId, establishmentId)));
    if (!entity) return { error: "Entité juridique invalide." } as StaffFormState;

    const accessCode = await generateAccessCode(tx);

    await tx.insert(staffMembers).values({
      establishmentId,
      legalEntityId: entity.id,
      name,
      initials: name.slice(0, 2).toUpperCase(),
      role,
      accessCode,
    });

    return null;
  });

  if (result?.error) return result;

  revalidatePath(`/${slug}/pro/equipe`);
  return {};
}

// Réinitialisation par un owner — utile si un employé oublie son code.
// Contrairement à changeOwnAccessCode (compte/actions.ts), pas besoin de
// connaître l'ancien code : c'est justement le mécanisme de secours quand on
// ne l'a plus. Le nouveau code généré redevient visible immédiatement dans
// la liste de l'écran Équipe, exactement comme après un ajout de membre.
export async function resetStaffAccessCode(slug: string, staffId: string) {
  const { establishmentId, context } = await requireOwner(slug);

  const outcome = await runAsTenant(context, async (tx) => {
    const [staff] = await tx.select().from(staffMembers).where(and(eq(staffMembers.id, staffId), eq(staffMembers.establishmentId, establishmentId)));
    if (!staff) return "not_found" as const;

    const newCode = await generateAccessCode(tx);
    await tx.update(staffMembers).set({ accessCode: newCode }).where(eq(staffMembers.id, staffId));
    return "reset" as const;
  });

  if (outcome === "not_found") {
    throw new Error("Membre introuvable ou n'appartenant pas à cet établissement.");
  }

  revalidatePath(`/${slug}/pro/equipe`);
}

export async function removeStaffMember(slug: string, staffId: string) {
  const { establishmentId, context } = await requireOwner(slug);

  const outcome = await runAsTenant(context, async (tx) => {
    const staff = await tx.select().from(staffMembers).where(eq(staffMembers.establishmentId, establishmentId));
    const target = staff.find((s) => s.id === staffId);
    if (!target) return "not_found" as const;

    const remainingOwners = staff.filter((s) => s.role === "owner" && s.id !== staffId);
    if (target.role === "owner" && remainingOwners.length === 0) {
      return "last_owner" as const;
    }

    await tx.delete(staffMembers).where(eq(staffMembers.id, staffId));
    return "removed" as const;
  });

  if (outcome === "not_found") redirect(`/${slug}/pro/equipe`);
  if (outcome === "last_owner") redirect(`/${slug}/pro/equipe?error=last_owner`);

  revalidatePath(`/${slug}/pro/equipe`);
}
