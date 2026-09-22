"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { platformAdmins } from "@/lib/db/schema";
import { getPlatformAdminCount } from "@/lib/db/queries";
import { createPlatformAdminSession, hashPassword } from "@/lib/auth";

export type SetupState = { error?: string };

// Ne crée jamais qu'un seul compte : dès que platform_admins a une ligne,
// cette action (et la page qui l'expose) refuse tout le reste — voir
// app/admin/setup/page.tsx pour la redirection côté rendu. La fenêtre de
// course entre la vérification et l'insertion est sans conséquence réelle
// ici (formulaire à usage unique, jamais exposé publiquement en pratique).
export async function createFirstAdmin(_prevState: SetupState, formData: FormData): Promise<SetupState> {
  const existing = await getPlatformAdminCount();
  if (existing > 0) redirect("/admin/login");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

  if (!name) return { error: "Merci d'indiquer un nom." };
  if (!email) return { error: "Merci d'indiquer un email." };
  if (password.length < 10) return { error: "Le mot de passe doit contenir au moins 10 caractères." };
  if (password !== passwordConfirm) return { error: "Les deux mots de passe ne correspondent pas." };

  const [admin] = await db
    .insert(platformAdmins)
    .values({ name, email, passwordHash: hashPassword(password) })
    .returning();

  await createPlatformAdminSession(admin);
  redirect("/admin");
}
