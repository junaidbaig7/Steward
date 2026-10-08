"""Seed categories, restaurants and dishes (with pgvector embeddings) into steward_db.

Idempotent: uses INSERT ... ON CONFLICT DO UPDATE, so re-running refreshes data
without creating duplicates. Never deletes anything.

Usage:  backend/.venv/bin/python scripts/seed_catalog.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend" / "common"), str(ROOT / "backend" / "restaurant_service"), str(ROOT)]

from sqlalchemy import text  # noqa: E402

from app.services.embedding_service import dish_document, embed_texts  # noqa: E402
from database.seed.catalog_data import CATEGORIES, RESTAURANTS  # noqa: E402
from steward_common.postgres import engine, verify_steward_database  # noqa: E402

UPSERT_CATEGORY = text("""
    INSERT INTO categories (name, sort_order) VALUES (:name, :sort_order)
    ON CONFLICT (name) DO UPDATE SET sort_order = EXCLUDED.sort_order
    RETURNING id
""")

UPSERT_RESTAURANT = text("""
    INSERT INTO restaurants (name, slug, description, cuisine, address, city, phone, image_url,
                             avg_delivery_minutes, delivery_fee, min_order_amount)
    VALUES (:name, :slug, :description, :cuisine, :address, :city, :phone, :image_url,
            :avg_delivery_minutes, :delivery_fee, :min_order_amount)
    ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description, cuisine = EXCLUDED.cuisine,
        address = EXCLUDED.address, city = EXCLUDED.city, phone = EXCLUDED.phone,
        image_url = EXCLUDED.image_url, avg_delivery_minutes = EXCLUDED.avg_delivery_minutes,
        delivery_fee = EXCLUDED.delivery_fee, min_order_amount = EXCLUDED.min_order_amount
    RETURNING id
""")

UPSERT_DISH = text("""
    INSERT INTO dishes (restaurant_id, category_id, name, description, ingredients, food_type,
                        spice_level, price, image_url, stock, embedding)
    VALUES (:restaurant_id, :category_id, :name, :description, :ingredients, :food_type,
            :spice_level, :price, :image_url, :stock, CAST(:embedding AS vector))
    ON CONFLICT ON CONSTRAINT dishes_name_per_restaurant DO UPDATE SET
        category_id = EXCLUDED.category_id, description = EXCLUDED.description,
        ingredients = EXCLUDED.ingredients, food_type = EXCLUDED.food_type,
        spice_level = EXCLUDED.spice_level, price = EXCLUDED.price,
        image_url = EXCLUDED.image_url, stock = EXCLUDED.stock, embedding = EXCLUDED.embedding
""")


def main() -> None:
    verify_steward_database()
    print("✓ Connected to steward_db")

    # Build every dish's search document first, then embed in one batch (much faster).
    rows, documents = [], []
    for r in RESTAURANTS:
        for d in r["dishes"]:
            rows.append((r, d))
            documents.append(dish_document(
                name=d["name"], description=d["description"], category=d["category"],
                ingredients=d["ingredients"], food_type=d["food_type"], spice_level=d["spice_level"],
                restaurant_name=r["name"], cuisine=r["cuisine"],
            ))
    print(f"… embedding {len(documents)} dishes with the local MiniLM model")
    vectors = embed_texts(documents)

    with engine.begin() as conn:  # single transaction
        category_ids = {
            name: conn.execute(UPSERT_CATEGORY, {"name": name, "sort_order": i}).scalar_one()
            for i, name in enumerate(CATEGORIES)
        }
        restaurant_ids = {}
        for r in RESTAURANTS:
            params = {k: v for k, v in r.items() if k != "dishes"}
            restaurant_ids[r["slug"]] = conn.execute(UPSERT_RESTAURANT, params).scalar_one()

        for (r, d), vector in zip(rows, vectors):
            conn.execute(UPSERT_DISH, {
                **{k: v for k, v in d.items() if k != "category"},
                "restaurant_id": restaurant_ids[r["slug"]],
                "category_id": category_ids[d["category"]],
                "embedding": str(vector),
            })

        counts = conn.execute(text("""
            SELECT (SELECT count(*) FROM categories), (SELECT count(*) FROM restaurants),
                   (SELECT count(*) FROM dishes), (SELECT count(*) FROM dishes WHERE embedding IS NOT NULL)
        """)).one()
    print(f"✓ categories={counts[0]} restaurants={counts[1]} dishes={counts[2]} with_embeddings={counts[3]}")


if __name__ == "__main__":
    main()
