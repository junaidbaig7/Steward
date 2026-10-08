"""Order Service — checkout, orders, order tracking, Razorpay payments, analytics."""
import asyncio
import logging
from contextlib import asynccontextmanager

from steward_common.app_factory import create_app
from steward_common.health import health_router
from steward_common.postgres import SessionLocal, ping_postgres

from .routers import analytics, internal, orders, payments
from .services.order_service import expire_stale_orders

log = logging.getLogger("order-service")
SWEEP_INTERVAL_SECONDS = 60


def _sweep_once() -> None:
    with SessionLocal() as db:
        expired = expire_stale_orders(db)
        if expired:
            log.info("Saga timeout: %d unpaid order(s) failed and stock released", expired)


async def _sweeper():
    """Background loop: fail unpaid orders after 15 minutes (compensating action)."""
    while True:
        try:
            await asyncio.to_thread(_sweep_once)
        except Exception:
            log.exception("Stale-order sweep failed")
        await asyncio.sleep(SWEEP_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(_app):
    task = asyncio.create_task(_sweeper())
    yield
    task.cancel()


app = create_app("STEWARD Order Service", "Orders, payments and analytics", lifespan)

app.include_router(health_router("order-service", {"postgres": ping_postgres}))
app.include_router(orders.router)
app.include_router(payments.router)
app.include_router(analytics.router)
app.include_router(internal.router)
