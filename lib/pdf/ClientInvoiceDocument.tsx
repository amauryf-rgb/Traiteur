import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { formatCHF } from "@/lib/format";
import type { clientInvoices, legalEntities, orderItems, orders } from "@/lib/db/schema";

type ClientInvoice = typeof clientInvoices.$inferSelect;
type Order = typeof orders.$inferSelect;
type OrderItem = typeof orderItems.$inferSelect;
type LegalEntity = typeof legalEntities.$inferSelect;

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  unpaid: "Non payée",
  deposit_paid: "Acompte versé",
  paid: "Payée",
  refunded_partial: "Partiellement remboursée",
  refunded_full: "Remboursée",
};

// Styles délibérément identiques à InterEntityInvoiceDocument (même
// vocabulaire visuel pour tout document "facture" émis par l'app) — la
// facture client n'a pas de bloc destinataire avec adresse (orders ne
// stocke qu'un nom + un contact libre, jamais une adresse de facturation).
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
  colQty: { width: 40, textAlign: "right" },
  colUnitPrice: { width: 70, textAlign: "right" },
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

function formatSwissDate(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("fr-CH", { timeZone: "UTC" });
}

export function ClientInvoiceDocument({
  invoice,
  order,
  items,
  sellingEntity,
  establishmentName,
}: {
  invoice: ClientInvoice;
  order: Order;
  items: OrderItem[];
  sellingEntity: LegalEntity;
  establishmentName: string;
}) {
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
            <Text style={styles.muted}>Commande du {formatSwissDate(order.pickupDate)}</Text>
            <Text style={styles.muted}>Émise le {formatSwissDate(invoice.generatedAt.toISOString().slice(0, 10))}</Text>
          </View>
        </View>

        <View style={styles.parties}>
          <View style={styles.partyBlock}>
            <Text style={styles.partyLabel}>Émise par</Text>
            <Text style={styles.partyName}>{sellingEntity.name}</Text>
            {sellingEntity.addressLine1 && <Text style={styles.partyLine}>{sellingEntity.addressLine1}</Text>}
            {sellingEntity.addressLine2 && <Text style={styles.partyLine}>{sellingEntity.addressLine2}</Text>}
            {(sellingEntity.addressPostalCode || sellingEntity.addressCity) && (
              <Text style={styles.partyLine}>
                {sellingEntity.addressPostalCode} {sellingEntity.addressCity}
              </Text>
            )}
            {sellingEntity.vatNumber && <Text style={[styles.partyLine, styles.muted]}>N° TVA : {sellingEntity.vatNumber}</Text>}
            {sellingEntity.ibanNumber && (
              <>
                <Text style={[styles.partyLine, styles.muted, { marginTop: 6 }]}>IBAN : {sellingEntity.ibanNumber}</Text>
                {sellingEntity.bankName && <Text style={[styles.partyLine, styles.muted]}>Banque : {sellingEntity.bankName}</Text>}
              </>
            )}
          </View>
          <View style={styles.partyBlock}>
            <Text style={styles.partyLabel}>Adressée à</Text>
            <Text style={styles.partyName}>{order.clientName}</Text>
            {order.clientContact && <Text style={styles.partyLine}>{order.clientContact}</Text>}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDescription}>Produit</Text>
            <Text style={styles.colQty}>Qté</Text>
            <Text style={styles.colUnitPrice}>Prix unit.</Text>
            <Text style={styles.colAmount}>Montant</Text>
          </View>
          {items.map((item) => (
            <View key={item.id} style={styles.tableRow}>
              <Text style={styles.colDescription}>{item.productNameSnapshot}</Text>
              <Text style={styles.colQty}>{item.quantity}</Text>
              <Text style={styles.colUnitPrice}>{formatCHF(Number(item.unitPriceSnapshot))}</Text>
              <Text style={styles.colAmount}>{formatCHF(Number(item.unitPriceSnapshot) * item.quantity)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalAmount}>{formatCHF(Number(order.totalAmount))}</Text>
        </View>

        <View style={styles.footer}>
          <Text>Statut : {PAYMENT_STATUS_LABEL[order.paymentStatus] ?? order.paymentStatus}</Text>
          {sellingEntity.ibanNumber && (
            <Text style={{ marginTop: 4 }}>
              Paiement par virement à {sellingEntity.name} — IBAN {sellingEntity.ibanNumber}
              {sellingEntity.bankName ? ` (${sellingEntity.bankName})` : ""}. Référence : {invoice.invoiceNumber}.
            </Text>
          )}
        </View>
      </Page>
    </Document>
  );
}
