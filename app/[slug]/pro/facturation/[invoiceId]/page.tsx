import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getEstablishmentBySlug, getInterEntityInvoiceDetail } from "@/lib/db/queries";
import { requireStaffTenantContext, runAsTenant } from "@/lib/tenant";
import { formatCHF } from "@/lib/format";
import { buttonClassName } from "@/components/ui/Button";
import { ProShell, ProPanel } from "@/components/pro/ProShell";

function formatSwissDate(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("fr-CH", { timeZone: "UTC" });
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ slug: string; invoiceId: string }>;
}) {
  const { slug, invoiceId } = await params;

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) notFound();

  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant || staffTenant.session.establishmentId !== establishment.id) redirect(`/${slug}/pro/login`);
  if (staffTenant.session.role !== "owner") redirect(`/${slug}/pro`);
  const { session, context } = staffTenant;

  const detail = await runAsTenant(context, (tx) => getInterEntityInvoiceDetail(tx, invoiceId));
  if (!detail || detail.invoice.establishmentId !== establishment.id) notFound();

  const { invoice, lines, fromEntity, toEntity } = detail;
  const includedLines = lines.filter((l) => l.included);
  const accentColor = establishment.accentColor ?? "#1a1a1a";

  return (
    <ProShell
      slug={slug}
      establishment={{ name: establishment.name, accentColor: establishment.accentColor }}
      staffName={session.name}
      isOwner
      active="facturation"
    >
      <ProPanel>
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200">
          <div>
            <p className="font-serif text-sm">Facture {invoice.invoiceNumber}</p>
            <Link href={`/${slug}/pro/facturation`} className="text-xs text-stone-400 hover:text-stone-600">
              ← Facturation
            </Link>
          </div>
          <Link
            href={`/${slug}/pro/facturation/${invoice.id}/pdf`}
            className={`${buttonClassName("secondary")} text-sm`}
            style={{ borderColor: accentColor, color: accentColor }}
          >
            Télécharger en PDF
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-stone-200 border-b border-stone-200">
          <div className="px-6 py-4">
            <p className="text-xs text-stone-400 mb-2">Émise par</p>
            <p className="text-sm font-medium">{fromEntity.name}</p>
            {fromEntity.addressLine1 && <p className="text-xs text-stone-500 mt-1">{fromEntity.addressLine1}</p>}
            {fromEntity.addressLine2 && <p className="text-xs text-stone-500">{fromEntity.addressLine2}</p>}
            {(fromEntity.addressPostalCode || fromEntity.addressCity) && (
              <p className="text-xs text-stone-500">
                {fromEntity.addressPostalCode} {fromEntity.addressCity}
              </p>
            )}
            {fromEntity.vatNumber && <p className="text-xs text-stone-400 mt-1">TVA {fromEntity.vatNumber}</p>}
            {fromEntity.ibanNumber && <p className="text-xs text-stone-400">IBAN {fromEntity.ibanNumber}</p>}
          </div>
          <div className="px-6 py-4">
            <p className="text-xs text-stone-400 mb-2">Adressée à</p>
            <p className="text-sm font-medium">{toEntity.name}</p>
            {toEntity.addressLine1 && <p className="text-xs text-stone-500 mt-1">{toEntity.addressLine1}</p>}
            {toEntity.addressLine2 && <p className="text-xs text-stone-500">{toEntity.addressLine2}</p>}
            {(toEntity.addressPostalCode || toEntity.addressCity) && (
              <p className="text-xs text-stone-500">
                {toEntity.addressPostalCode} {toEntity.addressCity}
              </p>
            )}
            {toEntity.vatNumber && <p className="text-xs text-stone-400 mt-1">TVA {toEntity.vatNumber}</p>}
          </div>
        </div>

        <div className="px-6 py-3 border-b border-stone-200 text-xs text-stone-400">
          Période du {formatSwissDate(invoice.periodStart)} au {formatSwissDate(invoice.periodEnd)}
        </div>

        <div className="divide-y divide-stone-100">
          {includedLines.map((line) => (
            <div key={line.id} className="px-6 py-3 flex justify-between items-center text-sm">
              <span className="text-stone-600">{line.description}</span>
              <span className="font-medium">{formatCHF(Number(line.amount))}</span>
            </div>
          ))}
          {includedLines.length === 0 && <p className="px-6 py-6 text-center text-sm text-stone-400">Aucune ligne.</p>}
        </div>

        <div className="px-6 py-4 border-t border-stone-200 flex justify-between font-medium">
          <span>Total</span>
          <span>{formatCHF(Number(invoice.totalAmount))}</span>
        </div>
      </ProPanel>
    </ProShell>
  );
}
