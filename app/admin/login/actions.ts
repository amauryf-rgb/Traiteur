"use server";

import { redirect } from "next/navigation";
import { getPlatformAdminByEmail } from "@/lib/db/queries";
import { createPlatformAdminSession, verifyPassword } from "@/lib/auth";

export type LoginState = { error?: string };

export async function loginPlatformAdmin(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Merci d'indiquer un email et un mot de passe." };

  const admin = await getPlatformAdminByEmail(email);
  if (!admin || !verifyPassword(password, admin.passwordHash)) {
    return { error: "Email ou mot de passe invalide." };
  }

  await createPlatformAdminSession(admin);
  redirect("/admin");
}
