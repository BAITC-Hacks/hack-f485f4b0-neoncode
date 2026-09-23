from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings
from app.data_loader import read_dataset, seed_database
from app.db import Base, build_engine, build_session_factory
from app.routers import employees, hr


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        dataset = read_dataset(settings.data_dir)
        engine = build_engine(settings.database_url)
        try:
            Base.metadata.create_all(engine)
            session_factory = build_session_factory(engine)
            with session_factory.begin() as session:
                seed_database(session, dataset)
            app.state.engine = engine
            app.state.session_factory = session_factory
            yield
        finally:
            engine.dispose()

    application = FastAPI(
        title="Career Quest API",
        version="0.1.0",
        lifespan=lifespan,
        description=(
            "Backend foundation. Recommendation and HR summary responses are explicit stubs. "
            "Completion and import return 501 without writes. All API routes require "
            "X-Role and X-Employee-Id; these headers are trusted development identities."
        ),
    )
    application.state.settings = settings
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-Role", "X-Employee-Id"],
    )
    application.include_router(hr.router)
    application.include_router(employees.router)
    return application


app = create_app()
