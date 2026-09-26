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
  pgPolicy,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql, type SQL } from "drizzle-orm";

// =====================================================================
// SCHÉMA DRIZZLE — traduction directe de schema.sql
// Voir schema.sql pour les commentaires détaillés sur chaque décision.
// =====================================================================

// Isolation multi-tenant (section 11 de schema.sql) : un compte plateforme
// (app.is_platform_admin = 'true') voit tout, un établissement ne voit que
// ses propres lignes. Répétée à l'identique sur chaque table portant un
// establishment_id direct — voir lib/tenant.ts pour comment ces variables
// de session sont posées (SET LOCAL, jamais SET simple, jamais une variable
// globale côté application).
//
// Comparaison en TEXTE (colonne castée vers text), jamais l'inverse : caster
// current_setting(...) vers ::uuid peut lever une erreur même sous ce OR,
// car current_setting est STABLE et Postgres peut évaluer ce cast
// indépendamment du court-circuit ligne par ligne selon le plan choisi —
// reproduit et confirmé empiriquement sur la vraie table clients (2 lignes),
// pas sur un SELECT scalaire isolé. Une colonne uuid vers ::text ne peut
// jamais échouer, donc ce sens est sûr dans tous les cas.
function tenantIsolationPolicy(name: string, establishmentIdColumn: AnyPgColumn) {
  return pgPolicy(name, {
    using: sql`current_setting('app.is_platform_admin', true) = 'true' OR ${establishmentIdColumn}::text = current_setting('app.current_establishment_id', true)`,
  });
}

// Pour les tables sans establishment_id direct (order_items, payments,
// production_lot_items, product_allergens, inter_entity_invoice_lines,
// product_capacity_rules, capacity_reservations) : RLS ne traverse pas les
// jointures tout seul, donc chacune a besoin de sa propre policy vérifiant
// l'appartenance via sa table parente.
function tenantIsolationPolicyViaExists(name: string, existsClause: SQL) {
  return pgPolicy(name, {
    using: sql`current_setting('app.is_platform_admin', true) = 'true' OR EXISTS (${existsClause})`,
  });
}

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
  // Fermeture hebdomadaire récurrente : jours de semaine fermés, 0=dimanche
  // .. 6=samedi (convention JS Date#getDay()). Séparée par univers de vente
  // (traiteur / boutique) — un établissement multi-entité (ex. LabTraiteur :
  // Michele/Traiteur, Richard/Boutique) peut fermer l'un sans fermer
  // l'autre. Un établissement mono-entité renseigne simplement les deux de
  // façon identique depuis /pro/fermetures (voir cette page pour l'UI
  // conditionnelle selon que le owner connecté est rattaché à un univers ou
  // aux deux). Volontairement sur cette table sans RLS : information
  // publique par nature (le client doit savoir quels jours sont fermés
  // avant même qu'un tenant courant soit connu), au même titre que
  // name/tagline/accentColor ci-dessus.
  closedWeekdaysTraiteur: integer("closed_weekdays_traiteur").array().notNull().default([]),
  closedWeekdaysBoutique: integer("closed_weekdays_boutique").array().notNull().default([]),
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
  // Modèle de facturation de l'entité (écran 12.1) : rempli une fois par le
  // professionnel, réutilisé pour chaque facture inter-entités émise par
  // cette entité — jamais ressaisi à la volée. Tout nullable : une entité
  // fraîchement créée n'a pas encore de modèle, voir isBillingProfileComplete.
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  addressPostalCode: text("address_postal_code"),
  addressCity: text("address_city"),
  addressCountry: text("address_country").default("CH"),
  ibanNumber: text("iban_number"),
  bankName: text("bank_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("legal_entity_default_order_type_check", sql`${t.defaultOrderType} IN ('boutique','traiteur')`),
  tenantIsolationPolicy("legal_entities_tenant_isolation", t.establishmentId),
]).enableRLS();

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
  // Unique PAR ÉTABLISSEMENT (voir l'index composite ci-dessous), pas sur
  // toute la plateforme comme avant ce chantier : la vérification
  // d'unicité dans generateAccessCode (equipe/actions.ts, admin/actions.ts)
  // tourne sous runAsTenant, donc déjà filtrée par RLS à l'établissement
  // courant — une contrainte globale laissait passer un code déjà pris
  // ailleurs, avec un INSERT qui échouait ensuite sur la contrainte sans
  // que le code applicatif s'y attende.
  accessCode: text("access_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("staff_role_check", sql`${t.role} IN ('owner','manager','employee')`),
  uniqueIndex("staff_members_establishment_access_code_unique").on(t.establishmentId, t.accessCode),
  tenantIsolationPolicy("staff_members_tenant_isolation", t.establishmentId),
]).enableRLS();

// Historique des tentatives de connexion à /pro/login — sert à la fois au
// verrouillage progressif (voir lib/loginSecurity.ts : compte les échecs
// consécutifs par couple établissement + IP) et à la journalisation affichée
// sur l'écran Équipe. staffMemberId n'est renseigné que sur une tentative
// réussie (NULL sur un échec, puisqu'on ne sait pas qui essayait).
export const loginAttempts = pgTable("login_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  // NULL = tentative de connexion à /admin (console plateforme), qui n'est
  // rattachée à aucun établissement — voir requirePlatformAdminContext et
  // getRecentFailureStreak(tx, null, ip) dans app/admin/login/actions.ts.
  // Une ligne à establishment_id NULL n'est lisible/écrivable que sous un tx
  // isPlatformAdmin=true (voir tenantIsolationPolicy plus bas : NULL::text
  // n'égale jamais current_establishment_id, seule la branche
  // is_platform_admin de la policy peut la laisser passer).
  establishmentId: uuid("establishment_id").references(() => establishments.id, { onDelete: "cascade" }),
  ipAddress: text("ip_address").notNull(),
  succeeded: boolean("succeeded").notNull(),
  staffMemberId: uuid("staff_member_id").references(() => staffMembers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("login_attempts_establishment_ip_idx").on(t.establishmentId, t.ipAddress, t.createdAt),
  tenantIsolationPolicy("login_attempts_tenant_isolation", t.establishmentId),
]).enableRLS();

// Comptes propriétaires de la plateforme (toi) — voient tous les
// établissements, contrairement à staff_members qui est toujours rattaché
// à un seul establishment. Pas de RLS ici : c'est justement la table qui
// détermine qui a le droit de tout voir.
export const platformAdmins = pgTable("platform_admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  // scrypt, même mécanisme que clients.password_hash (lib/auth.ts) — posé
  // une seule fois via /admin/setup, jamais par un formulaire d'inscription
  // ouvert (voir cette page pour la garde "une seule création possible").
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Comptes clients — cloisonnés PAR établissement (option retenue) : la même
// personne qui commande chez deux traiteurs différents de la plateforme a
// deux lignes distinctes ici, sans lien entre elles.
export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  establishmentId: uuid("establishment_id").notNull().references(() => establishments.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("clients_establishment_email_unique").on(t.establishmentId, t.email),
  tenantIsolationPolicy("clients_tenant_isolation", t.establishmentId),
]).enableRLS();

// ---------------------------------------------------------------------
// 3. Catalogue
// ---------------------------------------------------------------------

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  establishmentId: uuid("establishment_id").notNull().references(() => establishments.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [
  tenantIsolationPolicy("categories_tenant_isolation", t.establishmentId),
]).enableRLS();

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  establishmentId: uuid("establishment_id").notNull().references(() => establishments.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").references(() => categories.id),
  name: text("name").notNull(),
  description: text("description"),
  // Sous-titre de section libre, saisi par le professionnel (écran
  // catalogue) — regroupe les produits d'une même catégorie sous un même
  // intitulé côté catalogue client (ex. "Pâtes fraîches" au sein de
  // "Plats"). Pas de table dédiée : un simple texte comparé à l'identique
  // suffit, voir MenuRow/CatalogueClient pour le regroupement à l'affichage.
  sectionTitle: text("section_title"),
  priceAmount: numeric("price_amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("CHF"),
  photoUrl: text("photo_url"),
  availableBoutique: boolean("available_boutique").notNull().default(true),
  availableTraiteur: boolean("available_traiteur").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  tenantIsolationPolicy("products_tenant_isolation", t.establishmentId),
]).enableRLS();

export const allergens = pgTable("allergens", {
  id: uuid("id").primaryKey().defaultRandom(),
  establishmentId: uuid("establishment_id").notNull().references(() => establishments.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
}, (t) => [
  tenantIsolationPolicy("allergens_tenant_isolation", t.establishmentId),
]).enableRLS();

export const productAllergens = pgTable("product_allergens", {
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  allergenId: uuid("allergen_id").notNull().references(() => allergens.id, { onDelete: "cascade" }),
}, (t) => [
  index("product_allergens_pk").on(t.productId, t.allergenId),
  tenantIsolationPolicyViaExists(
    "product_allergens_tenant_isolation",
    sql`SELECT 1 FROM ${products} WHERE ${products.id} = ${t.productId} AND ${products.establishmentId}::text = current_setting('app.current_establishment_id', true)`
  ),
]).enableRLS();

export const productCapacityRules = pgTable("product_capacity_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(),
  maxQuantity: integer("max_quantity").notNull(),
  alertThresholdPct: integer("alert_threshold_pct").notNull().default(80),
}, (t) => [
  uniqueIndex("product_capacity_rules_unique").on(t.productId, t.scope),
  check("capacity_scope_check", sql`${t.scope} IN ('per_day','per_slot')`),
  tenantIsolationPolicyViaExists(
    "product_capacity_rules_tenant_isolation",
    sql`SELECT 1 FROM ${products} WHERE ${products.id} = ${t.productId} AND ${products.establishmentId}::text = current_setting('app.current_establishment_id', true)`
  ),
]).enableRLS();

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
  tenantIsolationPolicyViaExists(
    "capacity_reservations_tenant_isolation",
    sql`SELECT 1 FROM ${products} WHERE ${products.id} = ${t.productId} AND ${products.establishmentId}::text = current_setting('app.current_establishment_id', true)`
  ),
]).enableRLS();

// ---------------------------------------------------------------------
// 5. Commandes
// ---------------------------------------------------------------------

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  establishmentId: uuid("establishment_id").notNull().references(() => establishments.id),
  orderType: text("order_type").notNull(),
  sellingEntityId: uuid("selling_entity_id").notNull().references(() => legalEntities.id),
  executingEntityId: uuid("executing_entity_id").references(() => legalEntities.id),
  // Mode d'assignation "commande entière" (écran 8 bis) : coexiste avec les
  // lots de production (production_lots) sans les remplacer — un pro choisit
  // l'un ou l'autre, commande par commande. Voir recomputeExecutingEntities
  // (lib/production.ts) pour l'interaction avec la facturation inter-entités,
  // et aggregateByProduct pour l'exclusion du panneau "à produire" agrégé.
  assignedTo: uuid("assigned_to").references(() => staffMembers.id),
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
  tenantIsolationPolicy("orders_tenant_isolation", t.establishmentId),
]).enableRLS();

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id),
  productNameSnapshot: text("product_name_snapshot").notNull(),
  unitPriceSnapshot: numeric("unit_price_snapshot", { precision: 10, scale: 2 }).notNull(),
  quantity: integer("quantity").notNull(),
}, (t) => [
  check("order_item_quantity_check", sql`${t.quantity} > 0`),
  tenantIsolationPolicyViaExists(
    "order_items_tenant_isolation",
    sql`SELECT 1 FROM ${orders} WHERE ${orders.id} = ${t.orderId} AND ${orders.establishmentId}::text = current_setting('app.current_establishment_id', true)`
  ),
]).enableRLS();

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
  tenantIsolationPolicyViaExists(
    "payments_tenant_isolation",
    sql`SELECT 1 FROM ${orders} WHERE ${orders.id} = ${t.orderId} AND ${orders.establishmentId}::text = current_setting('app.current_establishment_id', true)`
  ),
]).enableRLS();

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
  tenantIsolationPolicy("production_lots_tenant_isolation", t.establishmentId),
]).enableRLS();

export const productionLotItems = pgTable("production_lot_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  lotId: uuid("lot_id").notNull().references(() => productionLots.id, { onDelete: "cascade" }),
  orderItemId: uuid("order_item_id").notNull().references(() => orderItems.id),
  quantityCovered: integer("quantity_covered").notNull(),
}, (t) => [
  check("lot_item_quantity_check", sql`${t.quantityCovered} > 0`),
  tenantIsolationPolicyViaExists(
    "production_lot_items_tenant_isolation",
    sql`SELECT 1 FROM ${productionLots} WHERE ${productionLots.id} = ${t.lotId} AND ${productionLots.establishmentId}::text = current_setting('app.current_establishment_id', true)`
  ),
]).enableRLS();

// ---------------------------------------------------------------------
// 8. Facturation inter-entités
// ---------------------------------------------------------------------

export const interEntityInvoices = pgTable("inter_entity_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  establishmentId: uuid("establishment_id").notNull().references(() => establishments.id),
  fromEntityId: uuid("from_entity_id").notNull().references(() => legalEntities.id),
  toEntityId: uuid("to_entity_id").notNull().references(() => legalEntities.id),
  // Séquentiel par établissement (F-{année}-{0001}), attribué à la création
  // et jamais modifié — voir nextInvoiceNumber dans facturation/actions.ts.
  invoiceNumber: text("invoice_number").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("draft"),
  pdfUrl: text("pdf_url"),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("inter_entity_invoice_status_check", sql`${t.status} IN ('draft','generated')`),
  uniqueIndex("inter_entity_invoices_number_unique").on(t.establishmentId, t.invoiceNumber),
  tenantIsolationPolicy("inter_entity_invoices_tenant_isolation", t.establishmentId),
]).enableRLS();

export const interEntityInvoiceLines = pgTable("inter_entity_invoice_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => interEntityInvoices.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").references(() => orders.id),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  included: boolean("included").notNull().default(true),
}, (t) => [
  tenantIsolationPolicyViaExists(
    "inter_entity_invoice_lines_tenant_isolation",
    sql`SELECT 1 FROM ${interEntityInvoices} WHERE ${interEntityInvoices.id} = ${t.invoiceId} AND ${interEntityInvoices.establishmentId}::text = current_setting('app.current_establishment_id', true)`
  ),
]).enableRLS();

// ---------------------------------------------------------------------
// 8bis. Facturation client — distincte de la facturation inter-entités
// ci-dessus (entre les sociétés d'un même établissement) : ici, le document
// qu'un client reçoit pour SA commande. Générée à la volée au premier accès
// (voir getOrCreateClientInvoice dans lib/invoicing.ts), jamais avant —
// même patron de numérotation séquentielle que inter_entity_invoices, préfixe
// "C" plutôt que "F" pour ne jamais collisionner visuellement.
// ---------------------------------------------------------------------

export const clientInvoices = pgTable("client_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  establishmentId: uuid("establishment_id").notNull().references(() => establishments.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  // Copié depuis orders.sellingEntityId au moment de la génération — c'est
  // cette valeur (pas une jointure vers orders à chaque lecture) qui sert au
  // cloisonnement Richard/boutique, Michele/traiteur (voir requireEntityScope
  // dans app/[slug]/pro/dossier/actions.ts).
  sellingEntityId: uuid("selling_entity_id").notNull().references(() => legalEntities.id),
  invoiceNumber: text("invoice_number").notNull(),
  emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("client_invoices_order_unique").on(t.orderId),
  uniqueIndex("client_invoices_number_unique").on(t.establishmentId, t.invoiceNumber),
  tenantIsolationPolicy("client_invoices_tenant_isolation", t.establishmentId),
]).enableRLS();

// ---------------------------------------------------------------------
// 8ter. Factures d'achat (dépenses fournisseurs)
// ---------------------------------------------------------------------
// N'existait sous aucune forme avant ce chantier — rattachées à une entité
// juridique (pas seulement à l'établissement) pour le même cloisonnement
// Richard/boutique, Michele/traiteur que les factures clients, et pour
// entrer dans le calcul du résultat (CA - dépenses) par entité du rapport
// comptable.

export const purchaseInvoices = pgTable("purchase_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  establishmentId: uuid("establishment_id").notNull().references(() => establishments.id, { onDelete: "cascade" }),
  legalEntityId: uuid("legal_entity_id").notNull().references(() => legalEntities.id),
  supplierName: text("supplier_name").notNull(),
  invoiceDate: date("invoice_date").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  // Même mécanisme Netlify Blobs que products.photo_url — voir lib/blobs.ts
  // (getPurchaseInvoiceScanStore) — jamais un nouveau système de stockage.
  scanUrl: text("scan_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  tenantIsolationPolicy("purchase_invoices_tenant_isolation", t.establishmentId),
]).enableRLS();

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
  tenantIsolationPolicy("cancellation_policies_tenant_isolation", t.establishmentId),
]).enableRLS();

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
  tenantIsolationPolicy("notifications_tenant_isolation", t.establishmentId),
]).enableRLS();

// ---------------------------------------------------------------------
// 11. Fermetures ponctuelles (congés, jours fériés)
// ---------------------------------------------------------------------
// Distinctes de establishments.closed_weekdays (récurrence hebdomadaire) :
// ici, des dates précises, une par ligne. Contrairement à establishments,
// cette table porte des lignes établissement-scopées à protéger par RLS
// normalement, patron identique à cancellation_policies.

export const establishmentClosures = pgTable("establishment_closures", {
  id: uuid("id").primaryKey().defaultRandom(),
  establishmentId: uuid("establishment_id").notNull().references(() => establishments.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  // NULL = ferme les deux univers ce jour-là (cas mono-entité, comportement
  // historique) ; 'traiteur' ou 'boutique' = ferme seulement cet univers.
  // NULL n'étant jamais égal à NULL pour une contrainte unique Postgres,
  // l'unicité d'une fermeture "les deux univers" pour une même date est
  // vérifiée applicativement (voir addClosure dans
  // app/[slug]/pro/fermetures/actions.ts), pas seulement par l'index.
  orderType: text("order_type"),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("establishment_closures_unique").on(t.establishmentId, t.date, t.orderType),
  check("establishment_closures_order_type_check", sql`${t.orderType} IN ('traiteur','boutique')`),
  tenantIsolationPolicy("establishment_closures_tenant_isolation", t.establishmentId),
]).enableRLS();
