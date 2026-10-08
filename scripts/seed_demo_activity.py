"""Seed ~9 months of realistic demo activity so analytics and rankings are meaningful.

Creates (all clearly identifiable as demo data):
  • 18 demo customers           phone numbers +91900000xxxx
  • ~1,000 historical orders     with order_items, status history and payments
                                 (payments use provider MOCK and ids prefixed 'seed_')
  • MongoDB reviews             for a share of delivered orders

Historical orders do not touch live stock levels. Deterministic (fixed random seed).

Usage:
  backend/.venv/bin/python scripts/seed_demo_activity.py           # seed (skips if already seeded)
  backend/.venv/bin/python scripts/seed_demo_activity.py --reset   # remove ONLY the demo rows above
"""
import random
import secrets
import sys
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend" / "common")]

from sqlalchemy import text  # noqa: E402

from steward_common.mongo import get_mongo_db  # noqa: E402
from steward_common.postgres import engine, verify_steward_database  # noqa: E402

IST = ZoneInfo("Asia/Kolkata")
DEMO_PHONE_PREFIX = "+91900000"
DAYS_OF_HISTORY = 270
rng = random.Random(2026)

CUSTOMERS = [
    ("Aarav Sharma", False), ("Diya Iyer", True), ("Kabir Mehta", False), ("Ananya Rao", True),
    ("Vihaan Gupta", False), ("Isha Nair", False), ("Rohan Das", False), ("Meera Pillai", True),
    ("Arjun Reddy", False), ("Sara Khan", False), ("Nikhil Joshi", False), ("Priya Menon", True),
    ("Aditya Kulkarni", False), ("Kavya Shetty", False), ("Farhan Ali", False), ("Tara Bose", True),
    ("Rahul Verma", False), ("Neha Kapoor", False),
]  # (name, strictly vegetarian)

# Relative popularity and typical review quality per restaurant.
RESTAURANT_PROFILE = {
    "spice-route-kitchen": (22, 4.5), "burger-theory": (18, 4.1), "wok-and-roll": (16, 4.0),
    "napoli-street": (15, 4.3), "green-bowl": (11, 4.6), "levant-grill": (10, 4.4), "coastal-curry-co": (8, 4.2),
}
METHODS = [("upi", 55), ("card", 25), ("netbanking", 10), ("wallet", 10)]
REVIEW_TEXT = {
    5: ["Absolutely delicious, will order again!", "Perfectly spiced and arrived piping hot.",
        "Best meal I've had this month.", "Generous portions and great packaging."],
    4: ["Really good food, delivery was quick.", "Tasty and fresh. Slightly late but worth it.",
        "Loved it — a little less oil would make it perfect."],
    3: ["Decent, nothing special.", "Good taste but the portion felt small.", "Okay food, arrived lukewarm."],
    2: ["Too salty this time.", "Delivery took very long and the food was cold."],
    1: ["Order was wrong and cold. Disappointed."],
}
FLOW = ["CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"]
FLOW_OFFSET_MIN = [1, 4, 18, 24, 42]


def money(x) -> Decimal:
    return Decimal(str(x)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def weighted(pairs):
    items, weights = zip(*pairs)
    return rng.choices(items, weights=weights)[0]


def reset() -> None:
    with engine.begin() as c:
        ids = c.execute(text("SELECT id FROM users WHERE phone LIKE :p"), {"p": DEMO_PHONE_PREFIX + "%"}).scalars().all()
        if not ids:
            print("No demo data found.")
            return
        get_mongo_db()["reviews"].delete_many({"user_id": {"$in": list(ids)}})
        get_mongo_db()["user_activity"].delete_many({"user_id": {"$in": list(ids)}})
        c.execute(text("DELETE FROM payments WHERE user_id = ANY(:ids)"), {"ids": ids})
        n = c.execute(text("DELETE FROM orders WHERE user_id = ANY(:ids)"), {"ids": ids}).rowcount
        c.execute(text("DELETE FROM users WHERE id = ANY(:ids)"), {"ids": ids})
    print(f"✓ Removed {len(ids)} demo customers, {n} demo orders (and their items, history, payments, reviews)")


def seed() -> None:
    with engine.begin() as c:
        if c.execute(text("SELECT count(*) FROM users WHERE phone LIKE :p"), {"p": DEMO_PHONE_PREFIX + "%"}).scalar():
            print("Demo activity already seeded — run with --reset first to regenerate.")
            return

        now = datetime.now(timezone.utc)
        start = now - timedelta(days=DAYS_OF_HISTORY)

        # Customers
        customers = []
        for i, (name, veg) in enumerate(CUSTOMERS):
            joined = start + timedelta(days=rng.randint(0, 60))
            uid = c.execute(text("""
                INSERT INTO users (full_name, phone, role, created_at, last_login_at)
                VALUES (:n, :p, 'USER', :t, :t) RETURNING id
            """), {"n": name, "p": f"{DEMO_PHONE_PREFIX}{i + 1:04d}", "t": joined}).scalar_one()
            customers.append({"id": uid, "name": name, "veg": veg, "joined": joined})

        # Menu snapshot (current prices) grouped by restaurant
        restaurants = {}
        for r in c.execute(text("SELECT id, slug, delivery_fee FROM restaurants")).all():
            if r.slug in RESTAURANT_PROFILE:
                dishes = c.execute(text("SELECT id, name, food_type, price FROM dishes WHERE restaurant_id = :r"),
                                   {"r": r.id}).all()
                restaurants[r.slug] = {"id": r.id, "fee": money(r.delivery_fee), "dishes": dishes}
        if not restaurants:
            sys.exit("Run scripts/seed_catalog.py first.")

        orders, items, history, payments = [], [], [], []
        reviews = []
        for day in range(DAYS_OF_HISTORY + 1):
            date = (start + timedelta(days=day)).astimezone(IST).date()
            growth = 0.45 + 0.55 * day / DAYS_OF_HISTORY                       # platform grows over time
            weekend = 1.35 if date.weekday() >= 4 else 1.0                      # Fri–Sun busier
            for _ in range(max(1, round(rng.gauss(4.2, 1.3) * growth * weekend))):
                hour = weighted([(12, 3), (13, 4), (14, 2), (16, 1), (19, 3), (20, 5), (21, 4), (22, 2)])
                placed_local = datetime(date.year, date.month, date.day, hour, rng.randint(0, 59), tzinfo=IST)
                placed = placed_local.astimezone(timezone.utc)
                if placed > now - timedelta(minutes=3):
                    continue
                cust = rng.choice([cu for cu in customers if cu["joined"] <= placed] or customers)
                slug = weighted([(s, w) for s, (w, _) in RESTAURANT_PROFILE.items() if s in restaurants])
                rest = restaurants[slug]
                menu = [d for d in rest["dishes"] if not cust["veg"] or d.food_type == "VEG"] or rest["dishes"]
                picked = rng.sample(menu, k=min(len(menu), weighted([(1, 4), (2, 4), (3, 2), (4, 1)])))
                lines = [(d, weighted([(1, 6), (2, 3), (3, 1)])) for d in picked]
                subtotal = money(sum(money(d.price) * q for d, q in lines))
                tax = money(subtotal * Decimal("0.05"))
                total = subtotal + rest["fee"] + tax

                minutes_ago = (now - placed).total_seconds() / 60
                roll = rng.random()
                if minutes_ago < 90:                                            # live orders in the last 90 min
                    reached = min(len(FLOW), max(1, int(minutes_ago // 14)))
                    status, path = FLOW[reached - 1], FLOW[:reached]
                elif roll < 0.07:
                    status, path = "FAILED", []
                elif roll < 0.10:
                    status, path = "CANCELLED", ["CONFIRMED"]
                else:
                    status, path = "DELIVERED", FLOW

                key = len(orders)
                orders.append({"user_id": cust["id"], "restaurant_id": rest["id"], "status": status,
                               "subtotal": subtotal, "fee": rest["fee"], "tax": tax, "total": total,
                               "addr": f"{rng.randint(1, 240)}, {rng.choice(['Indiranagar', 'Koramangala', 'HSR Layout', 'Jayanagar', 'Whitefield', 'MG Road'])}, Bengaluru",
                               "phone": None, "t": placed, "cancel": None, "_lines": lines, "_cust": cust, "_slug": slug})
                history.append((key, "PLACED", "Order placed — awaiting payment", placed))
                if status == "FAILED":
                    orders[-1]["cancel"] = "Payment failed: Payment declined by bank (demo)"
                    history.append((key, "FAILED", orders[-1]["cancel"], placed + timedelta(minutes=2)))
                    payments.append((key, "FAILED", None, "Payment declined by bank (demo)", placed))
                    continue
                payments.append((key, "SUCCESS", weighted(METHODS), None, placed))
                for st, off in zip(path, FLOW_OFFSET_MIN):
                    history.append((key, st, "Payment received via development mock payment" if st == "CONFIRMED" else None,
                                    placed + timedelta(minutes=off)))
                if status == "CANCELLED":
                    orders[-1]["cancel"] = "Cancelled by restaurant · refund to be issued"
                    history.append((key, "CANCELLED", orders[-1]["cancel"], placed + timedelta(minutes=3)))
                if status == "DELIVERED" and rng.random() < 0.38:
                    base = RESTAURANT_PROFILE[slug][1]
                    rating = max(1, min(5, round(rng.gauss(base, 0.75))))
                    reviews.append((key, rating, placed + timedelta(hours=rng.randint(1, 20))))

        # Bulk insert orders, then children (one transaction).
        ids = []
        for o in orders:
            ids.append(c.execute(text("""
                INSERT INTO orders (user_id, restaurant_id, status, subtotal, delivery_fee, tax_amount, total_amount,
                                    delivery_address, contact_phone, cancel_reason, created_at, updated_at)
                VALUES (:user_id, :restaurant_id, :status, :subtotal, :fee, :tax, :total, :addr, :phone, :cancel, :t, :t)
                RETURNING id
            """), {k: v for k, v in o.items() if not k.startswith("_")}).scalar_one())
        c.execute(text("""
            INSERT INTO order_items (order_id, dish_id, dish_name, food_type, unit_price, quantity)
            VALUES (:o, :d, :n, :f, :p, :q)
        """), [{"o": ids[i], "d": d.id, "n": d.name, "f": d.food_type, "p": money(d.price), "q": q}
               for i, o in enumerate(orders) for d, q in o["_lines"]])
        c.execute(text("INSERT INTO order_status_history (order_id, status, note, created_at) VALUES (:o, :s, :n, :t)"),
                  [{"o": ids[k], "s": s, "n": n, "t": t} for k, s, n, t in history])
        c.execute(text("""
            INSERT INTO payments (order_id, user_id, provider, razorpay_order_id, razorpay_payment_id, amount,
                                  method, status, failure_reason, created_at, updated_at)
            VALUES (:o, :u, 'MOCK', :ro, :rp, :a, :m, :s, :f, :t, :t)
        """), [{"o": ids[k], "u": orders[k]["user_id"], "ro": f"seed_order_{secrets.token_hex(7)}",
                "rp": f"seed_pay_{secrets.token_hex(7)}" if st == "SUCCESS" else None, "a": orders[k]["total"],
                "m": m if st == "SUCCESS" else None, "s": st, "f": f, "t": t} for k, st, m, f, t in payments])
        # updated_at reflects the last status change
        c.execute(text("""
            UPDATE orders o SET updated_at = h.last
            FROM (SELECT order_id, MAX(created_at) AS last FROM order_status_history GROUP BY order_id) h
            WHERE h.order_id = o.id AND o.id = ANY(:ids)
        """), {"ids": ids})

    if reviews:
        get_mongo_db()["reviews"].insert_many([{
            "user_id": orders[k]["user_id"], "user_name": orders[k]["_cust"]["name"],
            "restaurant_id": orders[k]["restaurant_id"], "order_id": ids[k], "rating": rating,
            "review": rng.choice(REVIEW_TEXT[rating]) if rng.random() < 0.8 else "",
            "created_at": t, "updated_at": None,
        } for k, rating, t in reviews])

    paid = sum(1 for o in orders if o["status"] not in ("FAILED",))
    print(f"✓ {len(customers)} demo customers, {len(orders)} orders ({paid} paid), "
          f"{len(history)} status events, {len(payments)} payments, {len(reviews)} reviews")


if __name__ == "__main__":
    verify_steward_database()
    reset() if "--reset" in sys.argv else seed()
