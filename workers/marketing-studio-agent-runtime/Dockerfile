FROM python:3.13.14-alpine3.24@sha256:399babc8b49529dabfd9c922f2b5eea81d611e4512e3ed250d75bd2e7683f4b0

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apk add --no-cache --upgrade \
    libcrypto3=3.5.8-r0 \
    libssl3=3.5.8-r0

COPY requirements.lock .
RUN pip install --no-cache-dir --require-hashes -r requirements.lock

COPY yux_agent_runtime ./yux_agent_runtime

RUN adduser -D -u 10001 yux-runtime
USER yux-runtime

EXPOSE 8080

CMD ["uvicorn", "yux_agent_runtime.api:app", "--host", "0.0.0.0", "--port", "8080"]
