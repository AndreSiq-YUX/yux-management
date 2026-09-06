FROM python:3.13.15-alpine3.24@sha256:7415fbc3c9e4979cc717d92377ab2bc7b2b4a2af1ac03cc52b5f3f88efedaf3a

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apk add --no-cache --upgrade \
    libcrypto3=3.5.8-r0 \
    libssl3=3.5.8-r0 \
    libuuid=2.42.3-r1

COPY requirements.lock .
RUN pip install --no-cache-dir --require-hashes -r requirements.lock

COPY yux_agent_runtime ./yux_agent_runtime

RUN adduser -D -u 10001 yux-runtime
USER yux-runtime

EXPOSE 8080

CMD ["uvicorn", "yux_agent_runtime.api:app", "--host", "0.0.0.0", "--port", "8080"]
