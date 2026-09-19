"use server";

import { redirect } from "next/navigation";
import { clearClientSession, createClientSession, hashPassword, verifyPassword } from "@/lib/auth";
import { clients } from "@/lib/db/schema";
import { getClientByEmail } from "@/lib/db/queries";
import { getPublicTenantContext, runAsTenant } from "@/lib/tenant";

export type AuthFormState = { error?: string };

export async function login(slug: string, _prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Merci d'indiquer votre email et votre mot de passe." };

  const tenant = await getPublicTenantContext(slug);
  if (!tenant) return { error: "Établissement introuvable." };
  const { context } = tenant;

  const client = await runAsTenant(context, (tx) => getClientByEmail(tx, tenant.establishment.id, email));
  if (!client || !client.passwordHash || !verifyPassword(password, client.passwordHash)) {
    return { error: "Email ou mot de passe incorrect." };
  }

  await createClientSession({ id: client.id, establishmentId: client.establishmentId, name: client.name });
  redirect(`/${slug}`);
}

export async function signup(slug: string, _prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!name) return { error: "Merci d'indiquer votre nom." };
  if (!email) return { error: "Merci d'indiquer votre email." };
  if (password.length < 8) return { error: "Le mot de passe doit contenir au moins 8 caractères." };

  const tenant = await getPublicTenantContext(slug);
  if (!tenant) return { error: "Établissement introuvable." };
  const { establishment, context } = tenant;

  let clientId: string;
  try {
    const created = await runAsTenant(context, async (tx) => {
      const [row] = await tx
        .insert(clients)
        .values({ establishmentId: establishment.id, name, email, passwordHash: hashPassword(password) })
        .returning({ id: clients.id });
      return row;
    });
    clientId = created.id;
  } catch (err) {
    // Contrainte unique (establishment_id, email) : un compte existe déjà
    // avec cet email pour cet établissement précis.
    if (err instanceof Error && err.message.includes("clients_establishment_email_unique")) {
      return { error: "Un compte existe déjà avec cet email." };
    }
    throw err;
  }

  await createClientSession({ id: clientId, establishmentId: establishment.id, name });
  redirect(`/${slug}`);
}

export async function logout(slug: string) {
  await clearClientSession();
  redirect(`/${slug}`);
}
