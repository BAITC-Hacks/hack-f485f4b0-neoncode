from app.schemas import CompleteRequest, CompletionResponse, Employee


def completion_stub(employee: Employee, request: CompleteRequest) -> CompletionResponse:
    return CompletionResponse(
        employee_id=employee.employee_id,
        event_id=request.event_id,
        completion_id=request.completion_id,
        status="not_implemented",
        skills=employee.skills,
    )
