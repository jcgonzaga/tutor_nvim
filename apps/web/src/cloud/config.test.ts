import { describe, expect, it } from "vitest";
import { readCloudConfig } from "./config";

describe("cloud configuration", () => {
  it("is off without an API URL: the app stays purely local", () => {
    expect(readCloudConfig({})).toBeNull();
    expect(readCloudConfig({ VITE_NEON_AUTH_URL: "https://auth.example.com" })).toBeNull();
  });

  it("needs a way to sign in", () => {
    expect(readCloudConfig({ VITE_API_URL: "https://api.example.com" })).toBeNull();
  });

  it("is on with an API and Neon Auth", () => {
    expect(
      readCloudConfig({
        VITE_API_URL: "https://api.example.com/",
        VITE_NEON_AUTH_URL: "https://auth.example.com/neondb/auth/",
      }),
    ).toEqual({
      apiUrl: "https://api.example.com",
      authUrl: "https://auth.example.com/neondb/auth",
      fakeAuth: false,
    });
  });

  it("is on with fake auth for tests", () => {
    expect(
      readCloudConfig({ VITE_API_URL: "http://localhost:8788", VITE_AUTH_MODE: "fake" }),
    ).toMatchObject({
      fakeAuth: true,
    });
  });
});
