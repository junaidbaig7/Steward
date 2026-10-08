# STEWARD — An Integrated Full-Stack Food Ordering Platform

STEWARD is a food-ordering platform built as a **Database Services & Distributed Backend Engineering** project.
Customers discover restaurants, search for food in plain language ("*spicy chicken under ₹300*"), pay with
Razorpay (Test Mode) and track orders live. Admins manage restaurants, menus and inventory, move orders through
the kitchen and read analytics computed with advanced SQL.

Every technology has one clear job:

| Technology | Role in STEWARD |
|---|---|
| **PostgreSQL** (`steward_db`) | Transactional data: users, restaurants, dishes, inventory ledger, orders, payments |
| **pgvector** | 384-d dish embeddings + cosine similarity for natural-language search & recommendations |
| **MongoDB** (`steward_db`) | Reviews/ratings and the user-activity event stream (flexible documents, aggregation) |
| **Redis** | OTP storage with TTL, rate limits, embedding cache, checkout idempotency keys |
| **FastAPI** (×4) | API Gateway + User, Restaurant and Order microservices |
| **React + Vite + Tailwind** | One SPA containing the customer storefront and the admin portal |
| **Razorpay Test Mode** | Payments with server-side HMAC signature verification |
| **Docker Compose** | Reproducible run of all application services |

---

## 1. Architecture

```
                 React SPA (customer storefront + admin portal)   :5173
                                     │  Axios, JWT bearer
                                     ▼
                         API Gateway — FastAPI                     :8000
           CORS · request IDs · routing by path · friendly 503s · blocks /internal
            ┌────────────────────────┼──────────────────────────┐
            ▼                        ▼                          ▼
     User Service :8001     Restaurant Service :8002      Order Service :8003
     ─────────────────      ────────────────────────      ──────────────────────
     OTP login (Redis)      restaurants, dishes            checkout Saga
     Google OAuth           inventory ledger               orders + tracking
     admin login, JWT       semantic search (pgvector)     Razorpay payments
     profile, activity      reviews (MongoDB)              analytics (SQL)
            │                recommendations                stale-order sweeper
            │                    │        ▲                   │        ▲
            │                    │        └── internal HTTP ──┘        │
            │                    │   (quote, reserve/commit/release    │
            │                    │    stock, review eligibility,       │
            │                    │    order stats)                     │
            ▼                    ▼                                     ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │ PostgreSQL steward_db (+ pgvector)  ·  MongoDB steward_db  ·  Redis      │
   └────────────────────────────────────────────────────────────────────────┘
                    Razorpay Test Mode API ◄── Order Service only
```

**Service boundaries.** Each service owns its tables and is the only writer to them:

| Service | PostgreSQL (writes) | MongoDB | Redis |
|---|---|---|---|
| User | `users` | `user_activity` (shared stream) | `steward:otp:*` |
| Restaurant | `categories`, `restaurants`, `dishes`, `inventory_reservations` | `reviews` | `steward:emb:*` |
| Order | `orders`, `order_items`, `order_status_history`, `payments` | — | `steward:idem:*` |

All services share one PostgreSQL database (`steward_db`) — a deliberate, documented trade-off for a
local academic setup. Cross-service *writes* always go through internal HTTP APIs (e.g. the Order Service
asks the Restaurant Service to reserve stock). The Order Service performs read-only reporting joins on
`restaurants`/`users` for analytics display names.

The gateway proxies `/api/<segment>/...` by the first path segment:
`auth, users → user` · `restaurants, dishes, categories, search, reviews, recommendations → restaurant` ·
`orders, payments, analytics → order`. Any path containing `internal` returns 404 at the gateway, and
internal endpoints additionally require an `X-Internal-Key` header.

---

## 2. Features

**Customer storefront**
- Landing page with natural-language search in the hero, popular dishes (Veg/Non-veg toggle), featured restaurants
- Restaurant list (search, pure-veg filter, sort by rating / delivery time) and menus with Veg/Non-veg & category filters
- **Smart search** — natural language → embeddings → pgvector + full-text + SQL filters, with removable "understood as" chips and a "How this search works" panel
- Cart (one restaurant per order, persisted per browser), bill estimate, "you may also like" (vector neighbours)
- Checkout → Razorpay Test Mode → verified payment → order confirmed (with a tasteful "Preparing your order…" state)
- Live order tracking (polling), cancel before payment, status timeline
- Reviews & ratings for delivered orders; personal dashboard with spending chart and favourites
- Sign in with mobile OTP or Google

**Admin portal** (`/admin`)
- Dashboard: total / today / month / year revenue, orders, AOV, active restaurants, dishes, 30-day revenue, status mix, best sellers
- Restaurants CRUD (pause instead of delete when order history exists)
- Dishes CRUD: price, description, category, image, **Veg/Non-veg**, spice, availability and live stock (+/-)
- Orders: filter, inspect items & payment, advance status through the state machine, cancel
- Analytics: monthly revenue with MoM growth, restaurant league table, best sellers, per-restaurant drill-down
- Reviews: moderation and Bayesian restaurant ranking

---

## 3. Tech stack

Backend: Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2 (psycopg 3), pgvector, PyMongo, redis-py, httpx, bcrypt,
PyJWT, google-auth, sentence-transformers (`all-MiniLM-L6-v2`, CPU).
Frontend: React 19, Vite, Tailwind CSS v4, React Router 7, Axios, Context API, Recharts, Lucide React.
Infra: PostgreSQL 18 + pgvector 0.8, MongoDB 8, Redis 8, Docker Compose.

---

## 4. Folder structure

```
Steward Project/
├── backend/
│   ├── common/steward_common/     shared: settings, DB guards, JWT/RBAC, Mongo/Redis clients, activity log
│   ├── gateway/app/               API gateway (core/config.py routing table, services/proxy.py)
│   ├── user_service/app/          routers · services (auth, otp, sms) · repositories · models · schemas · core
│   ├── restaurant_service/app/    catalog, inventory, search, recommendations, reviews
│   ├── order_service/app/         orders, payments, analytics, Saga sweeper
│   ├── */tests/                   pytest unit tests
│   └── requirements-dev.txt
├── database/
│   ├── postgres/schema.sql        normalised schema, constraints, indexes, triggers (idempotent, no DROPs)
│   └── seed/catalog_data.py       7 restaurants, 65 dishes
├── scripts/
│   ├── init_db.py                 apply schema (verifies current_database() = steward_db)
│   ├── seed_catalog.py            categories, restaurants, dishes + embeddings
│   ├── create_admin.py            the ONLY way to create an admin
│   ├── seed_demo_activity.py      ~9 months of demo orders, payments, reviews (--reset removes them)
│   └── dev.sh                     run all backend services locally with reload
├── frontend/src/
│   ├── services/api/              one Axios module per domain (authApi, restaurantApi, searchApi, …)
│   ├── contexts/                  AuthContext, CartContext, ToastContext
│   ├── hooks/                     useAsync, usePayment, usePolling, useDebounce
│   ├── components/                ui/, food/, orders/, charts/, auth/, layout/
│   ├── layouts/                   UserLayout, AdminLayout
│   └── pages/user, pages/admin
├── docker-compose.yml
├── .env.example
└── README.md
```

Each service follows **routers → services → repositories → models**, with Pydantic **schemas** for validation.
Configuration, database sessions and security live in the shared `steward_common` package so they are not
duplicated across services.

---

## 5. Database design

### PostgreSQL (normalised, 3NF)

```
users ─┐                          categories ─┐
       │ 1:N                                  │ 1:N
       ▼                                      ▼
    orders ◄── N:1 ── restaurants ── 1:N ──► dishes ── 1:N ──► inventory_reservations
       │  │                                     ▲                (order_id, no FK: other service)
       │  └── 1:N ──► order_items ── N:1 ───────┘ (dish_id ON DELETE SET NULL)
       ├── 1:N ──► order_status_history
       └── 1:N ──► payments
```

Highlights (see `database/postgres/schema.sql`):
- **Constraints**: `CHECK` on roles, statuses, food type, spice level, positive prices, non-negative stock, phone/email/slug formats; `total_amount = subtotal + delivery_fee + tax_amount`; admins must have email + password hash; at least one of email/phone per user.
- **Uniqueness**: case-insensitive unique email (expression index), unique phone, unique dish name per restaurant, one review per order, and a **partial unique index** allowing only one `SUCCESS` payment per order.
- **Referential actions**: deleting a restaurant cascades to dishes but is **restricted** when orders exist; deleting a dish keeps order history via `order_items` snapshots (`dish_id → NULL`).
- **Indexes**: FK columns, `(user_id, created_at DESC)` for order history, partial index for orderable dishes, GIN full-text index, **HNSW** vector index (`vector_cosine_ops`).
- **Snapshots, not duplication**: `order_items.unit_price/dish_name` record what the customer paid; analytics are computed from transactions, never from maintained counters.
- **Triggers** keep `updated_at` current.

### MongoDB
- `reviews` — `{ user_id, user_name, restaurant_id, order_id, rating, review, created_at, updated_at }`; indexes: unique `order_id`, `(restaurant_id, created_at)`, `(user_id, created_at)`. Aggregations: `$group` averages, `$facet` star distribution, `$setWindowFields` for the Bayesian ranking.
- `user_activity` — event stream (`LOGIN`, `SEARCH`, `ORDER_PLACED`, `PAYMENT_SUCCESS`, `REVIEW_SUBMITTED`, …) with a **TTL index** (180 days).

### Redis keys (all prefixed `steward:`)
| Key | Purpose | TTL |
|---|---|---|
| `otp:{phone}` | HMAC of the OTP (never the plain code) | 300 s |
| `otp:attempts:{phone}` | wrong guesses (max 5) | with OTP |
| `otp:cooldown:{phone}` | resend throttle | 30 s |
| `otp:hourly:{phone}` | max 5 codes / hour | 1 h |
| `emb:{sha1(text)}` | cached query embeddings | 24 h |
| `idem:{user}:{key}` | checkout idempotency → order id | 24 h |

---

## 6. Setup

### Prerequisites
Python 3.12, Node 20+, PostgreSQL with the `vector` extension available, MongoDB, Redis, Docker Desktop (for Compose).
The STEWARD PostgreSQL database `steward_db` must exist. **STEWARD never creates, drops or touches any other database**:
every service refuses to start unless the configured PostgreSQL and MongoDB database names are `steward_db`,
and `init_db.py` additionally checks `current_database()` before running anything.

### Environment
```bash
cp .env.example .env      # then fill in POSTGRES_USER / POSTGRES_PASSWORD, JWT_SECRET, ADMIN_PASSWORD, …
```

| Variable | Purpose |
|---|---|
| `APP_ENV` | `development` logs OTPs to the console and enables the payment simulator; `production` disables both |
| `POSTGRES_HOST/PORT/DB/USER/PASSWORD` | PostgreSQL connection (DB must be `steward_db`) |
| `MONGODB_URL`, `MONGODB_DB` | MongoDB (DB must be `steward_db`) |
| `REDIS_URL`, `REDIS_KEY_PREFIX` | Redis and key namespace |
| `JWT_SECRET`, `JWT_EXPIRE_MINUTES` | token signing |
| `OTP_TTL_SECONDS` | OTP lifetime |
| `INTERNAL_API_KEY` | service-to-service authentication |
| `GOOGLE_CLIENT_ID` / `VITE_GOOGLE_CLIENT_ID` | Google Identity Services (same Web client ID) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | used once by `create_admin.py` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay **test** keys (`rzp_test_…`) |
| `EMBEDDING_MODEL`, `EMBEDDING_DIM` | `sentence-transformers/all-MiniLM-L6-v2`, `384` (checked at load time) |
| `*_SERVICE_URL`, `CORS_ORIGINS`, `VITE_API_URL` | service discovery and CORS |

### First run (local)
```bash
python3.12 -m venv backend/.venv
(cd backend && .venv/bin/pip install -r requirements-dev.txt)
backend/.venv/bin/python scripts/init_db.py            # schema + pgvector in steward_db
backend/.venv/bin/python scripts/seed_catalog.py       # restaurants, dishes, embeddings
backend/.venv/bin/python scripts/create_admin.py       # admin from ADMIN_EMAIL / ADMIN_PASSWORD
backend/.venv/bin/python scripts/seed_demo_activity.py # optional: 9 months of demo data for analytics
./scripts/dev.sh                                       # gateway :8000 + services :8001-8003
npm --prefix frontend install && npm --prefix frontend run dev   # http://localhost:5173
```

### Docker
```bash
docker compose up --build
```
Builds and runs the gateway, three services and the frontend (nginx) — open http://localhost:5173.
PostgreSQL, MongoDB and Redis stay on the host (they were already installed locally) and containers reach them
through `host.docker.internal`; service-to-service calls use Compose service names (`user-service`,
`restaurant-service`, `order-service`). The restaurant image bakes in CPU-only PyTorch and the embedding model,
so search works offline. Run the `scripts/*.py` setup steps once from the host before the first `up`.

### Tests
```bash
for s in gateway user_service restaurant_service order_service; do (cd backend/$s && ../.venv/bin/python -m pytest -q tests); done
```
Unit tests cover query parsing (price/diet/spice/category extraction), phone normalisation, gateway routing and
Razorpay signature verification. End-to-end flows (auth, RBAC, Saga, payments, reviews, analytics) were verified
against the running stack.

---

## 7. API overview (via gateway, prefix `/api`)

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/otp/request` · `POST /auth/otp/verify` · `POST /auth/google` · `POST /auth/admin/login` |
| Users | `GET/PATCH /users/me` · `GET /users/me/activity` · `GET /users` (admin) |
| Catalog | `GET /restaurants` · `GET /restaurants/{id|slug}` · `GET /restaurants/{id}/dishes` · `GET /dishes` · `GET /dishes/{id}` · `GET /categories` |
| Catalog admin | `POST/PATCH/DELETE /restaurants…` · `POST /restaurants/{id}/dishes` · `PATCH/DELETE /dishes/{id}` · `PATCH /dishes/{id}/stock` |
| Search | `GET /search?q=…&food_type=&max_price=&category_id=&restaurant_id=&ignore=` |
| Recommendations | `GET /recommendations/similar/{dish_id}` · `GET /recommendations/for-you` |
| Orders | `POST /orders` (Idempotency-Key) · `GET /orders` · `GET /orders/{id}` · `POST /orders/{id}/cancel` · `GET /orders/admin/all` · `PATCH /orders/{id}/status` (admin) |
| Payments | `GET /payments/config` · `POST /payments/create` · `POST /payments/verify` · `POST /payments/failure` |
| Reviews | `GET /reviews?restaurant_id=` · `GET /reviews/restaurants/{id}/summary` · `GET /reviews/rankings` · `POST /reviews` · `PATCH/DELETE /reviews/{id}` · `GET /reviews/admin/all` |
| Analytics | `GET /analytics/admin/overview` · `/admin/revenue` · `/admin/restaurants` · `/admin/restaurants/{id}` · `/admin/top-dishes` · `GET /analytics/me` |
| Health | `GET /health` (aggregated) |

Interactive docs per service: `http://localhost:8001/docs`, `:8002/docs`, `:8003/docs`.

---

## 8. How the key flows work

### Authentication & RBAC
```
Mobile:  phone → normalise (E.164) → OTP (secrets) → Redis SET otp:{phone} HMAC EX 300
         → (dev: logged to console) → verify (constant-time compare, 5 attempts) → DEL keys
         → find-or-create user (role USER only) → JWT {sub, role, name, exp}
Google:  Google Identity Services ID token → verify signature/audience/expiry (google-auth)
         → find by google_sub / link by email / create → JWT
Admin:   email + password → bcrypt (constant-time even for unknown emails) → JWT role=ADMIN
```
Every service verifies the JWT itself (`steward_common.security`) and FastAPI dependencies enforce roles:
`AuthUser`, `CustomerUser`, `AdminUser`. Admins cannot be created through the API — only `scripts/create_admin.py`.

### Natural-language search (the retrieval stage of a RAG system)
```
"I want spicy chicken under ₹300"
   │ query_parser (rule-based, unit-tested)
   ├─► filters: price ≤ 300 · food_type = NON_VEG · spice_level ≥ 2      → exact SQL WHERE
   └─► text:    "spicy chicken" → MiniLM → 384-d vector (Redis-cached)
SQL (CTEs):  candidates = 60 nearest by  embedding <=> query  passing the filters
             score = 0.8·cosine_similarity + 0.2·normalised ts_rank (full-text)
             drop weak tail with MAX(similarity) OVER () window
```
Numbers are removed before embedding because embeddings handle numeric constraints poorly; those are enforced
exactly in SQL. Dish embeddings are generated from name, description, category meaning, ingredients, diet, spice
and restaurant, and are recomputed automatically whenever an admin edits those fields.
**Recommendations** reuse the vectors: nearest neighbours of a dish, or of the `AVG()` of a user's past dishes
(vegetarian-only if all their past orders were vegetarian).

### Checkout Saga and failure handling
```
1 quote    Order Service → Restaurant Service: authoritative prices, availability, restaurant status
2 order    local transaction: orders + order_items + history (flushed, not committed)
3 reserve  Restaurant Service: UPDATE dishes SET stock = stock - q WHERE stock >= q  (atomic, no oversell)
4 commit   if the local commit fails → compensate: release reservation
5 pay      Razorpay order (server) → Checkout (browser) → HMAC verify (server)
   success → payment SUCCESS + order CONFIRMED in ONE transaction (row lock), reservation COMMITTED
   failure → the shopper may retry inside Razorpay on the same order; closing the window
             after a failed attempt → payment FAILED + order FAILED → release stock (compensation)
   timeout → sweeper fails PLACED orders after 15 min → release stock
```
Every step is idempotent (reservation ledger statuses, `Idempotency-Key` on checkout, idempotent verify), status
changes take `SELECT … FOR UPDATE`, and the order state machine rejects illegal transitions.
No 2PC and no message broker — just local transactions plus compensations.

### Payments (Razorpay Test Mode)
The key secret never leaves the backend; the browser only receives `key_id` and the Razorpay `order_id`.
Verification checks `HMAC_SHA256(secret, order_id|payment_id) == signature`. Payments are stored with provider,
gateway ids, amount, method and status. Use Razorpay's published test cards / test UPI IDs
(e.g. `success@razorpay` / `failure@razorpay`) — see Razorpay's test-mode documentation.
**Development simulator:** if `RAZORPAY_KEY_ID/SECRET` are empty *and* `APP_ENV=development`, a clearly labelled
simulator replaces the gateway (provider `MOCK`); it disappears as soon as test keys are configured.

### Analytics (advanced SQL)
`order_service/app/repositories/analytics_repository.py`: `FILTER` aggregates for all KPIs in one scan,
`generate_series` for gap-free charts, `LAG()` month-over-month growth, `RANK()` best sellers, `DENSE_RANK()` and
`SUM() OVER ()` revenue share, `ROW_NUMBER()` favourites, CTEs throughout, Asia/Kolkata business days.
Revenue counts paid orders only (`CONFIRMED → DELIVERED`).

---

## 9. Demo guide

**Accounts.** Admin: `ADMIN_EMAIL` / `ADMIN_PASSWORD` from your `.env` (sign in at `/admin/login`).
Customers: any mobile number via OTP — in development the code is printed in the **user-service console**
(`scripts/dev.sh` output or `docker compose logs user-service`), never in API responses.

| # | Step | What to show |
|---|---|---|
| 1 | Admin login | `/admin/login` → dashboard KPIs |
| 2 | Add restaurant/dish | Restaurants → *Add restaurant*; Dishes → *Add dish* (Veg/Non-veg, stock) |
| 3 | pgAdmin | `SELECT * FROM dishes ORDER BY id DESC LIMIT 1;` — note the `embedding` column |
| 4 | User portal | the new dish appears on the restaurant page and in search instantly |
| 5 | Smart search | "I want spicy chicken food under ₹300" → chips + *How this search works*; switch to **Veg** |
| 6 | Register / login | OTP (code in console) → `SELECT * FROM users ORDER BY id DESC LIMIT 1;` and `redis-cli keys 'steward:otp:*'` |
| 7 | Cart | add dishes, change quantities |
| 8 | Payment | checkout → Razorpay Test Mode (or simulator) |
| 9 | Order records | `orders`, `order_items`, `payments`, `order_status_history`, `inventory_reservations` in pgAdmin |
| 10 | Tracking | Admin → Orders → *Mark as preparing / ready / …*; customer page updates within ~8 s |
| 11 | Review | rate the delivered order → MongoDB Compass `steward_db.reviews` |
| 12 | Analytics | Admin dashboard & Analytics reflect the new order and revenue |

Failure demo: choose *Simulate failure* (or `failure@razorpay`) → order `FAILED`, stock restored
(`SELECT stock FROM dishes …` before/after).

---

## 10. Design decisions

- **Four services, not ten.** Gateway + User + Restaurant + Order map to clear domains; search and reviews live in the
  Restaurant Service because they operate on the catalog. Payments live with orders because they share a transaction.
- **One PostgreSQL database, logical ownership.** Strict DB-per-service would add operational overhead without
  teaching value here; writes across boundaries go through APIs.
- **Rule-based query understanding + embeddings** instead of an LLM: deterministic, fast, explainable, offline.
- **Local embeddings (MiniLM, 384-d)**: free, private, no API keys; dimension verified against the `vector(384)` column at startup.
- **Saga with compensations** instead of 2PC; idempotent steps and a timeout sweeper make it safe to retry.
- **Polling for tracking** (8 s, paused in background tabs) instead of WebSockets — simple and sufficient.
- **Redis only for ephemeral data** (OTP, caches, idempotency); nothing durable depends on it.
- **No public admin registration**; admin accounts are provisioned by script.
- **Safety first**: database-name guards in config, `init_db.py`, schema without `DROP`, and demo seeding that only
  ever removes rows it created.
