import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient, responseError } from "../../src/api/client";

afterEach(() => vi.unstubAllGlobals());

describe("API client", () => {
  it("uses the configured base, encodes IDs and owns identity headers", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ employee_id: "E/1" }));
    vi.stubGlobal("fetch", fetch);
    const client = createApiClient(
      { role: "employee", employeeId: "E/1" },
      "https://api.example/api/",
    );
    await client.employee("E/1");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("https://api.example/api/employees/E%2F1");
    expect(options.headers.get("X-Role")).toBe("employee");
    expect(options.headers.get("X-Employee-Id")).toBe("E/1");
    expect(options.headers.has("Content-Type")).toBe(false);
  });

  it("sends all six operations with contract paths and exact completion keys", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(Response.json({})));
    vi.stubGlobal("fetch", fetch);
    const client = createApiClient({ role: "hr", employeeId: "HR" }, "/api");
    await client.employee("E1");
    await client.recommendations("E1");
    await client.complete("E1", { event_id: "EV1", completion_id: "stable" });
    await client.employees();
    await client.summary();
    await client.import({ employees: [], history: [] });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/employees/E1",
      "/api/employees/E1/recommendations",
      "/api/employees/E1/complete",
      "/api/employees",
      "/api/hr/summary",
      "/api/import",
    ]);
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({
      event_id: "EV1",
      completion_id: "stable",
    });
    expect(fetch.mock.calls[5][1].method).toBe("POST");
    expect(fetch.mock.calls[5][1].headers.get("Content-Type")).toBe(
      "application/json",
    );
  });

  it("uploads both files without overriding the multipart boundary", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({}));
    vi.stubGlobal("fetch", fetch);
    const client = createApiClient({ role: "hr", employeeId: "HR" }, "/api");
    await client.import({
      employees_file: new File(["{}"], "employees.json"),
      history_file: new File(
        ["employee_id,event_id,date,status"],
        "activity_history.csv",
      ),
    });
    const [, options] = fetch.mock.calls[0];
    expect(options.body).toBeInstanceOf(FormData);
    expect([...options.body.keys()]).toEqual([
      "employees_file",
      "history_file",
    ]);
    expect(options.headers.has("Content-Type")).toBe(false);
  });

  it.each([401, 403, 422, 500])("maps %s to a readable error", (status) => {
    const error = responseError(status, {
      detail: "Internal implementation detail",
    });
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(status);
    expect(error.message).toMatch(/[А-Яа-я]/);
    expect(error.message).not.toContain("Internal implementation detail");
  });

  it("keeps nested field locations for FastAPI and import validation", () => {
    const error = responseError(422, {
      detail: [
        {
          loc: ["body", "employees", 2, "skills", "SK_PYTHON"],
          msg: "Input should be less than or equal to 5",
          type: "less_than_equal",
        },
        { loc: ["body", "history", 0, "event_id"], msg: "Field required" },
      ],
    });
    expect(error.fields).toEqual([
      {
        path: "employees.2.skills.SK_PYTHON",
        message: "Input should be less than or equal to 5",
      },
      { path: "history.0.event_id", message: "Обязательное поле" },
    ]);
  });

  it("handles non-JSON server errors without exposing HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("<html>Internal</html>", { status: 500 }),
        ),
    );
    await expect(
      createApiClient({ role: "hr", employeeId: "HR" }, "/api").summary(),
    ).rejects.toMatchObject({
      status: 500,
      message: expect.stringContaining("Сервер"),
    });
  });

  it("reports network errors and propagates explicit query cancellation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    const client = createApiClient({ role: "hr", employeeId: "HR" }, "/api");
    await expect(client.summary()).rejects.toMatchObject({ status: 0 });
    const controller = new AbortController();
    controller.abort();
    await expect(client.summary(controller.signal)).rejects.toBeInstanceOf(
      TypeError,
    );
  });
});
