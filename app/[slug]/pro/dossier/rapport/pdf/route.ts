import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getAccountingReportData, getEstablishmentBySlug, getLegalEntitiesForEstablishment } from "@/lib/db/queries";
import { runAsTenant } from "@/lib/tenant";
import { requireOwnerScope } from "../../actions";
import { AccountingReportDocument } from "@/lib/pdf/AccountingReportDocument";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const periodStart = searchParams.get("dateFrom");
  const periodEnd = searchParams.get("dateTo");
  if (!periodStart || !periodEnd) return new NextResponse("Missing dateFrom/dateTo", { status: 400 });

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) return new NextResponse("Not found", { status: 404 });

  const { establishmentId, context, allowedEntityId } = await requireOwnerScope(slug);
  if (establishmentId !== establishment.id) return new NextResponse("Not found", { status: 404 });

  const { data, scopedEntityName } = await runAsTenant(context, async (tx) => {
    const data = await getAccountingReportData(tx, { establishmentId: establishment.id, periodStart, periodEnd, allowedEntityId });
    let scopedEntityName: string | null = null;
    if (allowedEntityId) {
      const entities = await getLegalEntitiesForEstablishment(tx, establishment.id);
      scopedEntityName = entities.find((e) => e.id === allowedEntityId)?.name ?? null;
    }
    return { data, scopedEntityName };
  });

  const buffer = await renderToBuffer(AccountingReportDocument({ data, establishmentName: establishment.name, scopedEntityName }));

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="rapport-comptable-${periodStart}-${periodEnd}.pdf"`,
    },
  });
}
