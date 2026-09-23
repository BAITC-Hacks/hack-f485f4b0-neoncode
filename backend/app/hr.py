from app.schemas import HRSummaryResponse, ImportRequest, ImportResponse


def summary_stub() -> HRSummaryResponse:
    return HRSummaryResponse(status="not_implemented")


def import_stub(request: ImportRequest) -> ImportResponse:
    return ImportResponse(
        status="not_implemented",
        employees_received=len(request.employees),
        history_received=len(request.history),
        employees_imported=0,
        history_imported=0,
    )
