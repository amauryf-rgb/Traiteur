import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  date,
  time,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// =====================================================================
// SCHÉMA DRIZZLE — traduction directe de schema.sql
// Voir schema.sql pour les commentaires détaillés sur chaque décision.
// =====================================================================

// ---------------------------------------------------------------------
// 1. Établissements et entités juridiques
// ---------------------------------------------------------------------

export const establishments = pgTable("establishments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  tagline: text("tagline"),
  logoUrl: text("logo_url"),
  bannerUrl: text("banner_url"),
  accentColor: text("accent_color"),
  customDomain: text("custom_domain"),
  onboardingStatus: text("onboarding_status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("onboarding_status_check", sql`${t.onboardingStatus} IN ('draft','payment_pending','active','suspended')`),
]);

export const legalEntities = pgTable("legal_entities", {
  id: uuid("id").primaryKey().defaultRandom(),
  establishmentId: uuid("establishment_id").notNull().references(() => establishments.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  roleLabel: text("role_label"),
  uidNumber: text("uid_number"),
  vatNumber: text("vat_number"),
  isDefault: boolean("is_default").notNull().default(true),
  // Quelle entité encaisse par défaut pour quel univers de vente (boutique /
  // traiteur) — NULL si cette entité gère les deux (cas mono-entité).
  defaultOrderType: text("default_order_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("legal_entity_default_order_type_check", sql`${t.defaultOrderType} IN ('boutique','traiteur')`),
]);

export const paymentAccounts = pgTable("payment_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  legalEntityId: uuid("legal_entity_id").notNull().references(() => legalEntities.id, { onDelete: "cascade" }),
  pspProvider: text("psp_provider").notNull(),
  externalAccountId: text("external_account_id").notNull(),
  status: text("status").notNull().default("pending"),
  connectedAt: timestamp("connected_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("payment_accounts_entity_psp_unique").on(t.legalEntityId, t.pspProvider),
  check("psp_provider_check", sql`${t.pspProvider} IN ('stripe','payrexx','wallee','other')`),
  check("payment_account_status_check", sql`${t.status} IN ('pending','active','restricted','disabled')`),
]);

// ---------------------------------------------------------------------
// 2. Utilisateurs (professionnels et employés)
// ---------------------------------------------------------------------

export const staffMembers = pgTable("staff_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  establishmentId: uuid("establishment_id").notNull().references(() => establishments.id, { onDelete: "cascade" }),
  legalEntityId: uuid("legal_entity_id").references(() => legalEntities.id),
  name: text("name").notNull(),
  initials: text("initials"),
  role: text("role").notNull().default("employee"),
  accessCode: text("access_code").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("staff_role_check", sql`${t.role} IN ('owner','manager','employee')`),
]);

// ---------------------------------------------------------------------
// 3. Catalogue
// ---------------------------------------------------------------------

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  establishmentId: uuid("establishment_id").notNull().references(() => establishments.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  establishmentId: uuid("establishment_id").notNull().references(() => establishments.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").references(() => categories.id),
  name: text("name").notNull(),
  description: text("description"),
  priceAmount: numeric("price_amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("CHF"),
  photoUrl: text("photo_url"),
  availableBoutique: boolean("available_boutique").notNull().default(true),
  availableTraiteur: boolean("available_traiteur").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const allergens = pgTable("allergens", {
  id: uuid("id").primaryKey().defaultRandom(),
  establishmentId: uuid("establishment_id").notNull().references(() => establishments.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
});

export const productAllergens = pgTable("product_allergens", {
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  allergenId: uuid("allergen_id").notNull().references(() => allergens.id, { onDelete: "cascade" }),
}, (t) => [
  index("product_allergens_pk").on(t.productId, t.allergenId),
]);

export const productCapacityRules = pgTable("product_capacity_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(),
  maxQuantity: integer("max_quantity").notNull(),
  alertThresholdPct: integer("alert_threshold_pct").notNull().default(80),
}, (t) => [
  uniqueIndex("product_capacity_rules_unique").on(t.productId, t.scope),
  check("capacity_scope_check", sql`${t.scope} IN ('per_day','per_slot')`),
]);

// ---------------------------------------------------------------------
// 4. Créneaux et réservation atomique de capacité
// ---------------------------------------------------------------------

export const capacityReservations = pgTable("capacity_reservations", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => products.id),
  reservationDate: date("reservation_date").notNull(),
  timeSlot: time("time_slot"),
  quantity: integer("quantity").notNull(),
  status: text("status").notNull().default("held"),
  orderId: uuid("order_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_capacity_reservations_active").on(t.productId, t.reservationDate, t.timeSlot),
  check("capacity_reservation_status_check", sql`${t.status} IN ('held','confirmed','released')`),
]);

// ---------------------------------------------------------------------
// 5. Commandes
// ---------------------------------------------------------------------

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  establishmentId: uuid("establishment_id").notNull().references(() => establishments.id),
  orderType: text("order_type").notNull(),
  sellingEntityId: uuid("selling_entity_id").notNull().references(() => legalEntities.id),
  executingEntityId: uuid("executing_entity_id").references(() => legalEntities.id),
  clientName: text("client_name").notNull(),
  clientContact: text("client_contact"),
  pickupDate: date("pickup_date").notNull(),
  pickupTime: time("pickup_time").notNull(),
  status: text("status").notNull().default("confirmed"),
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  currency: text("currency").notNull().default("CHF"),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  depositAmount: numeric("deposit_amount", { precision: 10, scale: 2 }),
  paidAmount: numeric("paid_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  cancellationPolicySnapshot: jsonb("cancellation_policy_snapshot"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("order_type_check", sql`${t.orderType} IN ('boutique','traiteur')`),
  check("order_status_check", sql`${t.status} IN ('pending_payment','confirmed','in_progress','completed','cancelled')`),
  check("order_payment_status_check", sql`${t.paymentStatus} IN ('unpaid','deposit_paid','paid','refunded_partial','refunded_full')`),
]);

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id),
  productNameSnapshot: text("product_name_snapshot").notNull(),
  unitPriceSnapshot: numeric("unit_price_snapshot", { precision: 10, scale: 2 }).notNull(),
  quantity: integer("quantity").notNull(),
}, (t) => [
  check("order_item_quantity_check", sql`${t.quantity} > 0`),
]);

// ---------------------------------------------------------------------
// 6. Paiements (abstraction multi-PSP)
// ---------------------------------------------------------------------

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  paymentAccountId: uuid("payment_account_id").notNull().references(() => paymentAccounts.id),
  type: text("type").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  platformFeeAmount: numeric("platform_fee_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  refundKeepsFee: boolean("refund_keeps_fee").default(true),
  externalPaymentId: text("external_payment_id"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("payment_type_check", sql`${t.type} IN ('deposit','full','balance','refund')`),
  check("payment_status_check", sql`${t.status} IN ('pending','succeeded','failed')`),
]);

// ---------------------------------------------------------------------
// 7. Production et répartition des tâches
// ---------------------------------------------------------------------

export const productionLots = pgTable("production_lots", {
  id: uuid("id").primaryKey().defaultRandom(),
  establishmentId: uuid("establishment_id").notNull().references(() => establishments.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  productionDate: date("production_date").notNull(),
  quantity: integer("quantity").notNull(),
  readyByTime: time("ready_by_time").notNull(),
  assignedTo: uuid("assigned_to").references(() => staffMembers.id),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("production_lot_status_check", sql`${t.status} IN ('pending','in_progress','done')`),
]);

export const productionLotItems = pgTable("production_lot_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  lotId: uuid("lot_id").notNull().references(() => productionLots.id, { onDelete: "cascade" }),
  orderItemId: uuid("order_item_id").notNull().references(() => orderItems.id),
  quantityCovered: integer("quantity_covered").notNull(),
}, (t) => [
  check("lot_item_quantity_check", sql`${t.quantityCovered} > 0`),
]);

// ---------------------------------------------------------------------
// 8. Facturation inter-entités
// ---------------------------------------------------------------------

export const interEntityInvoices = pgTable("inter_entity_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  establishmentId: uuid("establishment_id").notNull().references(() => establishments.id),
  fromEntityId: uuid("from_entity_id").notNull().references(() => legalEntities.id),
  toEntityId: uuid("to_entity_id").notNull().references(() => legalEntities.id),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("draft"),
  pdfUrl: text("pdf_url"),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("inter_entity_invoice_status_check", sql`${t.status} IN ('draft','generated')`),
]);

export const interEntityInvoiceLines = pgTable("inter_entity_invoice_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => interEntityInvoices.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").references(() => orders.id),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  included: boolean("included").notNull().default(true),
});

// ---------------------------------------------------------------------
// 9. Politique d'annulation
// ---------------------------------------------------------------------

export const cancellationPolicies = pgTable("cancellation_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  establishmentId: uuid("establishment_id").notNull().references(() => establishments.id, { onDelete: "cascade" }),
  orderType: text("order_type").notNull(),
  refundableDaysBefore: integer("refundable_days_before"),
  nonRefundableAfterHours: integer("non_refundable_after_hours"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("cancellation_policies_unique").on(t.establishmentId, t.orderType),
  check("cancellation_order_type_check", sql`${t.orderType} IN ('boutique','traiteur')`),
]);

// ---------------------------------------------------------------------
// 10. Notifications
// ---------------------------------------------------------------------

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  establishmentId: uuid("establishment_id").notNull().references(() => establishments.id),
  orderId: uuid("order_id").references(() => orders.id),
  recipientType: text("recipient_type").notNull(),
  recipientId: text("recipient_id"),
  eventType: text("event_type").notNull(),
  channel: text("channel").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("notification_recipient_type_check", sql`${t.recipientType} IN ('client','staff_member')`),
  check("notification_channel_check", sql`${t.channel} IN ('email','sms','push')`),
]);
