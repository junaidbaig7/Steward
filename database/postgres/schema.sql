-- ════════════════════════════════════════════════════════════════════
-- STEWARD — PostgreSQL schema (database: steward_db)
--
-- Idempotent: every object uses IF NOT EXISTS / OR REPLACE.
-- Contains NO DROP statements. Applied by scripts/init_db.py, which
-- first verifies that current_database() = 'steward_db'.
--
-- Logical ownership (one database, clear service boundaries):
--   user-service        → users
--   restaurant-service  → categories, restaurants, dishes, inventory_reservations
--   order-service       → orders, order_items, order_status_history, payments
-- ════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS vector;   -- pgvector: semantic dish search

-- Keeps updated_at current on every UPDATE.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ────────────────────────────────────────────────────────────────────
-- users  (user-service)
-- One table for customers and admins; RBAC via `role`.
-- A user signs in by phone OTP, Google, or (admins only) email+password.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name       VARCHAR(120),
    email           VARCHAR(255),
    phone           VARCHAR(16),
    google_sub      VARCHAR(64) UNIQUE,              -- Google account subject id
    password_hash   VARCHAR(255),                    -- bcrypt; admins only
    role            VARCHAR(10)  NOT NULL DEFAULT 'USER',
    avatar_url      TEXT,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT users_role_chk        CHECK (role IN ('USER', 'ADMIN')),
    CONSTRAINT users_phone_format    CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$'),
    CONSTRAINT users_email_format    CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    CONSTRAINT users_has_identity    CHECK (email IS NOT NULL OR phone IS NOT NULL),
    CONSTRAINT users_admin_password  CHECK (role <> 'ADMIN' OR (email IS NOT NULL AND password_hash IS NOT NULL))
);
-- Case-insensitive uniqueness for email; plain uniqueness for phone.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_uq ON users (phone);

CREATE OR REPLACE TRIGGER users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ────────────────────────────────────────────────────────────────────
-- categories  (restaurant-service) — normalised lookup for dish categories
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
    id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR(50) NOT NULL UNIQUE,
    sort_order  SMALLINT    NOT NULL DEFAULT 0
);


-- ────────────────────────────────────────────────────────────────────
-- restaurants  (restaurant-service)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS restaurants (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name                  VARCHAR(120)  NOT NULL,
    slug                  VARCHAR(140)  NOT NULL UNIQUE,
    description           TEXT          NOT NULL DEFAULT '',
    cuisine               VARCHAR(120)  NOT NULL,
    address               TEXT          NOT NULL,
    city                  VARCHAR(80)   NOT NULL,
    phone                 VARCHAR(16),
    image_url             TEXT,
    avg_delivery_minutes  SMALLINT      NOT NULL DEFAULT 30,
    delivery_fee          NUMERIC(8,2)  NOT NULL DEFAULT 0,
    min_order_amount      NUMERIC(8,2)  NOT NULL DEFAULT 0,
    is_active             BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),

    CONSTRAINT restaurants_slug_format   CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT restaurants_delivery_time CHECK (avg_delivery_minutes BETWEEN 5 AND 180),
    CONSTRAINT restaurants_fee_nonneg    CHECK (delivery_fee >= 0 AND min_order_amount >= 0)
);
CREATE INDEX IF NOT EXISTS restaurants_active_idx ON restaurants (is_active);
CREATE INDEX IF NOT EXISTS restaurants_city_idx   ON restaurants (city);

CREATE OR REPLACE TRIGGER restaurants_updated_at BEFORE UPDATE ON restaurants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ────────────────────────────────────────────────────────────────────
-- dishes  (restaurant-service) — menu items, live inventory and embeddings
-- embedding: 384-dim vector from sentence-transformers/all-MiniLM-L6-v2
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dishes (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    restaurant_id  BIGINT        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
    category_id    INT           NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
    name           VARCHAR(120)  NOT NULL,
    description    TEXT          NOT NULL DEFAULT '',
    ingredients    TEXT          NOT NULL DEFAULT '',
    food_type      VARCHAR(8)    NOT NULL,
    spice_level    SMALLINT      NOT NULL DEFAULT 0,
    price          NUMERIC(8,2)  NOT NULL,
    image_url      TEXT,
    is_available   BOOLEAN       NOT NULL DEFAULT TRUE,
    stock          INT           NOT NULL DEFAULT 0,
    embedding      vector(384),
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),

    CONSTRAINT dishes_food_type_chk   CHECK (food_type IN ('VEG', 'NON_VEG')),
    CONSTRAINT dishes_spice_level_chk CHECK (spice_level BETWEEN 0 AND 3),
    CONSTRAINT dishes_price_positive  CHECK (price > 0),
    CONSTRAINT dishes_stock_nonneg    CHECK (stock >= 0),
    CONSTRAINT dishes_name_per_restaurant UNIQUE (restaurant_id, name)
);
CREATE INDEX IF NOT EXISTS dishes_restaurant_idx ON dishes (restaurant_id);
CREATE INDEX IF NOT EXISTS dishes_category_idx   ON dishes (category_id);
-- Supports the structured half of hybrid search (veg filter + price range on orderable dishes).
CREATE INDEX IF NOT EXISTS dishes_orderable_filter_idx
    ON dishes (food_type, price) WHERE is_available AND stock > 0;
-- Approximate-nearest-neighbour index for cosine similarity (pgvector HNSW).
CREATE INDEX IF NOT EXISTS dishes_embedding_hnsw_idx
    ON dishes USING hnsw (embedding vector_cosine_ops);

-- Full-text index: the keyword half of hybrid search (combined with vector similarity).
CREATE INDEX IF NOT EXISTS dishes_fts_idx ON dishes USING gin (
    to_tsvector('english', name || ' ' || description || ' ' || ingredients)
);

CREATE OR REPLACE TRIGGER dishes_updated_at BEFORE UPDATE ON dishes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ────────────────────────────────────────────────────────────────────
-- inventory_reservations  (restaurant-service)
-- Stock ledger for the order Saga. Reserving stock decrements dishes.stock;
-- a compensating RELEASE puts it back exactly once (idempotent by status).
-- order_id intentionally has no FK: orders belong to another service.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_reservations (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id    BIGINT       NOT NULL,
    dish_id     BIGINT       NOT NULL REFERENCES dishes (id) ON DELETE CASCADE,
    quantity    INT          NOT NULL,
    status      VARCHAR(10)  NOT NULL DEFAULT 'RESERVED',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT inv_res_quantity_positive CHECK (quantity > 0),
    CONSTRAINT inv_res_status_chk        CHECK (status IN ('RESERVED', 'COMMITTED', 'RELEASED')),
    CONSTRAINT inv_res_order_dish_uq     UNIQUE (order_id, dish_id)
);
CREATE INDEX IF NOT EXISTS inv_res_dish_idx ON inventory_reservations (dish_id);

CREATE OR REPLACE TRIGGER inventory_reservations_updated_at BEFORE UPDATE ON inventory_reservations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ────────────────────────────────────────────────────────────────────
-- orders  (order-service)
-- One order = one restaurant. Money columns are a snapshot at checkout
-- (menu prices can change later), so they are stored, not recomputed.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id           BIGINT         NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    restaurant_id     BIGINT         NOT NULL REFERENCES restaurants (id) ON DELETE RESTRICT,
    status            VARCHAR(20)    NOT NULL DEFAULT 'PLACED',
    subtotal          NUMERIC(10,2)  NOT NULL,
    delivery_fee      NUMERIC(10,2)  NOT NULL DEFAULT 0,
    tax_amount        NUMERIC(10,2)  NOT NULL DEFAULT 0,
    total_amount      NUMERIC(10,2)  NOT NULL,
    delivery_address  TEXT           NOT NULL,
    contact_phone     VARCHAR(16),
    notes             TEXT,
    cancel_reason     TEXT,
    created_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),

    CONSTRAINT orders_status_chk CHECK (status IN (
        'PLACED', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY',
        'DELIVERED', 'CANCELLED', 'FAILED')),
    CONSTRAINT orders_amounts_nonneg CHECK (subtotal > 0 AND delivery_fee >= 0 AND tax_amount >= 0),
    CONSTRAINT orders_total_consistent CHECK (total_amount = subtotal + delivery_fee + tax_amount)
);
CREATE INDEX IF NOT EXISTS orders_user_created_idx       ON orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_restaurant_created_idx ON orders (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_created_idx            ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx             ON orders (status);

CREATE OR REPLACE TRIGGER orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ────────────────────────────────────────────────────────────────────
-- order_items  (order-service)
-- dish_name/unit_price are historical snapshots; dish_id becomes NULL if
-- the dish is later deleted, without losing order history.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id    BIGINT        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    dish_id     BIGINT        REFERENCES dishes (id) ON DELETE SET NULL,
    dish_name   VARCHAR(120)  NOT NULL,
    food_type   VARCHAR(8)    NOT NULL,
    unit_price  NUMERIC(8,2)  NOT NULL,
    quantity    SMALLINT      NOT NULL,

    CONSTRAINT order_items_price_positive CHECK (unit_price > 0),
    CONSTRAINT order_items_quantity_range CHECK (quantity BETWEEN 1 AND 50),
    CONSTRAINT order_items_food_type_chk  CHECK (food_type IN ('VEG', 'NON_VEG')),
    CONSTRAINT order_items_dish_once      UNIQUE (order_id, dish_id)
);
CREATE INDEX IF NOT EXISTS order_items_dish_idx ON order_items (dish_id);


-- ────────────────────────────────────────────────────────────────────
-- order_status_history  (order-service) — audit trail powering tracking UI
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_status_history (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id    BIGINT       NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    status      VARCHAR(20)  NOT NULL,
    note        TEXT,
    changed_by  BIGINT       REFERENCES users (id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_status_history_order_idx ON order_status_history (order_id, created_at);


-- ────────────────────────────────────────────────────────────────────
-- payments  (order-service) — Razorpay Test Mode (or labelled dev MOCK)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id             BIGINT         NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
    user_id              BIGINT         NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    provider             VARCHAR(10)    NOT NULL DEFAULT 'RAZORPAY',
    razorpay_order_id    VARCHAR(64)    NOT NULL UNIQUE,
    razorpay_payment_id  VARCHAR(64)    UNIQUE,
    razorpay_signature   VARCHAR(128),
    amount               NUMERIC(10,2)  NOT NULL,
    currency             CHAR(3)        NOT NULL DEFAULT 'INR',
    method               VARCHAR(30),
    status               VARCHAR(10)    NOT NULL DEFAULT 'PENDING',
    failure_reason       TEXT,
    created_at           TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ    NOT NULL DEFAULT now(),

    CONSTRAINT payments_provider_chk CHECK (provider IN ('RAZORPAY', 'MOCK')),
    CONSTRAINT payments_status_chk   CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED')),
    CONSTRAINT payments_amount_positive CHECK (amount > 0),
    CONSTRAINT payments_success_has_id CHECK (status <> 'SUCCESS' OR razorpay_payment_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS payments_order_idx ON payments (order_id);
CREATE INDEX IF NOT EXISTS payments_user_idx  ON payments (user_id);
-- An order can be paid successfully at most once.
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_success_per_order
    ON payments (order_id) WHERE status = 'SUCCESS';

CREATE OR REPLACE TRIGGER payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ────────────────────────────────────────────────────────────────────
-- Documentation visible in pgAdmin
-- ────────────────────────────────────────────────────────────────────
COMMENT ON TABLE users                  IS 'Owned by user-service. Customers (OTP/Google) and admins (email+password).';
COMMENT ON TABLE categories             IS 'Owned by restaurant-service. Normalised dish categories.';
COMMENT ON TABLE restaurants            IS 'Owned by restaurant-service.';
COMMENT ON TABLE dishes                 IS 'Owned by restaurant-service. Menu, live stock and pgvector embeddings.';
COMMENT ON TABLE inventory_reservations IS 'Owned by restaurant-service. Saga stock ledger (RESERVED → COMMITTED | RELEASED).';
COMMENT ON TABLE orders                 IS 'Owned by order-service.';
COMMENT ON TABLE order_items            IS 'Owned by order-service. Price/name snapshots at checkout.';
COMMENT ON TABLE order_status_history   IS 'Owned by order-service. Status audit trail for tracking.';
COMMENT ON TABLE payments               IS 'Owned by order-service. Razorpay Test Mode payment records.';
COMMENT ON COLUMN dishes.embedding      IS '384-d sentence-transformers/all-MiniLM-L6-v2 embedding of name, description, category, ingredients, food type and restaurant.';
