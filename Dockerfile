FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN addgroup --system atlantisx \
    && adduser --system --ingroup atlantisx --home /app atlantisx \
    && mkdir -p /app/.atlantisx \
    && chown -R atlantisx:atlantisx /app

COPY --chown=atlantisx:atlantisx server.py /app/server.py
COPY --chown=atlantisx:atlantisx config /app/config
COPY --chown=atlantisx:atlantisx web /app/web

USER atlantisx

EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD python -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:4173/api/health', timeout=3).read()" || exit 1

CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "4173"]
