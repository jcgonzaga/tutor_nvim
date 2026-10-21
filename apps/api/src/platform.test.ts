import { generateKeyPair, exportJWK, SignJWT } from "jose";
import type { webcrypto } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFakeVerifier, fakeToken } from "./auth/fake";
import { createNeonVerifier } from "./auth/neon";
import { loadConfig } from "./config";
import { createTestApi } from "./test-util";

describe("configuration", () => {
  it("accepts a development setup with fake auth and no database", () => {
    expect(loadConfig({ AUTH_MODE: "fake" })).toMatchObject({ AUTH_MODE: "fake", PORT: 8787 });
  });

  it("requires the Neon Auth URL when verifying real tokens", () => {
    expect(() => loadConfig({ AUTH_MODE: "neon" })).toThrow(/NEON_AUTH_BASE_URL/);
  });

  it("applies migrations on start unless told otherwise (serverless runs them once per release)", () => {
    expect(loadConfig({ AUTH_MODE: "fake" }).MIGRATE_ON_START).toBe(true);
    expect(loadConfig({ AUTH_MODE: "fake", MIGRATE_ON_START: "false" }).MIGRATE_ON_START).toBe(
      false,
    );
    expect(() => loadConfig({ AUTH_MODE: "fake", MIGRATE_ON_START: "no" })).toThrow(
      /MIGRATE_ON_START/,
    );
  });

  it("makes it impossible to ship fake auth or an in-memory database to production", () => {
    expect(() =>
      loadConfig({ NODE_ENV: "production", AUTH_MODE: "fake", DATABASE_URL: "postgres://x" }),
    ).toThrow(/fake auth/);
    expect(() =>
      loadConfig({ NODE_ENV: "production", NEON_AUTH_BASE_URL: "https://auth.example.com" }),
    ).toThrow(/DATABASE_URL/);
    expect(
      loadConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://x",
        NEON_AUTH_BASE_URL: "https://auth.example.com",
      }).AUTH_MODE,
    ).toBe("neon");
  });
});

describe("fake verifier", () => {
  it("only accepts its own token format", async () => {
    const verifier = createFakeVerifier();
    expect(await verifier.verify(fakeToken("u1", "a@b.c"))).toEqual({
      authUserId: "u1",
      email: "a@b.c",
    });
    expect(await verifier.verify("u1")).toBeNull();
    expect(await verifier.verify("test:")).toBeNull();
  });
});

describe("Neon Auth verifier (T-602)", () => {
  let server: Server;
  let baseUrl: string;
  let privateKey: webcrypto.CryptoKey;
  let strangerKey: webcrypto.CryptoKey;

  beforeAll(async () => {
    const pair = await generateKeyPair("EdDSA", { extractable: true });
    const stranger = await generateKeyPair("EdDSA");
    privateKey = pair.privateKey;
    strangerKey = stranger.privateKey;
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "EdDSA", use: "sig" };
    server = createServer((request, response) => {
      if (request.url === "/.well-known/jwks.json") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ keys: [jwk] }));
      } else {
        response.statusCode = 404;
        response.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const sign = (
    key: webcrypto.CryptoKey,
    claims: { sub?: string; issuer?: string; expiresIn?: string } = {},
  ) =>
    new SignJWT({ email: "learner@example.com" })
      .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
      .setSubject(claims.sub ?? "user-1")
      .setIssuer(claims.issuer ?? baseUrl)
      .setIssuedAt()
      .setExpirationTime(claims.expiresIn ?? "10m")
      .sign(key);

  it("accepts a token signed by the instance's key", async () => {
    const verifier = createNeonVerifier({ baseUrl });
    expect(await verifier.verify(await sign(privateKey))).toEqual({
      authUserId: "user-1",
      email: "learner@example.com",
    });
  });

  it("rejects a forged signature, a wrong issuer, an expired token and garbage", async () => {
    const verifier = createNeonVerifier({ baseUrl });
    expect(await verifier.verify(await sign(strangerKey))).toBeNull();
    expect(
      await verifier.verify(await sign(privateKey, { issuer: "https://evil.example.com" })),
    ).toBeNull();
    expect(await verifier.verify(await sign(privateKey, { expiresIn: "-1m" }))).toBeNull();
    expect(await verifier.verify("not.a.jwt")).toBeNull();
  });

  it("rejects a token with no subject", async () => {
    const verifier = createNeonVerifier({ baseUrl });
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
      .setIssuer(baseUrl)
      .setExpirationTime("10m")
      .sign(privateKey);
    expect(await verifier.verify(token)).toBeNull();
  });

  it("is a drop-in for the API: a real signed token reaches /api/me", async () => {
    const api = await createTestApi({ verifier: createNeonVerifier({ baseUrl }) });
    try {
      const token = await sign(privateKey, { sub: "neon-user-9" });
      const response = await api.app.inject({
        method: "GET",
        url: "/api/me",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toMatchObject({
        authUserId: "neon-user-9",
        email: "learner@example.com",
      });
    } finally {
      await api.close();
    }
  });
});

describe("rate limiting and CORS", () => {
  it("answers 429 once a client exceeds the limit", async () => {
    const api = await createTestApi({ rateLimitMax: 3 });
    try {
      const statuses = [];
      for (let i = 0; i < 5; i++) statuses.push((await api.request("GET", "/api/health")).status);
      expect(statuses).toEqual([200, 200, 200, 429, 429]);
    } finally {
      await api.close();
    }
  });

  it("only allows the configured web origins", async () => {
    const api = await createTestApi({ corsOrigins: ["https://app.example.com"] });
    try {
      const ask = (origin: string) =>
        api.app.inject({ method: "GET", url: "/api/health", headers: { origin } });
      expect((await ask("https://app.example.com")).headers["access-control-allow-origin"]).toBe(
        "https://app.example.com",
      );
      expect(
        (await ask("https://evil.example.com")).headers["access-control-allow-origin"],
      ).toBeUndefined();
    } finally {
      await api.close();
    }
  });
});
