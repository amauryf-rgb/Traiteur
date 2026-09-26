"use server";

import { headers } from "next/headers";
import { getPlatformAdminByEmail, setPlatformAdminPasswordResetToken } from "@/lib/db/queries";
import { generatePasswordResetToken } from "@/lib/auth";
import { sendEmail } from "@/lib/email";

export type ForgotPasswordState = { submitted?: boolean };

const RESET_TOKEN_DURATION_MS = 60 * 60 * 1000; // 1h

async function getBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "traiteur-app.netlify.app";
  return `https://${host}`;
}

// Répond TOUJOURS pareil, que l'email corresponde à un compte ou non — ne
// jamais révéler par la réponse si un compte existe (il n'y en a qu'un
// aujourd'hui, mais le principe reste correct même à plusieurs). Le seul
// jeton en clair transite dans l'email envoyé — la base ne garde que son hash.
export async function requestPasswordReset(_prevState: ForgotPasswordState, formData: FormData): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (email) {
    const admin = await getPlatformAdminByEmail(email);
    if (admin) {
      const { token, tokenHash } = generatePasswordResetToken();
      await setPlatformAdminPasswordResetToken(admin.id, tokenHash, new Date(Date.now() + RESET_TOKEN_DURATION_MS));

      const baseUrl = await getBaseUrl();
      const resetUrl = `${baseUrl}/admin/reset-password?token=${token}`;
      await sendEmail({
        to: admin.email,
        subject: "Réinitialisation de votre mot de passe — Console plateforme",
        html: `<p>Bonjour ${admin.name},</p><p>Une réinitialisation de mot de passe a été demandée pour votre compte de la console plateforme.</p><p><a href="${resetUrl}">Choisir un nouveau mot de passe</a> (lien valable 1 heure).</p><p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email — rien ne change tant que vous ne cliquez pas dessus.</p>`,
      });
    }
  }

  return { submitted: true };
}
