# ── Etapa 1: compilar sfizz_render (motor SFZ) desde fuente ──────
# sfizz no está en apt; el tarball de release trae las dependencias vendorizadas.
# Compilamos solo el CLI sfizz_render (sin JACK/LV2/VST ni libsndfile).
FROM python:3.12-slim AS sfizz-builder
ARG SFIZZ_VERSION=1.2.3
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates cmake g++ make \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build
RUN curl -fsSL -o sfizz.tar.gz "https://github.com/sfztools/sfizz/releases/download/${SFIZZ_VERSION}/sfizz-${SFIZZ_VERSION}.tar.gz" \
    && tar xzf sfizz.tar.gz
WORKDIR /build/sfizz-${SFIZZ_VERSION}
RUN cmake -B build -DCMAKE_BUILD_TYPE=Release \
        -DSFIZZ_JACK=OFF -DSFIZZ_LV2=OFF -DSFIZZ_VST=OFF \
        -DSFIZZ_RENDER=ON -DSFIZZ_USE_SNDFILE=OFF \
        -DSFIZZ_TESTS=OFF -DSFIZZ_DEMOS=OFF -DSFIZZ_DEVTOOLS=OFF \
    && cmake --build build --target sfizz_render -j"$(nproc)" \
    && cp build/library/bin/sfizz_render /usr/local/bin/sfizz_render

# ── Etapa 2: imagen final ────────────────────────────────────────
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Herramientas de render de audio: FluidSynth (SF2/SF3 → WAV), ffmpeg (mezcla → MP3)
# y sfizz_render (SFZ → WAV, copiado de la etapa de compilación).
RUN apt-get update \
    && apt-get install -y --no-install-recommends fluidsynth ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY --from=sfizz-builder /usr/local/bin/sfizz_render /usr/local/bin/sfizz_render

# Instala las dependencias en una capa cacheable usando un paquete vacío como
# stub (setuptools necesita que 'app' exista para generar los metadatos).
COPY pyproject.toml ./
RUN mkdir -p app/routers app/storage app/db app/services && touch app/__init__.py app/routers/__init__.py app/storage/__init__.py app/db/__init__.py app/services/__init__.py && pip install --upgrade pip && pip install . && rm -rf app

# Copia el código real y reinstala solo el paquete (rápido, sin tocar deps).
COPY app ./app
RUN pip install --no-deps .

RUN mkdir -p /data/files

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
