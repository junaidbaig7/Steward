"""Hybrid semantic search = pgvector similarity + PostgreSQL full-text + exact SQL filters.

    query ──► parse_query ──► structured filters (price, veg, spice)  ─┐
                    │                                                  ├─► SQL (CTEs) ─► ranked dishes
                    └──► cleaned text ──► MiniLM embedding (384-d) ───┘

This is the *retrieval* stage of a RAG-style system: it finds the most relevant
records; no text is generated.
"""
import hashlib
import json
import logging
import re
import time

from sqlalchemy import text
from sqlalchemy.orm import Session

from steward_common.redis_client import get_redis, key

from ..repositories import dish_repository as dishes
from .embedding_service import embed_text
from .query_parser import ParsedQuery, parse_query

log = logging.getLogger("restaurant-service.search")

SEMANTIC_WEIGHT, KEYWORD_WEIGHT = 0.8, 0.2
MIN_SIMILARITY = 0.12          # below this a dish is unrelated to the request
RELATIVE_FLOOR = 0.6           # keep dishes at least 60% as similar as the best match
CANDIDATES = 60                # vector-retrieved candidates re-ranked by the hybrid score
EMBEDDING_CACHE_TTL = 24 * 3600

_HYBRID_SQL = """
WITH query AS (
    SELECT CAST(:vector AS vector) AS v,
           to_tsquery('english', :tsquery)  AS ts
),
candidates AS (                               -- 1) nearest neighbours that pass the hard filters
    SELECT d.id,
           1 - (d.embedding <=> query.v) AS semantic,
           ts_rank_cd(to_tsvector('english', d.name || ' ' || d.description || ' ' || d.ingredients),
                      query.ts) AS keyword
    FROM dishes d
    JOIN restaurants r ON r.id = d.restaurant_id
    CROSS JOIN query
    WHERE d.embedding IS NOT NULL {filters}
    ORDER BY d.embedding <=> query.v
    LIMIT :candidates
),
scored AS (                                   -- 2) blend meaning + keyword evidence
    SELECT id, semantic, keyword,
           {sw} * semantic + {kw} * (keyword / (keyword + 1)) AS score,
           MAX(semantic) OVER () AS best           -- window function: best match in this result set
    FROM candidates
)
SELECT id,
       round(semantic::numeric, 4) AS semantic,
       round(keyword::numeric, 4)  AS keyword,
       round(score::numeric, 4)    AS score
FROM scored
WHERE semantic >= GREATEST(:min_similarity, best * :relative_floor)   -- 3) drop weak tail
ORDER BY score DESC
LIMIT :limit
"""


def _cached_embedding(text_: str) -> list[float]:
    """Embeddings are deterministic, so repeated queries hit Redis instead of the model."""
    cache_key = key("emb", hashlib.sha1(text_.encode()).hexdigest())
    try:
        r = get_redis()
        if cached := r.get(cache_key):
            return json.loads(cached)
        vector = embed_text(text_)
        r.set(cache_key, json.dumps(vector), ex=EMBEDDING_CACHE_TTL)
        return vector
    except Exception:  # Redis down → still search, just uncached
        return embed_text(text_)


def _tsquery(words: list[str]) -> str:
    """OR-query of safe words: 'chicken | spicy'. Empty → a term that matches nothing."""
    safe = [re.sub(r"[^a-z]", "", w) for w in words]
    return " | ".join(w for w in safe if w) or "zzzunmatched"


def search(
    db: Session, q: str, *, food_type: str | None, min_price: float | None, max_price: float | None,
    category_id: int | None, restaurant_id: int | None, include_unavailable: bool,
    ignore: set[str], limit: int,
) -> dict:
    started = time.perf_counter()
    parsed: ParsedQuery = parse_query(q)

    # Explicit UI filters override detected ones; `ignore` lets the user dismiss a detected chip.
    overridden = {
        "food_type": food_type is not None,
        "price": min_price is not None or max_price is not None,
        "category": category_id is not None,
    }
    detected = [d for d in parsed.detected if d["key"] not in ignore and not overridden.get(d["key"])]
    eff_food = food_type or (parsed.food_type if "food_type" not in ignore else None)
    eff_min_price = min_price if min_price is not None else (parsed.min_price if "price" not in ignore else None)
    eff_max_price = max_price if max_price is not None else (parsed.max_price if "price" not in ignore else None)
    min_spice = parsed.min_spice if "spice" not in ignore else None
    max_spice = parsed.max_spice if "spice" not in ignore else None
    if category_id is None and parsed.category and "category" not in ignore:
        category_id = dishes.category_id_by_name(db, parsed.category)

    clauses, params = [], {}
    def add(clause: str, **p):  # noqa: E306
        clauses.append(clause)
        params.update(p)

    if eff_food:
        add("d.food_type = :food_type", food_type=eff_food)
    if eff_min_price is not None:
        add("d.price >= :min_price", min_price=eff_min_price)
    if eff_max_price is not None:
        add("d.price <= :max_price", max_price=eff_max_price)
    if min_spice is not None:
        add("d.spice_level >= :min_spice", min_spice=min_spice)
    if max_spice is not None:
        add("d.spice_level <= :max_spice", max_spice=max_spice)
    if category_id:
        add("d.category_id = :category_id", category_id=category_id)
    if restaurant_id:
        add("d.restaurant_id = :restaurant_id", restaurant_id=restaurant_id)
    if not include_unavailable:
        add("d.is_available AND d.stock > 0 AND r.is_active")

    sql = _HYBRID_SQL.format(
        filters="".join(f"\n      AND {c}" for c in clauses), sw=SEMANTIC_WEIGHT, kw=KEYWORD_WEIGHT,
    )
    vector = _cached_embedding(parsed.semantic_text)
    rows = db.execute(text(sql), {
        **params, "vector": str(vector), "tsquery": _tsquery(parsed.keywords()),
        "candidates": CANDIDATES, "min_similarity": MIN_SIMILARITY, "relative_floor": RELATIVE_FLOOR,
        "limit": limit,
    }).all()

    by_id = {d["id"]: d for d in dishes.get_many_dicts(db, [r.id for r in rows])}
    results = [
        {**by_id[r.id], "similarity": float(r.semantic), "keyword_score": float(r.keyword), "score": float(r.score)}
        for r in rows if r.id in by_id
    ]
    took_ms = round((time.perf_counter() - started) * 1000, 1)
    log.info("search %r → %d results in %sms (filters: %s)", q, len(results), took_ms, clauses)

    return {
        "query": q,
        "interpreted": {
            "semantic_text": parsed.semantic_text,
            "keywords": parsed.keywords(),
            "detected": detected,
            "applied_filters": {
                "food_type": eff_food, "min_price": eff_min_price, "max_price": eff_max_price,
                "min_spice": min_spice, "max_spice": max_spice, "category_id": category_id,
                "restaurant_id": restaurant_id, "available_only": not include_unavailable,
            },
        },
        "total": len(results),
        "took_ms": took_ms,
        "items": results,
    }
