FROM postgis/postgis:16-3.5

RUN sed -i '/bullseye-security/d' /etc/apt/sources.list \
    && find /etc/apt/sources.list.d -type f -exec sed -i '/bullseye-security/d' {} + \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        postgresql-16-pgvector \
    && rm -rf /var/lib/apt/lists/*
