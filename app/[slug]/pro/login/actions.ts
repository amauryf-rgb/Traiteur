"use server";

import { redirect } from "next/navigation";
import { getEstablishmentBySlug, getStaffMemberByAccessCode } from "@/lib/db/queries";
import { createStaffSession } from "@/lib/auth";

export type LoginState = { error?: string };

export async function login(slug: string, _prevState: LoginState, formData: FormData): Promise<LoginState> {
  const accessCode = String(formData.get("accessCode") ?? "").trim();
  if (!accessCode) return { error: "Merci d'indiquer un code d'accès." };

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) return { error: "Établissement introuvable." };

  const staff = await getStaffMemberByAccessCode(accessCode);
  if (!staff || staff.establishmentId !== establishment.id) {
    return { error: "Code d'accès invalide." };
  }

  await createStaffSession(staff);
  redirect(`/${slug}/pro`);
}
