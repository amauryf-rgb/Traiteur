import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { formatCHF } from "@/lib/format";
import type { AccountingReportData } from "@/lib/db/queries";

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  unpaid: "Non payée",
  deposit_paid: "Acompte versé",
  paid: "Payée",
  refunded_partial: "Partiellement remboursée",
  refunded_full: "Remboursée",
};

// Mêmes styles que ClientInvoiceDocument/InterEntityInvoiceDocument — un
// seul vocabulaire visuel pour tout document généré par l'app.
const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 10, fontFamily: "Helvetica", color: "#1c1917" },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  muted: { color: "#78716c" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  headerBlock: { marginBottom: 24 },
  section: { marginBottom: 20 },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 12, marginBottom: 8 },
  summaryGrid: { flexDirection: "row", gap: 16, marginBottom: 8 },
  summaryTile: { flex: 1, padding: 10, backgroundColor: "#f5f5f4", borderRadius: 4 },
  summaryLabel: { color: "#78716c", fontSize: 8, textTransform: "uppercase", marginBottom: 4 },
  summaryValue: { fontFamily: "Helvetica-Bold", fontSize: 14 },
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
    paddingVertical: 5,
  },
  colEntity: { flex: 1 },
  colCount: { width: 60, textAlign: "right" },
  colAmount: { width: 80, textAlign: "right" },
  colNumber: { width: 80 },
  colDate: { width: 60 },
  colClient: { flex: 1 },
  colStatus: { width: 90 },
  footer: { marginTop: 24, fontSize: 8, color: "#a8a29e" },
});

function formatSwissDate(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("fr-CH", { timeZone: "UTC" });
}

export function AccountingReportDocument({
  data,
  establishmentName,
  scopedEntityName,
}: {
  data: AccountingReportData;
  establishmentName: string;
  scopedEntityName: string | null;
}) {
  const result = (Number(data.totalRevenue) - Number(data.totalPurchases)).toFixed(2);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerBlock}>
          <Text style={styles.title}>Rapport comptable</Text>
          <Text style={styles.muted}>
            {establishmentName}
            {scopedEntityName ? ` — ${scopedEntityName}` : ""}
          </Text>
          <Text style={styles.muted}>
            Période du {formatSwissDate(data.periodStart)} au {formatSwissDate(data.periodEnd)}
          </Text>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryLabel}>Chiffre d&apos;affaires</Text>
            <Text style={styles.summaryValue}>{formatCHF(Number(data.totalRevenue))}</Text>
          </View>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryLabel}>Factures d&apos;achat</Text>
            <Text style={styles.summaryValue}>{formatCHF(Number(data.totalPurchases))}</Text>
          </View>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryLabel}>Résultat brut</Text>
            <Text style={styles.summaryValue}>{formatCHF(Number(result))}</Text>
          </View>
        </View>

        {data.revenueByEntity.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Chiffre d&apos;affaires par entité</Text>
            <View style={styles.tableHeader}>
              <Text style={styles.colEntity}>Entité</Text>
              <Text style={styles.colCount}>Commandes</Text>
              <Text style={styles.colAmount}>Montant</Text>
            </View>
            {data.revenueByEntity.map((row) => (
              <View key={row.entityId} style={styles.tableRow}>
                <Text style={styles.colEntity}>{row.entityName}</Text>
                <Text style={styles.colCount}>{row.orderCount}</Text>
                <Text style={styles.colAmount}>{formatCHF(Number(row.revenue))}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Factures clients émises ({data.invoices.length})</Text>
          <View style={styles.tableHeader}>
            <Text style={styles.colNumber}>N°</Text>
            <Text style={styles.colDate}>Date</Text>
            <Text style={styles.colClient}>Client</Text>
            <Text style={styles.colStatus}>Statut</Text>
            <Text style={styles.colAmount}>Montant</Text>
          </View>
          {data.invoices.map((row) => (
            <View key={row.id} style={styles.tableRow}>
              <Text style={styles.colNumber}>{row.invoiceNumber ?? "—"}</Text>
              <Text style={styles.colDate}>{formatSwissDate(row.pickupDate)}</Text>
              <Text style={styles.colClient}>{row.clientName}</Text>
              <Text style={styles.colStatus}>{PAYMENT_STATUS_LABEL[row.paymentStatus] ?? row.paymentStatus}</Text>
              <Text style={styles.colAmount}>{formatCHF(Number(row.totalAmount))}</Text>
            </View>
          ))}
          {data.invoices.length === 0 && <Text style={styles.muted}>Aucune commande sur cette période.</Text>}
        </View>

        <Text style={styles.footer}>Le détail ligne par ligne (factures clients et factures d&apos;achat) est disponible en export CSV.</Text>
      </Page>
    </Document>
  );
}
