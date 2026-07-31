FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY yux_agent_runtime ./yux_agent_runtime

EXPOSE 8080

CMD ["uvicorn", "yux_agent_runtime.api:app", "--host", "0.0.0.0", "--port", "8080"]
