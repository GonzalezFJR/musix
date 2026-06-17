from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db
from .routers import auth, folders, instruments, projects, render


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Musix API", version="0.1.0", lifespan=lifespan)

# En producción se sirve todo tras Caddy (mismo origen), pero permitimos
# el dev server de Vite durante el desarrollo.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(folders.router)
app.include_router(projects.router)
app.include_router(render.router)
app.include_router(instruments.router)


@app.get("/api/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok"}
