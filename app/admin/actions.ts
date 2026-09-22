"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { establishments, legalEntities, paymentAccounts, staffMembers } from "@/lib/db/schema";
import { requirePlatformAdminContext, runAsTenant, type Tx } from "@/lib/tenant";
import { clearPlatformAdminSession } from "@/lib/auth";

export async function logoutPlatformAdmin() {
  await clearPlatformAdminSession();
  redirect("/admin/login");
}

export type AddPartnerState = { error?: string; success?: { slug: string; ownerAccessCode: string } };

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function generateAccessCode(tx: Tx): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const [existing] = await tx.select().from(staffMembers).where(eq(staffMembers.accessCode, code));
    if (!existing) return code;
  }
  throw new Error("Impossible de générer un code d'accès unique.");
}

// Crée un établissement minimal mais immédiatement fonctionnel : une entité
// juridique par défaut et un compte de paiement "pending" (sans les deux,
// le checkout client échoue avec NoSellingEntityError / NoPaymentAccountError
// — voir app/[slug]/[type]/actions.ts), plus le premier compte owner. Le
// reste (logo, couleur, catalogue) se configure ensuite depuis /pro, comme
// pour LabTraiteur.
export async function addPartner(_prevState: AddPartnerState, formData: FormData): Promise<AddPartnerState> {
  const platformAdmin = await requirePlatformAdminContext();
  if (!platformAdmin) redirect("/admin/login");

  const name = String(formData.get("name") ?? "").trim();
  const ownerName = String(formData.get("ownerName") ?? "").trim();
  const requestedSlug = String(formData.get("slug") ?? "").trim();
  const slug = slugify(requestedSlug || name);

  if (!name) return { error: "Merci d'indiquer le nom de l'établissement." };
  if (!ownerName) return { error: "Merci d'indiquer le nom du propriétaire." };
  if (!slug) return { error: "Impossible de déduire une URL valide de ce nom — précise un slug." };
  if (slug === "admin") return { error: "Ce slug est réservé." };

  const result = await runAsTenant(platformAdmin.context, async (tx) => {
    const [slugTaken] = await tx.select({ id: establishments.id }).from(establishments).where(eq(establishments.slug, slug));
    if (slugTaken) return { error: `L'URL "${slug}" est déjà utilisée.` } as AddPartnerState;

    const [establishment] = await tx
      .insert(establishments)
      .values({ name, slug, onboardingStatus: "active" })
      .returning();

    const [entity] = await tx
      .insert(legalEntities)
      .values({ establishmentId: establishment.id, name, isDefault: true })
      .returning();

    await tx.insert(paymentAccounts).values({
      legalEntityId: entity.id,
      pspProvider: "stripe",
      externalAccountId: "pending",
      status: "pending",
    });

    const accessCode = await generateAccessCode(tx);
    await tx.insert(staffMembers).values({
      establishmentId: establishment.id,
      legalEntityId: entity.id,
      name: ownerName,
      initials: ownerName.slice(0, 2).toUpperCase(),
      role: "owner",
      accessCode,
    });

    return { success: { slug: establishment.slug, ownerAccessCode: accessCode } } as AddPartnerState;
  });

  if (!result.error) revalidatePath("/admin");
  return result;
}
