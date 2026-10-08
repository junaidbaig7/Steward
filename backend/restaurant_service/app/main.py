"""Restaurant Service — restaurants, dishes, inventory, pgvector semantic search, reviews."""
import threading
from contextlib import asynccontextmanager

from steward_common.app_factory import create_app
from steward_common.health import health_router
from steward_common.mongo import ping_mongo
from steward_common.postgres import ping_postgres

from .routers import dishes, internal, recommendations, restaurants, reviews, search
from .services.embedding_service import embed_text


@asynccontextmanager
async def lifespan(_app):
    # Warm the embedding model in the background so the first search/dish save is fast.
    threading.Thread(target=embed_text, args=("warm up",), daemon=True).start()
    yield


app = create_app("STEWARD Restaurant Service", "Catalog, inventory, semantic search and reviews", lifespan)

app.include_router(health_router("restaurant-service", {"postgres": ping_postgres, "mongodb": ping_mongo}))
app.include_router(restaurants.router)
app.include_router(dishes.router)
app.include_router(search.router)
app.include_router(reviews.router)
app.include_router(recommendations.router)
app.include_router(internal.router)
