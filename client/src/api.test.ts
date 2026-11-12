import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError, api, errorText } from "./api.js";

function respondWith(response: Response) {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(response));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api", () => {
  it("returns the parsed body of a successful response", async () => {
    respondWith(Response.json({ id: 7 }));
    expect(await api("GET", "/api/cards/7")).toEqual({ id: 7 });
  });

  it("returns undefined for 204", async () => {
    respondWith(new Response(null, { status: 204 }));
    expect(await api("DELETE", "/api/cards/7")).toBeUndefined();
  });

  it("sends a JSON body with its content type", async () => {
    const fetchStub = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}));
    vi.stubGlobal("fetch", fetchStub);
    await api("POST", "/api/shifts", { date: "2026-11-12" });
    expect(fetchStub).toHaveBeenCalledWith("/api/shifts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: "2026-11-12" }),
    });
  });

  it("throws an ApiError carrying the status and JSON body of a failed response", async () => {
    respondWith(Response.json({ error: "Outdated", card: { id: 7 } }, { status: 409 }));
    const failure = await api("PATCH", "/api/cards/7", {}).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ status: 409, message: "Outdated", body: { card: { id: 7 } } });
  });

  it("throws an ApiError, not a SyntaxError, when a failed response is not JSON", async () => {
    respondWith(new Response("<html>Bad Gateway</html>", { status: 502 }));
    const failure = await api("GET", "/api/shifts").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ status: 502, message: "Request failed (502)" });
  });

  it("throws an ApiError when a failed response is JSON null", async () => {
    respondWith(Response.json(null, { status: 500 }));
    const failure = await api("GET", "/api/shifts").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ status: 500 });
  });

  it("throws a NetworkError when the request cannot be made", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(api("GET", "/api/shifts")).rejects.toBeInstanceOf(NetworkError);
  });
});

describe("errorText", () => {
  it("uses the message of an error", () => {
    expect(errorText(new Error("That card number is already in use"), "Could not save")).toBe(
      "That card number is already in use",
    );
  });

  it("uses the fallback for anything that is not an error", () => {
    expect(errorText("boom", "Could not save")).toBe("Could not save");
    expect(errorText(undefined, "Could not save")).toBe("Could not save");
  });
});
