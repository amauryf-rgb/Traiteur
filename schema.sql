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
    period_start          DATE NOT NULL,
    period_end            DATE NOT NULL,
    total_amount           NUMERIC(10,2) NOT NULL DEFAULT 0,
    status                 TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'generated')),
    pdf_url                TEXT,
    generated_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
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
