"""Local text embeddings with sentence-transformers/all-MiniLM-L6-v2 (384 dimensions, offline, free).

The model is loaded lazily once per process. Vectors are L2-normalised so cosine
similarity in pgvector (`<=>`) behaves consistently.
"""
import logging
from functools import lru_cache

from steward_common.config import get_settings

log = logging.getLogger(__name__)

SPICE_WORDS = {0: "not spicy, mild", 1: "mildly spicy", 2: "spicy", 3: "very spicy, hot, fiery"}

# What each category *means* to a hungry person — helps queries like "something sweet".
CATEGORY_HINTS = {
    "Desserts": "a sweet dessert to have after a meal",
    "Beverages": "a refreshing drink",
    "Soups": "a warm, light soup",
    "Starters": "a starter, appetiser or snack",
    "Mains": "a filling main course",
    "Biryani & Rice": "a rice dish",
    "Noodles & Pasta": "a noodle or pasta dish",
    "Pizza": "a pizza",
    "Burgers & Sandwiches": "a burger or sandwich, quick comfort food",
    "Wraps & Rolls": "a wrap or roll, easy to eat on the go",
    "Salads & Bowls": "a fresh, healthy salad or bowl",
    "Sides": "a side dish",
}


@lru_cache
def _model():
    from sentence_transformers import SentenceTransformer  # heavy import, deferred

    settings = get_settings()
    model = SentenceTransformer(settings.embedding_model, device="cpu")
    actual_dim = model.get_embedding_dimension()
    if actual_dim != settings.embedding_dim:
        # Guard: the vector(384) column must match the model output exactly.
        raise RuntimeError(
            f"Embedding model outputs {actual_dim} dims but EMBEDDING_DIM={settings.embedding_dim}"
        )
    log.info("Loaded embedding model %s (%d dims)", settings.embedding_model, actual_dim)
    return model


def embed_texts(texts: list[str]) -> list[list[float]]:
    vectors = _model().encode(texts, normalize_embeddings=True, batch_size=32, show_progress_bar=False)
    return [v.tolist() for v in vectors]


def embed_text(text: str) -> list[float]:
    return embed_texts([text])[0]


def dish_document(
    *, name: str, description: str, category: str, ingredients: str, food_type: str,
    spice_level: int, restaurant_name: str, cuisine: str,
) -> str:
    """The text that represents a dish in vector space."""
    diet = "vegetarian, veg" if food_type == "VEG" else "non-vegetarian, non-veg, contains meat or egg"
    parts = [
        f"{name}.",
        description,
        f"Category: {category}, {CATEGORY_HINTS.get(category, '').strip()}.",
        f"Ingredients: {ingredients}." if ingredients else "",
        f"{diet.capitalize()}.",
        f"{SPICE_WORDS.get(spice_level, '').capitalize()}.",
        f"From {restaurant_name}, {cuisine} cuisine.",
    ]
    return " ".join(p for p in parts if p)
