-- =====================================================================
-- MODÈLE DE DONNÉES — Plateforme de gestion de commandes pour traiteurs
-- PostgreSQL — schéma de départ, à affiner en développement
-- =====================================================================
-- Principes structurants repris de la conception :
--   1. Multi-tenant : tout est rattaché à un "establishment" (le traiteur)
--   2. Un establishment peut opérer via plusieurs legal_entities distinctes
--      (ex. Boutique Sàrl + Traiteur SA) — chacune a son propre compte
--      de paiement, jamais la plateforme.
--   3. Deux univers de vente (boutique / traiteur) cohabitent par produit.
--   4. La capacité de production se réserve de façon atomique (voir
--      capacity_reservations) pour éviter les doubles réservations.
--   5. Le paiement est abstrait derrière payment_accounts / payments :
--      Stripe et un PSP suisse (Payrexx, Wallee...) sont deux
--      implémentations possibles de la même interface applicative.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. ÉTABLISSEMENTS ET ENTITÉS JURIDIQUES
-- ---------------------------------------------------------------------

CREATE TABLE establishments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,                  -- "LabTraiteur Da Michele"
    slug                TEXT NOT NULL UNIQUE,            -- utilisé pour l'URL/sous-domaine
    tagline             TEXT,                            -- "Traiteur italien, Peseux"
    -- Branding (marque blanche) — voir section 2.1 de la synthèse
    logo_url            TEXT,
    banner_url          TEXT,
    accent_color        TEXT,                            -- hex, ex. "#4A1B0C"
    custom_domain       TEXT,                             -- optionnel, si le traiteur a son propre domaine
    -- Statut du parcours d'inscription (écran 17)
    onboarding_status   TEXT NOT NULL DEFAULT 'draft'
                        CHECK (onboarding_status IN ('draft', 'payment_pending', 'active', 'suspended')),
    -- Fermeture hebdomadaire récurrente : jours de semaine fermés, 0=dimanche
    -- .. 6=samedi (convention JS Date#getDay()). Séparée par univers de
    -- vente (traiteur/boutique) : un établissement multi-entité (ex.
    -- LabTraiteur) peut fermer l'un sans fermer l'autre. Volontairement sur
    -- cette table sans RLS : information publique par nature (le client
    -- doit savoir quels jours sont fermés avant même qu'un tenant courant
    -- soit connu), au même titre que name/tagline/accent_color ci-dessus.
    closed_weekdays_traiteur INTEGER[] NOT NULL DEFAULT '{}',
    closed_weekdays_boutique INTEGER[] NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un establishment peut opérer via 1 ou plusieurs sociétés distinctes.
-- Cas simple : une seule ligne ici (le traiteur = son unique société).
-- Cas multi-entité (ex. Boutique Sàrl + Traiteur SA) : deux lignes.
CREATE TABLE legal_entities (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id    UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,                   -- "LabTraiteur Da Michele SA"
    role_label          TEXT,                             -- libellé libre, ex. "Traiteur" / "Boutique"
    uid_number          TEXT,                             -- numéro IDE suisse (ex. CHE-123.456.789)
    vat_number          TEXT,
    is_default          BOOLEAN NOT NULL DEFAULT true,     -- entité utilisée par défaut pour les ventes
    -- Quelle entité encaisse par défaut pour quel univers de vente (cas
    -- multi-entité) ; NULL si cette entité gère les deux (cas simple).
    default_order_type TEXT CHECK (default_order_type IN ('boutique', 'traiteur')),
    -- Modèle de facturation (écran 12.1, ajouté avec la facturation PDF) :
    -- rempli une fois par le professionnel, réutilisé pour chaque facture
    -- inter-entités émise par cette entité. Tout nullable — une entité
    -- fraîchement créée n'a pas encore de modèle ; voir
    -- isBillingProfileComplete dans facturation/actions.ts pour le contrôle
    -- fait avant de générer un PDF.
    address_line1       TEXT,
    address_line2       TEXT,
    address_postal_code TEXT,
    address_city        TEXT,
    address_country     TEXT DEFAULT 'CH',
    iban_number         TEXT,
    bank_name           TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Compte de paiement connecté — abstraction du PSP (Stripe, Payrexx, Wallee...)
-- Une legal_entity a généralement un seul compte de paiement actif à la fois.
CREATE TABLE payment_accounts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_entity_id     UUID NOT NULL REFERENCES legal_entities(id) ON DELETE CASCADE,
    psp_provider        TEXT NOT NULL CHECK (psp_provider IN ('stripe', 'payrexx', 'wallee', 'other')),
    external_account_id TEXT NOT NULL,                    -- ID du compte connecté chez le PSP
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'active', 'restricted', 'disabled')),
    connected_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (legal_entity_id, psp_provider)
);


-- ---------------------------------------------------------------------
-- 2. UTILISATEURS (PROFESSIONNELS ET EMPLOYÉS)
-- ---------------------------------------------------------------------

CREATE TABLE staff_members (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id    UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
    legal_entity_id     UUID REFERENCES legal_entities(id),  -- à quelle société la personne est rattachée
    name                TEXT NOT NULL,
    initials            TEXT,                             -- pour l'avatar ("MC", "SA")
    role                TEXT NOT NULL DEFAULT 'employee'
                        CHECK (role IN ('owner', 'manager', 'employee')),
    -- Accès allégé employé (écran 10) : pas de mot de passe complet nécessaire
    access_code         TEXT UNIQUE,                      -- lien ou code d'accès simplifié
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comptes propriétaires de la plateforme (toi) — voient tous les
-- établissements, contrairement à staff_members qui est toujours
-- rattaché à un seul establishment.
CREATE TABLE platform_admins (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    email               TEXT NOT NULL UNIQUE,
    -- scrypt, même mécanisme que clients.password_hash. Posé une seule fois
    -- via /admin/setup (bloqué dès qu'une ligne existe), jamais par une
    -- inscription ouverte.
    password_hash       TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comptes clients — cloisonnés PAR établissement (option A retenue) :
-- la même personne qui commande chez deux traiteurs différents de la
-- plateforme a deux lignes distinctes ici, sans lien entre elles.
CREATE TABLE clients (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id    UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    email               TEXT,
    phone               TEXT,
    password_hash       TEXT,                              -- NULL si connexion par lien/OTP uniquement
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (establishment_id, email)
);


-- ---------------------------------------------------------------------
-- 3. CATALOGUE
-- ---------------------------------------------------------------------

CREATE TABLE categories (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id    UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,                    -- "Antipasti", "Plats", "Dolci"
    sort_order          INT NOT NULL DEFAULT 0
);

CREATE TABLE products (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id    UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
    category_id         UUID REFERENCES categories(id),
    name                TEXT NOT NULL,
    description         TEXT,
    -- Sous-titre de section libre, saisi par le pro (écran catalogue) —
    -- regroupe les produits d'une même catégorie sous un même intitulé côté
    -- catalogue client (ex. "Pâtes fraîches" au sein de "Plats"). Pas de
    -- table dédiée : comparaison texte à l'identique pour le regroupement.
    section_title       TEXT,
    price_amount        NUMERIC(10,2) NOT NULL,
    currency            TEXT NOT NULL DEFAULT 'CHF',
    photo_url           TEXT,
    -- Un produit peut se vendre côté boutique, côté traiteur, ou les deux (écran 7)
    available_boutique  BOOLEAN NOT NULL DEFAULT true,
    available_traiteur  BOOLEAN NOT NULL DEFAULT true,
    is_active           BOOLEAN NOT NULL DEFAULT true,     -- toggle "disponible à la vente" (écran 13)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE allergens (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id    UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
    label               TEXT NOT NULL                      -- "Gluten", "Lactose", "Fruits à coque"
);

CREATE TABLE product_allergens (
    product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    allergen_id          UUID NOT NULL REFERENCES allergens(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, allergen_id)
);

-- Capacité de production (écran 5) : quantité max par produit,
-- déclinée par jour ET/OU par créneau. La réservation effective
-- se fait via capacity_reservations plus bas (atomicité).
CREATE TABLE product_capacity_rules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    scope               TEXT NOT NULL CHECK (scope IN ('per_day', 'per_slot')),
    max_quantity        INT NOT NULL,
    alert_threshold_pct INT NOT NULL DEFAULT 80,            -- déclenche l'alerte dashboard
    UNIQUE (product_id, scope)
);


-- ---------------------------------------------------------------------
-- 4. CRÉNEAUX ET RÉSERVATION ATOMIQUE DE CAPACITÉ
-- ---------------------------------------------------------------------

-- Une réservation est créée dès l'ajout au panier (avant paiement),
-- avec une expiration courte. Elle est confirmée si la commande est payée,
-- sinon elle expire et libère la capacité automatiquement.
-- C'est cette table qui rend la vérification de capacité atomique :
-- SELECT ... FOR UPDATE sur la ligne product_capacity_rules correspondante
-- avant d'insérer une ligne ici, dans une seule transaction.
CREATE TABLE capacity_reservations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id          UUID NOT NULL REFERENCES products(id),
    reservation_date    DATE NOT NULL,
    time_slot           TIME,                              -- NULL si capacité "par jour" uniquement
    quantity            INT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'held'
                        CHECK (status IN ('held', 'confirmed', 'released')),
    order_id            UUID,                               -- rempli une fois la commande créée
    expires_at          TIMESTAMPTZ NOT NULL,                -- ex. now() + interval '10 minutes'
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_capacity_reservations_active
    ON capacity_reservations (product_id, reservation_date, time_slot)
    WHERE status IN ('held', 'confirmed');


-- ---------------------------------------------------------------------
-- 5. COMMANDES
-- ---------------------------------------------------------------------

CREATE TABLE orders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id    UUID NOT NULL REFERENCES establishments(id),
    order_type          TEXT NOT NULL CHECK (order_type IN ('boutique', 'traiteur')),  -- écran 7

    -- Entité vendeuse : détermine où va le paiement (jamais la plateforme)
    selling_entity_id   UUID NOT NULL REFERENCES legal_entities(id),
    -- Entité exécutante : déduite automatiquement via l'assignation des tâches
    -- (section 6 de la synthèse). NULL ou = selling_entity_id dans le cas normal.
    executing_entity_id UUID REFERENCES legal_entities(id),

    -- Mode d'assignation "commande entière" (écran 8 bis) : coexiste avec les
    -- lots de production (production_lots) sans les remplacer — le pro choisit
    -- l'un ou l'autre, commande par commande. Une commande assignée ainsi
    -- détermine aussi executing_entity_id directement (voir
    -- recomputeExecutingEntities dans lib/production.ts), et ses articles
    -- disparaissent du panneau "à produire" agrégé (voir aggregateByProduct).
    assigned_to          UUID REFERENCES staff_members(id),

    client_name         TEXT NOT NULL,
    client_contact      TEXT,                               -- email ou téléphone

    pickup_date         DATE NOT NULL,
    pickup_time         TIME NOT NULL,

    status              TEXT NOT NULL DEFAULT 'confirmed'
                        CHECK (status IN ('pending_payment', 'confirmed', 'in_progress', 'completed', 'cancelled')),
    payment_status      TEXT NOT NULL DEFAULT 'unpaid'
                        CHECK (payment_status IN ('unpaid', 'deposit_paid', 'paid', 'refunded_partial', 'refunded_full')),

    currency            TEXT NOT NULL DEFAULT 'CHF',
    total_amount        NUMERIC(10,2) NOT NULL,             -- recalculé à chaque édition (écran 14)
    deposit_amount       NUMERIC(10,2),                      -- NULL si paiement intégral choisi
    paid_amount          NUMERIC(10,2) NOT NULL DEFAULT 0,   -- somme réellement encaissée à date

    -- Politique d'annulation applicable, figée au moment de la commande
    -- (pour ne pas changer les règles rétroactivement si le traiteur modifie sa politique)
    cancellation_policy_snapshot JSONB,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id          UUID NOT NULL REFERENCES products(id),
    -- Snapshot au moment de la commande : le produit peut changer de nom/prix après coup
    product_name_snapshot  TEXT NOT NULL,
    unit_price_snapshot     NUMERIC(10,2) NOT NULL,
    quantity             INT NOT NULL CHECK (quantity > 0)
);


-- ---------------------------------------------------------------------
-- 6. PAIEMENTS (abstraction multi-PSP)
-- ---------------------------------------------------------------------

CREATE TABLE payments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    payment_account_id  UUID NOT NULL REFERENCES payment_accounts(id),
    type                TEXT NOT NULL CHECK (type IN ('deposit', 'full', 'balance', 'refund')),
    amount               NUMERIC(10,2) NOT NULL,
    -- Commission plateforme prélevée sur ce paiement (application_fee côté Stripe,
    -- équivalent "commission" côté split payment)
    platform_fee_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
    refund_keeps_fee     BOOLEAN DEFAULT true,               -- décision prise : commission jamais remboursée
    external_payment_id  TEXT,                                -- ID côté PSP
    status               TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'succeeded', 'failed')),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------
-- 7. PRODUCTION ET RÉPARTITION DES TÂCHES (écrans 8, 9, 12)
-- ---------------------------------------------------------------------

-- Un lot représente une quantité à produire, librement découpée par le
-- professionnel (un seul lot agrégé par défaut, ou plusieurs lots
-- personnalisés — voir écran 9).
CREATE TABLE production_lots (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id    UUID NOT NULL REFERENCES establishments(id),
    product_id          UUID NOT NULL REFERENCES products(id),
    production_date     DATE NOT NULL,
    quantity             INT NOT NULL,
    ready_by_time        TIME NOT NULL,                      -- "prêt pour 10h00"
    assigned_to          UUID REFERENCES staff_members(id),   -- NULL = non assigné
    status               TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'in_progress', 'done')),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table de liaison : quelle part de quel article de commande est couverte
-- par quel lot. Permet à un lot de couvrir plusieurs commandes/créneaux
-- (écran 8 : détail par créneau consultable) sans forcer un découpage strict.
CREATE TABLE production_lot_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lot_id               UUID NOT NULL REFERENCES production_lots(id) ON DELETE CASCADE,
    order_item_id         UUID NOT NULL REFERENCES order_items(id),
    quantity_covered      INT NOT NULL CHECK (quantity_covered > 0)
);


-- ---------------------------------------------------------------------
-- 8. FACTURATION INTER-ENTITÉS (écrans 11, 15)
-- ---------------------------------------------------------------------

CREATE TABLE inter_entity_invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id    UUID NOT NULL REFERENCES establishments(id),
    from_entity_id       UUID NOT NULL REFERENCES legal_entities(id),  -- ex. Boutique
    to_entity_id          UUID NOT NULL REFERENCES legal_entities(id), -- ex. Traiteur
    -- Séquentiel par établissement et par année ("F-2026-0001"), attribué à
    -- la création — voir nextInvoiceNumber() dans facturation/actions.ts.
    -- Unique par (establishment_id, invoice_number), jamais modifié ensuite.
    invoice_number        TEXT NOT NULL,
    period_start          DATE NOT NULL,
    period_end            DATE NOT NULL,
    total_amount           NUMERIC(10,2) NOT NULL DEFAULT 0,
    status                 TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'generated')),
    pdf_url                TEXT,
    generated_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (establishment_id, invoice_number)
);

-- Chaque ligne = une commande candidate à la facturation, avec la
-- possibilité de l'exclure ou d'ajuster son montant avant génération
-- (écran 15).
CREATE TABLE inter_entity_invoice_lines (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id            UUID NOT NULL REFERENCES inter_entity_invoices(id) ON DELETE CASCADE,
    order_id              UUID REFERENCES orders(id),          -- NULL si ligne manuelle
    description            TEXT NOT NULL,
    amount                  NUMERIC(10,2) NOT NULL,
    included                BOOLEAN NOT NULL DEFAULT true       -- décoché = exclu de la facture
);


-- ---------------------------------------------------------------------
-- 8bis. FACTURATION CLIENT
-- ---------------------------------------------------------------------
-- Distincte de la facturation inter-entités ci-dessus (entre les sociétés
-- d'un même établissement) : ici, le document qu'un CLIENT reçoit pour sa
-- commande. Générée à la volée au premier accès (voir getOrCreateClientInvoice
-- dans lib/invoicing.ts), jamais avant — même patron de numérotation
-- séquentielle que inter_entity_invoices ("C-{année}-{0001}" plutôt que "F-").

CREATE TABLE client_invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id    UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
    order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    -- Copié depuis orders.selling_entity_id au moment de la génération : sert
    -- directement au cloisonnement Richard/boutique, Michele/traiteur, sans
    -- avoir à rejoindre orders à chaque lecture.
    selling_entity_id   UUID NOT NULL REFERENCES legal_entities(id),
    invoice_number      TEXT NOT NULL,
    email_sent_at       TIMESTAMPTZ,                          -- NULL si l'envoi a échoué ou n'a pas eu lieu
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (order_id),
    UNIQUE (establishment_id, invoice_number)
);

-- ---------------------------------------------------------------------
-- 8ter. FACTURES D'ACHAT (dépenses fournisseurs)
-- ---------------------------------------------------------------------
-- N'existait sous aucune forme avant ce chantier. Rattachées à une entité
-- juridique (pas seulement à l'établissement) pour le même cloisonnement que
-- les factures clients, et pour entrer dans le calcul du résultat
-- (CA - dépenses) par entité du rapport comptable.

CREATE TABLE purchase_invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id    UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
    legal_entity_id     UUID NOT NULL REFERENCES legal_entities(id),
    supplier_name       TEXT NOT NULL,
    invoice_date        DATE NOT NULL,
    amount              NUMERIC(10,2) NOT NULL,
    description         TEXT,
    -- Même mécanisme Netlify Blobs que products.photo_url (lib/blobs.ts,
    -- getPurchaseInvoiceScanStore) — jamais un nouveau système de stockage.
    scan_url            TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------
-- 9. POLITIQUE D'ANNULATION (écran 16)
-- ---------------------------------------------------------------------

CREATE TABLE cancellation_policies (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id    UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
    order_type            TEXT NOT NULL CHECK (order_type IN ('boutique', 'traiteur')),
    refundable_days_before INT,                                -- ex. 7
    non_refundable_after_hours INT,                             -- ex. 48
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (establishment_id, order_type)
);


-- ---------------------------------------------------------------------
-- 10. NOTIFICATIONS (section 11 de la synthèse)
-- ---------------------------------------------------------------------

CREATE TABLE notifications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id    UUID NOT NULL REFERENCES establishments(id),
    order_id              UUID REFERENCES orders(id),
    recipient_type         TEXT NOT NULL CHECK (recipient_type IN ('client', 'staff_member')),
    recipient_id            TEXT,                                -- email/téléphone ou staff_members.id
    event_type              TEXT NOT NULL,                        -- 'order_confirmed', 'pickup_reminder', ...
    channel                  TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'push')),
    sent_at                   TIMESTAMPTZ,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 11. FERMETURES PONCTUELLES (congés, jours fériés)
-- ---------------------------------------------------------------------
-- Distinctes de establishments.closed_weekdays_* (récurrence hebdomadaire) :
-- des dates précises, une par ligne. Contrairement à establishments, cette
-- table porte des lignes établissement-scopées à protéger par RLS
-- normalement, patron identique à cancellation_policies.

CREATE TABLE establishment_closures (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id    UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
    date                DATE NOT NULL,
    -- NULL = ferme les deux univers ce jour-là ; 'traiteur'/'boutique' = un
    -- seul. NULL n'étant jamais égal à NULL pour une contrainte UNIQUE
    -- Postgres, l'unicité d'une fermeture "les deux univers" par date est
    -- revérifiée applicativement (voir addClosure, app/[slug]/pro/fermetures/actions.ts).
    order_type          TEXT CHECK (order_type IN ('traiteur', 'boutique')),
    reason              TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (establishment_id, date, order_type)
);


-- =====================================================================
-- 12. ISOLATION MULTI-TENANT — ROW-LEVEL SECURITY (RLS)
-- =====================================================================
-- Deuxième barrière, au niveau de PostgreSQL lui-même : même si une
-- requête applicative oublie un filtre establishment_id, la base
-- refuse de toute façon de renvoyer les lignes d'un autre établissement.
--
-- Fonctionnement : l'application définit deux variables de session au
-- début de chaque requête, POSÉES DANS LA MÊME TRANSACTION que la requête
-- métier qui suit (SET LOCAL, jamais SET simple — sinon la variable reste
-- collée à la connexion et fuit vers la prochaine requête réutilisant la
-- même connexion dans le pool) :
--   SET LOCAL app.current_establishment_id = '<uuid>';   -- le tenant courant
--   SET LOCAL app.is_platform_admin = 'true' | 'false';   -- toi = 'true'
--
-- Un compte plateforme (toi) voit tout. Un traiteur ne voit que ses
-- propres lignes.
--
-- Trois pièges qui rendraient RLS totalement inopérant sans erreur visible :
--   1. BYPASSRLS sur le rôle applicatif (Neon l'accorde par défaut au rôle
--      "owner" du projet) — ignore les policies exactement comme un
--      superuser. Le rôle qui se connecte depuis l'app ne doit JAMAIS
--      avoir cet attribut ; à vérifier explicitement après création
--      (SELECT rolbypassrls FROM pg_roles ...), pas en le présumant.
--   2. Le propriétaire d'une table ignore RLS par défaut, même sans
--      BYPASSRLS, sauf si la table a FORCE ROW LEVEL SECURITY — d'où les
--      ALTER ... FORCE ci-dessous sur chaque table concernée.
--   3. Les contraintes de clé étrangère (REFERENCES) sont vérifiées par
--      des triggers internes qui s'exécutent avec des privilèges propres
--      à Postgres et IGNORENT RLS — une valeur appartenant à un autre
--      tenant peut donc satisfaire une FK même si la ligne référencée est
--      invisible sous le tenant courant. RLS protège les lectures/écritures
--      normales, pas l'intégrité référentielle. Concrètement : ne jamais
--      faire confiance à une FK seule pour garantir qu'un product_id, un
--      staff_member_id, etc. fourni par le client appartient bien au bon
--      établissement — valider explicitement avec un SELECT scopé
--      establishment_id avant tout INSERT/UPDATE qui accepte un tel ID
--      (voir assignLot dans app/[slug]/pro/actions.ts pour un exemple réel :
--      un production_lots.product_id forgé pointant vers le produit d'un
--      autre établissement a été créé avec succès avant l'ajout de cette
--      validation, sans qu'aucune erreur Postgres ne se déclenche).

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY clients_tenant_isolation ON clients
    USING (
        current_setting('app.is_platform_admin', true) = 'true'
        OR establishment_id::text = current_setting('app.current_establishment_id', true)
    );

-- Même principe appliqué à chaque table portant un establishment_id direct.
-- (establishments elle-même n'a volontairement pas cette policy : la
-- résolution d'un établissement par son slug, pour les pages publiques,
-- doit rester possible avant même qu'un tenant courant soit connu.)

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY orders_tenant_isolation ON orders
    USING (
        current_setting('app.is_platform_admin', true) = 'true'
        OR establishment_id::text = current_setting('app.current_establishment_id', true)
    );

ALTER TABLE legal_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY legal_entities_tenant_isolation ON legal_entities
    USING (
        current_setting('app.is_platform_admin', true) = 'true'
        OR establishment_id::text = current_setting('app.current_establishment_id', true)
    );

ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_members_tenant_isolation ON staff_members
    USING (
        current_setting('app.is_platform_admin', true) = 'true'
        OR establishment_id::text = current_setting('app.current_establishment_id', true)
    );

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY categories_tenant_isolation ON categories
    USING (
        current_setting('app.is_platform_admin', true) = 'true'
        OR establishment_id::text = current_setting('app.current_establishment_id', true)
    );

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY products_tenant_isolation ON products
    USING (
        current_setting('app.is_platform_admin', true) = 'true'
        OR establishment_id::text = current_setting('app.current_establishment_id', true)
    );

ALTER TABLE allergens ENABLE ROW LEVEL SECURITY;
CREATE POLICY allergens_tenant_isolation ON allergens
    USING (
        current_setting('app.is_platform_admin', true) = 'true'
        OR establishment_id::text = current_setting('app.current_establishment_id', true)
    );

ALTER TABLE production_lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY production_lots_tenant_isolation ON production_lots
    USING (
        current_setting('app.is_platform_admin', true) = 'true'
        OR establishment_id::text = current_setting('app.current_establishment_id', true)
    );

ALTER TABLE inter_entity_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY inter_entity_invoices_tenant_isolation ON inter_entity_invoices
    USING (
        current_setting('app.is_platform_admin', true) = 'true'
        OR establishment_id::text = current_setting('app.current_establishment_id', true)
    );

ALTER TABLE cancellation_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY cancellation_policies_tenant_isolation ON cancellation_policies
    USING (
        current_setting('app.is_platform_admin', true) = 'true'
        OR establishment_id::text = current_setting('app.current_establishment_id', true)
    );

ALTER TABLE client_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_invoices_tenant_isolation ON client_invoices
    USING (
        current_setting('app.is_platform_admin', true) = 'true'
        OR establishment_id::text = current_setting('app.current_establishment_id', true)
    );

ALTER TABLE purchase_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_invoices_tenant_isolation ON purchase_invoices
    USING (
        current_setting('app.is_platform_admin', true) = 'true'
        OR establishment_id::text = current_setting('app.current_establishment_id', true)
    );

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_tenant_isolation ON notifications
    USING (
        current_setting('app.is_platform_admin', true) = 'true'
        OR establishment_id::text = current_setting('app.current_establishment_id', true)
    );

ALTER TABLE establishment_closures ENABLE ROW LEVEL SECURITY;
CREATE POLICY establishment_closures_tenant_isolation ON establishment_closures
    USING (
        current_setting('app.is_platform_admin', true) = 'true'
        OR establishment_id::text = current_setting('app.current_establishment_id', true)
    );

-- Sans ceci, le rôle propriétaire des tables (celui qui a exécuté cette
-- migration) continuerait d'ignorer les policies ci-dessus par défaut.
ALTER TABLE clients FORCE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
ALTER TABLE legal_entities FORCE ROW LEVEL SECURITY;
ALTER TABLE staff_members FORCE ROW LEVEL SECURITY;
ALTER TABLE categories FORCE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
ALTER TABLE allergens FORCE ROW LEVEL SECURITY;
ALTER TABLE production_lots FORCE ROW LEVEL SECURITY;
ALTER TABLE inter_entity_invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE cancellation_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE establishment_closures FORCE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE client_invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE purchase_invoices FORCE ROW LEVEL SECURITY;

-- Tables sans establishment_id direct : RLS ne traverse pas les jointures
-- tout seul, donc chacune a sa propre policy vérifiant l'appartenance via
-- sa table parente (EXISTS). Sans ça, une requête directe sur order_items
-- par exemple pourrait renvoyer les lignes d'un autre établissement même
-- avec RLS actif sur orders.

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_items_tenant_isolation ON order_items
    USING (
        current_setting('app.is_platform_admin', true) = 'true'
        OR EXISTS (
            SELECT 1 FROM orders
            WHERE orders.id = order_items.order_id
            AND orders.establishment_id::text = current_setting('app.current_establishment_id', true)
        )
    );

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY payments_tenant_isolation ON payments
    USING (
        current_setting('app.is_platform_admin', true) = 'true'
        OR EXISTS (
            SELECT 1 FROM orders
            WHERE orders.id = payments.order_id
            AND orders.establishment_id::text = current_setting('app.current_establishment_id', true)
        )
    );

ALTER TABLE capacity_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY capacity_reservations_tenant_isolation ON capacity_reservations
    USING (
        current_setting('app.is_platform_admin', true) = 'true'
        OR EXISTS (
            SELECT 1 FROM products
            WHERE products.id = capacity_reservations.product_id
            AND products.establishment_id::text = current_setting('app.current_establishment_id', true)
        )
    );

ALTER TABLE product_capacity_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_capacity_rules_tenant_isolation ON product_capacity_rules
    USING (
        current_setting('app.is_platform_admin', true) = 'true'
        OR EXISTS (
            SELECT 1 FROM products
            WHERE products.id = product_capacity_rules.product_id
            AND products.establishment_id::text = current_setting('app.current_establishment_id', true)
        )
    );

ALTER TABLE product_allergens ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_allergens_tenant_isolation ON product_allergens
    USING (
        current_setting('app.is_platform_admin', true) = 'true'
        OR EXISTS (
            SELECT 1 FROM products
            WHERE products.id = product_allergens.product_id
            AND products.establishment_id::text = current_setting('app.current_establishment_id', true)
        )
    );

ALTER TABLE production_lot_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY production_lot_items_tenant_isolation ON production_lot_items
    USING (
        current_setting('app.is_platform_admin', true) = 'true'
        OR EXISTS (
            SELECT 1 FROM production_lots
            WHERE production_lots.id = production_lot_items.lot_id
            AND production_lots.establishment_id::text = current_setting('app.current_establishment_id', true)
        )
    );

ALTER TABLE inter_entity_invoice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY inter_entity_invoice_lines_tenant_isolation ON inter_entity_invoice_lines
    USING (
        current_setting('app.is_platform_admin', true) = 'true'
        OR EXISTS (
            SELECT 1 FROM inter_entity_invoices
            WHERE inter_entity_invoices.id = inter_entity_invoice_lines.invoice_id
            AND inter_entity_invoices.establishment_id::text = current_setting('app.current_establishment_id', true)
        )
    );

ALTER TABLE order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
ALTER TABLE capacity_reservations FORCE ROW LEVEL SECURITY;
ALTER TABLE product_capacity_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE product_allergens FORCE ROW LEVEL SECURITY;
ALTER TABLE production_lot_items FORCE ROW LEVEL SECURITY;
ALTER TABLE inter_entity_invoice_lines FORCE ROW LEVEL SECURITY;

-- Table volontairement laissée hors RLS : platform_admins (elle détermine
-- justement qui a le droit de tout voir).
