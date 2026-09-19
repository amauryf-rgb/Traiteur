"use server";

import { redirect } from "next/navigation";
import { getStaffMemberByAccessCode } from "@/lib/db/queries";
import { getPublicTenantContext, runAsTenant } from "@/lib/tenant";
import { createStaffSession } from "@/lib/auth";

export type LoginState = { error?: string };

export async function login(slug: string, _prevState: LoginState, formData: FormData): Promise<LoginState> {
  const accessCode = String(formData.get("accessCode") ?? "").trim();
  if (!accessCode) return { error: "Merci d'indiquer un code d'accès." };

  const tenant = await getPublicTenantContext(slug);
  if (!tenant) return { error: "Établissement introuvable." };
  const { establishment, context } = tenant;

  const staff = await runAsTenant(context, (tx) => getStaffMemberByAccessCode(tx, accessCode));
  if (!staff || staff.establishmentId !== establishment.id) {
    return { error: "Code d'accès invalide." };
  }

  await createStaffSession(staff);
  redirect(`/${slug}/pro`);
}
