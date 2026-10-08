FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /srv

# Shared STEWARD package (config, JWT/RBAC, DB guards)
COPY common /srv/common
COPY order_service/requirements.txt /srv/requirements.txt
RUN pip install ./common -r requirements.txt

COPY order_service/app /srv/app

EXPOSE 8003
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8003"]
