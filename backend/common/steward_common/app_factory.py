"""Common FastAPI app setup: consistent error responses and no leaked stack traces."""
import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")


def _first_validation_message(exc: RequestValidationError) -> str:
    errors = exc.errors()
    if not errors:
        return "Invalid request."
    err = errors[0]
    field = ".".join(str(p) for p in err.get("loc", []) if p not in ("body", "query", "path"))
    msg = err.get("msg", "Invalid value").removeprefix("Value error, ")
    return f"{field}: {msg}" if field else msg


def create_app(title: str, description: str = "", lifespan=None) -> FastAPI:
    app = FastAPI(title=title, description=description, version="1.0.0", lifespan=lifespan)
    log = logging.getLogger(title)

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(_: Request, exc: RequestValidationError):
        # Only plain fields: raw errors can contain exception objects that are not JSON-serialisable.
        fields = [
            {"field": ".".join(str(p) for p in e.get("loc", [])), "message": e.get("msg", "")}
            for e in exc.errors()
        ]
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": _first_validation_message(exc), "errors": fields},
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        log.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Something went wrong on our side. Please try again."},
        )

    return app
