import { getPurchaseInvoiceScanStore } from "@/lib/blobs";
import { requireStaffTenantContext } from "@/lib/tenant";

// Contrairement à /api/product-photo (volontairement public — un plat du
// catalogue client), un scan de facture d'achat est un document financier :
// il ne suffit pas que la clé soit difficile à deviner, une session pro
// valide de l'établissement propriétaire est exigée. L'establishmentId du
// scan est vérifié via les métadonnées du blob, jamais via un paramètre
// fourni par l'appelant.
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;

  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant) return new Response("Unauthorized", { status: 401 });

  const store = getPurchaseInvoiceScanStore();
  const result = await store.getWithMetadata(key, { type: "arrayBuffer" });
  if (!result) return new Response("Not found", { status: 404 });

  if (result.metadata?.establishmentId !== staffTenant.session.establishmentId) {
    return new Response("Not found", { status: 404 });
  }

  const contentType = typeof result.metadata?.contentType === "string" ? result.metadata.contentType : "application/octet-stream";
  return new Response(result.data, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, no-store",
    },
  });
}
