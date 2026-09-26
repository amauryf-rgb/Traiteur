"use server";

import { redirect } from "next/navigation";
import { clearPlatformAdminPasswordResetToken, getPlatformAdminByResetTokenHash, updatePlatformAdminPassword } from "@/lib/db/queries";
import { hashPassword, hashPasswordResetToken } from "@/lib/auth";

export type ResetPasswordState = { error?: string };

export async function resetPassword(_prevState: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!token) return { error: "Lien invalide." };
  if (password.length < 10) return { error: "Le mot de passe doit contenir au moins 10 caractères." };
  if (password !== confirmPassword) return { error: "Les deux mots de passe ne correspondent pas." };

  const admin = await getPlatformAdminByResetTokenHash(hashPasswordResetToken(token));
  if (!admin || !admin.passwordResetExpiresAt || admin.passwordResetExpiresAt < new Date()) {
    return { error: "Ce lien de réinitialisation est invalide ou a expiré. Refaites une demande." };
  }

  await updatePlatformAdminPassword(admin.id, hashPassword(password));
  // Jeton à usage unique : invalidé immédiatement après consommation, pour
  // qu'un lien déjà utilisé (mail transféré, historique du navigateur) ne
  // permette jamais un second changement.
  await clearPlatformAdminPasswordResetToken(admin.id);

  redirect("/admin/login?reset=success");
}
