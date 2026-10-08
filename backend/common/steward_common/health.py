"""Reusable /health router: each service declares which backing stores it depends on."""
from collections.abc import Callable

from fastapi import APIRouter


def health_router(service: str, checks: dict[str, Callable[[], bool]]) -> APIRouter:
    router = APIRouter(tags=["health"])

    @router.get("/health")
    def health():
        results = {name: ("ok" if check() else "down") for name, check in checks.items()}
        status = "ok" if all(v == "ok" for v in results.values()) else "degraded"
        return {"service": service, "status": status, "dependencies": results}

    return router
