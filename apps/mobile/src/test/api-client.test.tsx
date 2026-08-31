import {
  apiRequestWithBaseUrls,
  buildApiBaseUrlCandidates,
  resolveExpoHostLocator,
  resolveApiBaseUrl
} from "../services/api/client";
import { authStore } from "../store/authStore";

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

  it("derives the api host from Expo hostUri when scriptURL is unavailable", () => {
    expect(
      buildApiBaseUrlCandidates(undefined, undefined, "10.18.108.6:8081")
    ).toEqual(["http://10.18.108.6:3001", "http://127.0.0.1:3001"]);
  });

  it("derives the api host from an Expo Go exp locator", () => {
    expect(
      buildApiBaseUrlCandidates(undefined, undefined, "exp://10.18.108.6:8081")
    ).toEqual(["http://10.18.108.6:3001", "http://127.0.0.1:3001"]);
  });

  it("prefers expo-constants hostUri when available", () => {
    expect(
      resolveExpoHostLocator({
        expoConfig: { hostUri: "10.18.108.6:8081" },
        experienceUrl: "exp://192.168.10.81:8081"
      })
    ).toBe("10.18.108.6:8081");
  });

  it("falls back to manifest debuggerHost when expoConfig is unavailable", () => {
    expect(
      buildApiBaseUrlCandidates(undefined, undefined, resolveExpoHostLocator({
        manifest: { debuggerHost: "10.18.108.6:8081" }
      }))
    ).toEqual(["http://10.18.108.6:3001", "http://127.0.0.1:3001"]);
  });

  it("retries against the next candidate when the first api host has a network failure", async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "ok" })
      });

    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      apiRequestWithBaseUrls<{ status: string }>(
        ["http://192.168.10.81:3001", "http://10.18.108.6:3001"],
        "/health"
      )
    ).resolves.toEqual({ status: "ok" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://192.168.10.81:3001/health",
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json"
        }
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://10.18.108.6:3001/health",
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json"
        }
      })
    );
  });

  it("includes the attempted api hosts in the final network error", async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValue(new Error("Network request failed"));

    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      apiRequestWithBaseUrls(
        ["http://192.168.10.81:3001", "http://10.18.108.6:3001"],
        "/tasks"
      )
    ).rejects.toThrow(
      "Network request failed (tried: http://192.168.10.81:3001, http://10.18.108.6:3001)"
    );
  });

  it("attaches bearer auth and retries once after refresh token rotation", async () => {
    authStore.setSession({
      accessToken: "expired-access",
      refreshToken: "refresh-1",
      userId: "user-1",
      email: "user@example.com",
      nickname: "User"
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: "expired" })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: "fresh-access",
          refreshToken: "refresh-2",
          user: {
            id: "user-1",
            email: "user@example.com",
            nickname: "User"
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ preferredTone: "balanced" })
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      apiRequestWithBaseUrls(["http://127.0.0.1:3001"], "/settings")
    ).resolves.toEqual({ preferredTone: "balanced" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:3001/settings",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer expired-access" })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://127.0.0.1:3001/settings",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer fresh-access" })
      })
    );
  });
});
