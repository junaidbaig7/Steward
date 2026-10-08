FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /srv

# Shared STEWARD package (config, JWT/RBAC, DB guards)
COPY common /srv/common
COPY gateway/requirements.txt /srv/requirements.txt
RUN pip install ./common -r requirements.txt

COPY gateway/app /srv/app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
