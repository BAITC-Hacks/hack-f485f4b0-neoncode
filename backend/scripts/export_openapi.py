import json

from app.config import BACKEND_DIR
from app.main import app


def main() -> None:
    destination = BACKEND_DIR / "docs/openapi.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(app.openapi(), indent=2) + "\n", encoding="utf-8")
    print(destination)


if __name__ == "__main__":
    main()
