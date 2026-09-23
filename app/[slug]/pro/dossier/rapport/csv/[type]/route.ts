import { NextResponse } from "next/server";
import { getAccountingReportData, getEstablishmentBySlug, getLegalEntitiesForEstablishment } from "@/lib/db/queries";
import { runAsTenant } from "@/lib/tenant";
import { requireOwnerScope } from "../../../actions";
import { toCsv } from "@/lib/csv";

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  unpaid: "Non payée",
  deposit_paid: "Acompte versé",
  paid: "Payée",
  refunded_partial: "Partiellement remboursée",
  refunded_full: "Remboursée",
};

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; type: string }> }) {
  const { slug, type } = await params;
  if (type !== "factures" && type !== "achats") return new NextResponse("Not found", { status: 404 });

  const { searchParams } = new URL(request.url);
  const periodStart = searchParams.get("dateFrom");
  const periodEnd = searchParams.get("dateTo");
  if (!periodStart || !periodEnd) return new NextResponse("Missing dateFrom/dateTo", { status: 400 });

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) return new NextResponse("Not found", { status: 404 });

  const { establishmentId, context, allowedEntityId } = await requireOwnerScope(slug);
  if (establishmentId !== establishment.id) return new NextResponse("Not found", { status: 404 });

  const { data, entityNameById } = await runAsTenant(context, async (tx) => {
    const data = await getAccountingReportData(tx, { establishmentId: establishment.id, periodStart, periodEnd, allowedEntityId });
    const entities = await getLegalEntitiesForEstablishment(tx, establishment.id);
    return { data, entityNameById: new Map(entities.map((e) => [e.id, e.name])) };
  });

  const csv =
    type === "factures"
      ? toCsv(
          ["Numéro", "Date", "Client", "Entité", "Univers", "Montant", "Statut paiement"],
          data.invoices.map((row) => [
            row.invoiceNumber ?? "",
            row.pickupDate,
            row.clientName,
            entityNameById.get(row.sellingEntityId) ?? "",
            row.orderType,
            row.totalAmount,
            PAYMENT_STATUS_LABEL[row.paymentStatus] ?? row.paymentStatus,
          ])
        )
      : toCsv(
          ["Date", "Fournisseur", "Entité", "Montant", "Description"],
          data.purchases.map((p) => [p.invoiceDate, p.supplierName, entityNameById.get(p.legalEntityId) ?? "", p.amount, p.description ?? ""])
        );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${type}-${periodStart}-${periodEnd}.csv"`,
    },
  });
}
