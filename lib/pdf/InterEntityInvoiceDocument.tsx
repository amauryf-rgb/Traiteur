import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { formatCHF } from "@/lib/format";
import type { legalEntities, interEntityInvoiceLines, interEntityInvoices } from "@/lib/db/schema";

type LegalEntity = typeof legalEntities.$inferSelect;
type InvoiceLine = typeof interEntityInvoiceLines.$inferSelect;
type Invoice = typeof interEntityInvoices.$inferSelect;

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 10, fontFamily: "Helvetica", color: "#1c1917" },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  muted: { color: "#78716c" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  headerBlock: { marginBottom: 24 },
  parties: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  partyBlock: { width: "45%" },
  partyLabel: { color: "#78716c", fontSize: 8, textTransform: "uppercase", marginBottom: 4 },
  partyName: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 2 },
  partyLine: { marginBottom: 1 },
  section: { marginBottom: 16 },
  tableHeader: {
    flexDirection: "row",
    borderBottom: "1pt solid #d6d3d1",
    paddingBottom: 4,
    marginBottom: 4,
    color: "#78716c",
    fontSize: 8,
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: "0.5pt solid #e7e5e4",
    paddingVertical: 6,
  },
  colDescription: { flex: 1 },
  colAmount: { width: 80, textAlign: "right" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 12,
    paddingTop: 8,
    borderTop: "1pt solid #1c1917",
  },
  totalLabel: { fontFamily: "Helvetica-Bold", marginRight: 24 },
  totalAmount: { fontFamily: "Helvetica-Bold" },
  footer: { marginTop: 32, fontSize: 9, color: "#78716c" },
});

function AddressBlock({ entity, label, showPaymentDetails }: { entity: LegalEntity; label: string; showPaymentDetails: boolean }) {
  return (
    <View style={styles.partyBlock}>
      <Text style={styles.partyLabel}>{label}</Text>
      <Text style={styles.partyName}>{entity.name}</Text>
      {entity.addressLine1 && <Text style={styles.partyLine}>{entity.addressLine1}</Text>}
      {entity.addressLine2 && <Text style={styles.partyLine}>{entity.addressLine2}</Text>}
      {(entity.addressPostalCode || entity.addressCity) && (
        <Text style={styles.partyLine}>
          {entity.addressPostalCode} {entity.addressCity}
        </Text>
      )}
      {entity.addressCountry && entity.addressCountry !== "CH" && <Text style={styles.partyLine}>{entity.addressCountry}</Text>}
      {entity.vatNumber && <Text style={[styles.partyLine, styles.muted]}>N° TVA : {entity.vatNumber}</Text>}
      {showPaymentDetails && entity.ibanNumber && (
        <>
          <Text style={[styles.partyLine, styles.muted, { marginTop: 6 }]}>IBAN : {entity.ibanNumber}</Text>
          {entity.bankName && <Text style={[styles.partyLine, styles.muted]}>Banque : {entity.bankName}</Text>}
        </>
      )}
    </View>
  );
}

function formatSwissDate(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("fr-CH", { timeZone: "UTC" });
}

export function InterEntityInvoiceDocument({
  invoice,
  lines,
  fromEntity,
  toEntity,
  establishmentName,
}: {
  invoice: Invoice;
  lines: InvoiceLine[];
  fromEntity: LegalEntity;
  toEntity: LegalEntity;
  establishmentName: string;
}) {
  const includedLines = lines.filter((l) => l.included);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={[styles.headerBlock, styles.row]}>
          <View>
            <Text style={styles.title}>Facture</Text>
            <Text style={styles.muted}>{establishmentName}</Text>
          </View>
          <View>
            <Text>N° {invoice.invoiceNumber}</Text>
            <Text style={styles.muted}>
              Période du {formatSwissDate(invoice.periodStart)} au {formatSwissDate(invoice.periodEnd)}
            </Text>
            {invoice.generatedAt && (
              <Text style={styles.muted}>Émise le {invoice.generatedAt.toLocaleDateString("fr-CH")}</Text>
            )}
          </View>
        </View>

        <View style={styles.parties}>
          <AddressBlock entity={fromEntity} label="Émise par" showPaymentDetails />
          <AddressBlock entity={toEntity} label="Adressée à" showPaymentDetails={false} />
        </View>

        <View style={styles.section}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDescription}>Description</Text>
            <Text style={styles.colAmount}>Montant</Text>
          </View>
          {includedLines.map((line) => (
            <View key={line.id} style={styles.tableRow}>
              <Text style={styles.colDescription}>{line.description}</Text>
              <Text style={styles.colAmount}>{formatCHF(Number(line.amount))}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalAmount}>{formatCHF(Number(invoice.totalAmount))}</Text>
        </View>

        {fromEntity.ibanNumber && (
          <View style={styles.footer}>
            <Text>
              Paiement par virement à {fromEntity.name} — IBAN {fromEntity.ibanNumber}
              {fromEntity.bankName ? ` (${fromEntity.bankName})` : ""}. Référence : {invoice.invoiceNumber}.
            </Text>
          </View>
        )}
      </Page>
    </Document>
  );
}
