FROM python:3.12.14-slim@sha256:78387bc3881b8273120a12ebe6c1ab22b018ccc2c9adf565ae1ac9b536e184ea

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.lock .
RUN pip install --no-cache-dir --require-hashes -r requirements.lock

COPY yux_agent_runtime ./yux_agent_runtime

RUN useradd --create-home --uid 10001 yux-runtime
USER yux-runtime

EXPOSE 8080

CMD ["uvicorn", "yux_agent_runtime.api:app", "--host", "0.0.0.0", "--port", "8080"]
