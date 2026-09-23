from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool


class Base(DeclarativeBase):
    pass


def build_engine(database_url: str) -> Engine:
    if not database_url.startswith("sqlite:"):
        raise ValueError("This foundation supports SQLite only")
    options = (
        {"poolclass": StaticPool} if database_url in {"sqlite://", "sqlite:///:memory:"} else {}
    )
    engine = create_engine(database_url, connect_args={"check_same_thread": False}, **options)

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    return engine


def build_session_factory(engine: Engine):
    return sessionmaker(bind=engine, expire_on_commit=False)
