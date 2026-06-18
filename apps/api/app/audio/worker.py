"""Worker de la cola de audio.

Hace polling de jobs `queued`, los toma de forma atómica (claim_next) y los ejecuta
con el runner. Pensado para correr como proceso aparte (servicio `audio-worker` en
docker-compose.dev), compartiendo BD y almacenamiento con la API.

    python -m app.audio.worker

Sin broker (suficiente para dev). La interfaz está preparada para migrar a Redis/RQ
si hiciera falta más concurrencia (ver docs/ROADMAP-DEV.md).
"""

from __future__ import annotations

import logging
import time

from ..db import get_repositories
from .runner import run_job

logger = logging.getLogger(__name__)

POLL_SECONDS = 2.0


def run_forever() -> None:
    repos = get_repositories()
    logger.info("audio-worker iniciado; esperando jobs…")
    while True:
        job = repos.jobs.claim_next()
        if job is None:
            time.sleep(POLL_SECONDS)
            continue
        logger.info("Ejecutando job %s (kind=%s engine=%s)", job.id, job.kind, job.engine)
        try:
            run_job(job, repos)
        except Exception:  # noqa: BLE001 — el runner ya marca error; nunca matamos el loop
            logger.exception("Error no controlado ejecutando job %s", job.id)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    run_forever()


if __name__ == "__main__":
    main()
