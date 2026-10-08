"""Reverse-proxy logic: forward a request to the owning microservice and relay the response."""
import logging

import httpx
from fastapi import Request
from fastapi.responses import JSONResponse, Response

from ..core.config import BLOCKED_SEGMENTS, ROUTES, SERVICE_URLS

log = logging.getLogger("gateway.proxy")

# Hop-by-hop headers must not be forwarded (RFC 7230 §6.1).
HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te",
    "trailers", "transfer-encoding", "upgrade", "host", "content-length", "content-encoding",
}


def resolve_service(path: str) -> str | None:
    """'restaurants/3/dishes' -> 'restaurant'. Returns None for unknown or blocked paths."""
    segments = [s for s in path.split("/") if s]
    if not segments or any(s in BLOCKED_SEGMENTS for s in segments):
        return None
    return ROUTES.get(segments[0])


async def forward(request: Request, client: httpx.AsyncClient, path: str, request_id: str) -> Response:
    service = resolve_service(path)
    if service is None:
        return JSONResponse({"detail": "Not found."}, status_code=404)

    url = f"{SERVICE_URLS[service]}/{path}"
    headers = {k: v for k, v in request.headers.items() if k.lower() not in HOP_BY_HOP}
    headers["x-request-id"] = request_id
    headers["x-forwarded-for"] = request.client.host if request.client else ""

    try:
        upstream = await client.request(
            request.method,
            url,
            params=request.query_params,
            headers=headers,
            content=await request.body(),
        )
    except (httpx.ConnectError, httpx.ConnectTimeout):
        log.warning("Service %s unreachable at %s", service, url)
        return JSONResponse(
            {"detail": f"The {service} service is temporarily unavailable. Please try again shortly."},
            status_code=503,
        )
    except httpx.ReadTimeout:
        return JSONResponse({"detail": "The request timed out. Please try again."}, status_code=504)

    response_headers = {k: v for k, v in upstream.headers.items() if k.lower() not in HOP_BY_HOP}
    response_headers["x-served-by"] = f"{service}-service"
    return Response(content=upstream.content, status_code=upstream.status_code, headers=response_headers)
