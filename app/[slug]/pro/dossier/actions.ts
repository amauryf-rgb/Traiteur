"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { legalEntities, purchaseInvoices } from "@/lib/db/schema";
import { getStaffLegalEntityId } from "@/lib/db/queries";
import { requireStaffTenantContext, runAsTenant, type TenantContext } from "@/lib/tenant";
import { getPurchaseInvoiceScanStore, PURCHASE_INVOICE_SCAN_ROUTE_PREFIX } from "@/lib/blobs";
import { randomUUID } from "crypto";

// Cloisonnement Richard/boutique, Michele/traiteur (les "trois points déjà
// tranchés" de ce chantier) : allowedEntityId vient de staff_members.legal_entity_id,
// jamais d'un champ de formulaire. Un owner mono-entité (établissement à une
// seule société) a un allowedEntityId qui pointe vers sa seule entité — le
// filtrer dessus ne restreint rien dans ce cas, toutes les lignes lui
// appartiennent déjà.
export async function requireOwnerScope(
  slug: string
): Promise<{ establishmentId: string; context: TenantContext; allowedEntityId: string | null; staffName: string }> {
  const staffTenant = await requireStaffTenantContext();
  // Pas de session valide : reconnexion nécessaire. Session valide mais rôle
  // insuffisant (manager/employé) : retour au dashboard, pas de reconnexion
  // forcée — même distinction que fermetures/page.tsx et facturation/page.tsx.
  if (!staffTenant) redirect(`/${slug}/pro/login`);
  if (staffTenant.session.role !== "owner") redirect(`/${slug}/pro`);
  const { establishmentId, name } = staffTenant.session;
  const allowedEntityId = await runAsTenant(staffTenant.context, (tx) => getStaffLegalEntityId(tx, staffTenant.session.staffMemberId));
  return { establishmentId, context: staffTenant.context, allowedEntityId, staffName: name };
}

const ALLOWED_SCAN_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const MAX_SCAN_BYTES = 10 * 1024 * 1024;

export type AddPurchaseInvoiceState = { error?: string };

export async function addPurchaseInvoice(slug: string, _prevState: AddPurchaseInvoiceState, formData: FormData): Promise<AddPurchaseInvoiceState> {
  const { establishmentId, context, allowedEntityId } = await requireOwnerScope(slug);

  const supplierName = String(formData.get("supplierName") ?? "").trim();
  const invoiceDate = String(formData.get("invoiceDate") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  // Un owner scopé ne peut jamais choisir l'autre entité, même en bricolant
  // le formulaire (champ absent du DOM dans ce cas, voir AddPurchaseInvoiceForm) —
  // allowedEntityId prime toujours sur legalEntityId fourni.
  const requestedEntityId = String(formData.get("legalEntityId") ?? "");
  const legalEntityId = allowedEntityId ?? requestedEntityId;

  if (!supplierName) return { error: "Merci d'indiquer le fournisseur." };
  if (!invoiceDate) return { error: "Merci d'indiquer une date." };
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Montant invalide." };
  if (!legalEntityId) return { error: "Merci de choisir une entité." };

  const scan = formData.get("scan");
  let scanUrl: string | null = null;
  if (scan instanceof File && scan.size > 0) {
    const extension = ALLOWED_SCAN_TYPES[scan.type];
    if (!extension) return { error: "Format non supporté (JPEG, PNG, WebP ou PDF uniquement)." };
    if (scan.size > MAX_SCAN_BYTES) return { error: "Fichier trop volumineux (10 Mo maximum)." };

    const key = `${randomUUID()}.${extension}`;
    const store = getPurchaseInvoiceScanStore();
    await store.set(key, await scan.arrayBuffer(), { metadata: { contentType: scan.type, establishmentId } });
    scanUrl = `${PURCHASE_INVOICE_SCAN_ROUTE_PREFIX}${key}`;
  }

  const result = await runAsTenant(context, async (tx) => {
    // legalEntityId vient soit de la session (owner scopé, fiable), soit
    // d'un <select> réel (owner mono-entité qui gère les deux univers) —
    // dans ce second cas seulement, valider qu'elle appartient bien à cet
    // établissement avant d'insérer (piège n°3, schema.sql section 11).
    const [entity] = await tx
      .select({ id: legalEntities.id })
      .from(legalEntities)
      .where(and(eq(legalEntities.id, legalEntityId), eq(legalEntities.establishmentId, establishmentId)));
    if (!entity) return { error: "Entité invalide." } as AddPurchaseInvoiceState;

    await tx.insert(purchaseInvoices).values({
      establishmentId,
      legalEntityId,
      supplierName,
      invoiceDate,
      amount: amount.toFixed(2),
      description,
      scanUrl,
    });
    return null;
  });

  if (result?.error) return result;

  revalidatePath(`/${slug}/pro/dossier`);
  return {};
}
