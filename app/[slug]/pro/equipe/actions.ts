"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { staffMembers, legalEntities } from "@/lib/db/schema";
import { getStaffSession } from "@/lib/auth";
import { getEstablishmentBySlug } from "@/lib/db/queries";

export type StaffFormState = { error?: string };

async function requireOwner(slug: string) {
  const session = await getStaffSession();
  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment || !session || session.establishmentId !== establishment.id || session.role !== "owner") {
    redirect(`/${slug}/pro/login`);
  }
  return { session: session!, establishment: establishment! };
}

async function generateAccessCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const [existing] = await db.select().from(staffMembers).where(eq(staffMembers.accessCode, code));
    if (!existing) return code;
  }
  throw new Error("Impossible de générer un code d'accès unique.");
}

export async function addStaffMember(slug: string, _prevState: StaffFormState, formData: FormData): Promise<StaffFormState> {
  const { establishment } = await requireOwner(slug);

  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  const legalEntityId = String(formData.get("legalEntityId") ?? "");

  if (!name) return { error: "Merci d'indiquer un nom." };
  if (!["owner", "manager", "employee"].includes(role)) return { error: "Rôle invalide." };

  const [entity] = await db
    .select()
    .from(legalEntities)
    .where(and(eq(legalEntities.id, legalEntityId), eq(legalEntities.establishmentId, establishment.id)));
  if (!entity) return { error: "Entité juridique invalide." };

  const accessCode = await generateAccessCode();

  await db.insert(staffMembers).values({
    establishmentId: establishment.id,
    legalEntityId: entity.id,
    name,
    initials: name.slice(0, 2).toUpperCase(),
    role,
    accessCode,
  });

  revalidatePath(`/${slug}/pro/equipe`);
  return {};
}

export async function removeStaffMember(slug: string, staffId: string) {
  const { establishment } = await requireOwner(slug);

  const staff = await db.select().from(staffMembers).where(eq(staffMembers.establishmentId, establishment.id));
  const target = staff.find((s) => s.id === staffId);
  if (!target) redirect(`/${slug}/pro/equipe`);

  const remainingOwners = staff.filter((s) => s.role === "owner" && s.id !== staffId);
  if (target!.role === "owner" && remainingOwners.length === 0) {
    redirect(`/${slug}/pro/equipe?error=last_owner`);
  }

  await db.delete(staffMembers).where(eq(staffMembers.id, staffId));
  revalidatePath(`/${slug}/pro/equipe`);
}
