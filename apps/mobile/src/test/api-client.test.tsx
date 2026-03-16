import { resolveApiBaseUrl } from "../services/api/client";

describe("resolveApiBaseUrl", () => {
  it("prefers the explicit Expo public api base url", () => {
    expect(
      resolveApiBaseUrl(
        "http://192.168.10.81:3001",
        "http://192.168.10.81:8081/index.bundle?platform=android"
      )
    ).toBe("http://192.168.10.81:3001");
  });

  it("derives the api host from the metro bundle host for physical devices", () => {
    expect(
      resolveApiBaseUrl(
        undefined,
        "http://192.168.10.81:8081/index.bundle?platform=android"
      )
    ).toBe("http://192.168.10.81:3001");
  });

  it("falls back to localhost when no bundle host is available", () => {
    expect(resolveApiBaseUrl(undefined, undefined)).toBe("http://127.0.0.1:3001");
  });
});
