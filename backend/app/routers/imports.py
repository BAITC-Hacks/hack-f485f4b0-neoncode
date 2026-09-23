import csv
import io
import json

from fastapi import HTTPException, Request
from pydantic import ValidationError
from starlette.datastructures import UploadFile

from app.schemas import EmployeesFile, HistoryFile, ImportRequest

MAX_FILE_BYTES = 10 * 1024 * 1024


def field_error(loc: list[str | int], message: str, kind: str = "value_error") -> HTTPException:
    return HTTPException(422, detail=[{"loc": ["body", *loc], "msg": message, "type": kind}])


def validation_error(exc: ValidationError) -> HTTPException:
    return HTTPException(
        422,
        detail=[
            {"loc": ["body", *error["loc"]], "msg": error["msg"], "type": error["type"]}
            for error in exc.errors()
        ],
    )


async def file_text(upload: UploadFile, field: str) -> str:
    raw = await upload.read(MAX_FILE_BYTES + 1)
    if len(raw) > MAX_FILE_BYTES:
        raise HTTPException(413, detail=f"{field} exceeds 10 MiB")
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise field_error([field], "File must use UTF-8 encoding") from exc


def json_document(content: str, field: str):
    try:
        return json.loads(content)
    except ValueError as exc:
        raise field_error([field], "Invalid JSON document", "json_invalid") from exc


def csv_history(content: str) -> list[dict]:
    reader = csv.DictReader(io.StringIO(content, newline=""), strict=True)
    required = {"employee_id", "event_id", "date", "status"}
    try:
        headers = reader.fieldnames or []
        if len(headers) != len(set(headers)):
            raise field_error(["history"], "CSV contains duplicate column names")
        if not required.issubset(headers):
            raise field_error(
                ["history"], f"Missing CSV columns: {', '.join(sorted(required - set(headers)))}"
            )
        records = []
        for index, row in enumerate(reader):
            if None in row or any(value is None for value in row.values()):
                raise field_error(
                    ["history", index], "CSV row has a different number of columns than its header"
                )
            records.append({key: value if value != "" else None for key, value in row.items()})
        return records
    except csv.Error as exc:
        raise field_error(["history"], f"Invalid CSV near line {reader.line_num}") from exc


async def parse_import(request: Request) -> ImportRequest:
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    try:
        if content_type == "application/json":
            try:
                payload = await request.json()
            except (ValueError, UnicodeDecodeError) as exc:
                raise field_error([], "Invalid JSON request body", "json_invalid") from exc
            return ImportRequest.model_validate(payload)
        if content_type != "multipart/form-data":
            raise HTTPException(415, detail="Use application/json or multipart/form-data")
        async with request.form(max_files=2, max_fields=0) as form:
            expected = {"employees_file", "history_file"}
            for field in expected:
                if len(form.getlist(field)) != 1 or not isinstance(form.get(field), UploadFile):
                    raise field_error([field], "Exactly one uploaded file is required", "missing")
            if set(form) != expected:
                raise field_error([], "Only employees_file and history_file are accepted")
            employees_doc = json_document(
                await file_text(form["employees_file"], "employees_file"), "employees_file"
            )
            if isinstance(employees_doc, list):
                employees_doc = {"employees": employees_doc}
            employees = EmployeesFile.model_validate(employees_doc)
            history_upload = form["history_file"]
            content = await file_text(history_upload, "history_file")
            if (history_upload.filename or "").lower().endswith(".csv"):
                history_doc = {"history": csv_history(content)}
            else:
                history_doc = json_document(content, "history_file")
                if isinstance(history_doc, list):
                    history_doc = {"history": history_doc}
            history = HistoryFile.model_validate(history_doc)
            for document, records in ((employees, employees.employees), (history, history.history)):
                if document.meta.synthetic:
                    for record in records:
                        record.synthetic = True
            return ImportRequest(employees=employees.employees, history=history.history)
    except ValidationError as exc:
        raise validation_error(exc) from exc


def import_request_body() -> dict:
    # Inline Pydantic definitions because this dual-format body is parsed explicitly.
    schema = ImportRequest.model_json_schema()
    definitions = schema.pop("$defs", {})

    def inline(value):
        if isinstance(value, dict):
            if "$ref" in value:
                return inline(definitions[value["$ref"].rsplit("/", 1)[1]])
            return {key: inline(item) for key, item in value.items()}
        if isinstance(value, list):
            return [inline(item) for item in value]
        return value

    return {
        "required": True,
        "content": {
            "application/json": {"schema": inline(schema)},
            "multipart/form-data": {
                "schema": {
                    "type": "object",
                    "required": ["employees_file", "history_file"],
                    "properties": {
                        "employees_file": {
                            "type": "string",
                            "format": "binary",
                            "description": "employees.json: dataset envelope or Employee array",
                        },
                        "history_file": {
                            "type": "string",
                            "format": "binary",
                            "description": "activity_history.csv or JSON history envelope/array",
                        },
                    },
                }
            },
        },
    }
