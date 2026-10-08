"""STEWARD API Gateway — the single entry point for the React frontend.

Responsibilities: CORS, request IDs, timing, routing to microservices, and
turning downstream outages into friendly 503 responses.
"""
import time
import uuid
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from steward_common.config import get_settings

from .core.config import SERVICE_URLS
from .services.proxy import forward

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # One pooled HTTP client shared by all requests.
    app.state.client = httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=3.0))
    yield
    await app.state.client.aclose()


app = FastAPI(title="STEWARD API Gateway", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["x-request-id", "x-served-by", "x-response-time-ms"],
)


@app.middleware("http")
async def request_context(request: Request, call_next):
    request.state.request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    started = time.perf_counter()
    response = await call_next(request)
    response.headers["x-request-id"] = request.state.request_id
    response.headers["x-response-time-ms"] = f"{(time.perf_counter() - started) * 1000:.1f}"
    return response


@app.get("/api/health", tags=["health"])
async def health(request: Request):
    """Aggregated health: the gateway asks each microservice for its own health report."""
    client: httpx.AsyncClient = request.app.state.client
    services = {}
    for name, base in SERVICE_URLS.items():
        try:
            r = await client.get(f"{base}/health", timeout=3.0)
            services[name] = r.json()
        except Exception:
            services[name] = {"status": "unreachable"}
    overall = "ok" if all(s.get("status") == "ok" for s in services.values()) else "degraded"
    return {"status": overall, "gateway": "ok", "services": services}


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def proxy(path: str, request: Request):
    return await forward(request, request.app.state.client, path, request.state.request_id)
