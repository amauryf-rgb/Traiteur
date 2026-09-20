import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getEstablishmentBySlug, getInterEntityInvoiceDetail } from "@/lib/db/queries";
import { requireStaffTenantContext, runAsTenant } from "@/lib/tenant";
import { getPdfBlockReason } from "@/lib/billing";
import { InterEntityInvoiceDocument } from "@/lib/pdf/InterEntityInvoiceDocument";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; invoiceId: string }> }) {
  const { slug, invoiceId } = await params;

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) return new NextResponse("Not found", { status: 404 });

  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant || staffTenant.session.establishmentId !== establishment.id || staffTenant.session.role !== "owner") {
    return NextResponse.redirect(new URL(`/${slug}/pro/login`, request.url));
  }
  const { context } = staffTenant;

  const detail = await runAsTenant(context, (tx) => getInterEntityInvoiceDetail(tx, invoiceId));
  if (!detail || detail.invoice.establishmentId !== establishment.id) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { invoice, lines, fromEntity, toEntity } = detail;

  const blockingEntity = getPdfBlockReason(fromEntity, toEntity);
  if (blockingEntity) {
    const url = new URL(`/${slug}/pro/facturation`, request.url);
    url.searchParams.set("pdfError", blockingEntity.id);
    return NextResponse.redirect(url);
  }

  const buffer = await renderToBuffer(
    InterEntityInvoiceDocument({ invoice, lines, fromEntity, toEntity, establishmentName: establishment.name })
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
    },
  });
}
