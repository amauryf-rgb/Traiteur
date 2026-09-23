import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getEstablishmentBySlug } from "@/lib/db/queries";
import { requireOwnerScope } from "../../actions";
import { runAsTenant } from "@/lib/tenant";
import { getOrCreateClientInvoice } from "@/lib/invoicing";
import { ClientInvoiceDocument } from "@/lib/pdf/ClientInvoiceDocument";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; orderId: string }> }) {
  const { slug, orderId } = await params;

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) return new NextResponse("Not found", { status: 404 });

  const { establishmentId, context, allowedEntityId } = await requireOwnerScope(slug);
  if (establishmentId !== establishment.id) return new NextResponse("Not found", { status: 404 });

  const bundle = await runAsTenant(context, (tx) => getOrCreateClientInvoice(tx, orderId));
  if (!bundle || bundle.order.establishmentId !== establishment.id) {
    return new NextResponse("Not found", { status: 404 });
  }
  // Richard (boutique) ne doit jamais pouvoir récupérer la facture d'une
  // commande traiteur en devinant/tapant son orderId directement dans l'URL
  // — même contrôle que le filtrage de liste, appliqué ici en lecture directe.
  if (allowedEntityId && bundle.order.sellingEntityId !== allowedEntityId) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buffer = await renderToBuffer(
    ClientInvoiceDocument({
      invoice: bundle.invoice,
      order: bundle.order,
      items: bundle.items,
      sellingEntity: bundle.sellingEntity,
      establishmentName: establishment.name,
    })
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${bundle.invoice.invoiceNumber}.pdf"`,
    },
  });
}
