import { describe, expect, it } from "vitest";
import { AuthError } from "./auth";
import { createBetterAuthClient } from "./neonAuth";

interface Call {
  url: string;
  method: string;
  body: unknown;
}

function fakeServer(routes: Record<string, () => Response>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname.replace(/^\/neondb\/auth/, "");
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const route = routes[`${init?.method ?? "GET"} ${path}`];
    return route ? route() : new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

const BASE = "https://ep-x.neonauth.example.com/neondb/auth/";

describe("Better Auth client for Neon Auth", () => {
  it("signs in with email and password and returns the user", async () => {
    const { calls, fetchImpl } = fakeServer({
      "POST /sign-in/email": () => json({ user: { id: "u1", email: "a@b.c" }, token: "ignored" }),
    });
    const user = await createBetterAuthClient(BASE, fetchImpl).signIn("a@b.c", "secret");

    expect(user).toEqual({ id: "u1", email: "a@b.c" });
    expect(calls[0]).toMatchObject({
      method: "POST",
      body: { email: "a@b.c", password: "secret" },
    });
    expect(calls[0]?.url).toBe("https://ep-x.neonauth.example.com/neondb/auth/sign-in/email");
  });

  it("signs up with a name", async () => {
    const { calls, fetchImpl } = fakeServer({
      "POST /sign-up/email": () => json({ user: { id: "u2", email: "n@b.c" } }),
    });
    await createBetterAuthClient(BASE, fetchImpl).signUp("n@b.c", "secret", "Nia");
    expect(calls[0]?.body).toEqual({ email: "n@b.c", password: "secret", name: "Nia" });
  });

  it("turns a rejected sign-in into an error the learner can read", async () => {
    const { fetchImpl } = fakeServer({
      "POST /sign-in/email": () => json({ message: "Invalid email or password" }, { status: 401 }),
    });
    await expect(createBetterAuthClient(BASE, fetchImpl).signIn("a@b.c", "bad")).rejects.toThrow(
      new AuthError("Invalid email or password"),
    );
  });

  it("reads the current user from the session, and null when there is none", async () => {
    const signedIn = fakeServer({
      "GET /get-session": () => json({ user: { id: "u1", email: "a@b.c" } }),
    });
    expect(await createBetterAuthClient(BASE, signedIn.fetchImpl).currentUser()).toEqual({
      id: "u1",
      email: "a@b.c",
    });

    const signedOut = fakeServer({ "GET /get-session": () => json(null) });
    expect(await createBetterAuthClient(BASE, signedOut.fetchImpl).currentUser()).toBeNull();
    const failing = fakeServer({});
    expect(await createBetterAuthClient(BASE, failing.fetchImpl).currentUser()).toBeNull();
  });

  it("gets the API token from /token, falling back to the session's set-auth-jwt header", async () => {
    const direct = fakeServer({ "GET /token": () => json({ token: "jwt-1" }) });
    expect(await createBetterAuthClient(BASE, direct.fetchImpl).token()).toBe("jwt-1");

    const viaHeader = fakeServer({
      "GET /get-session": () => json({ user: {} }, { headers: { "set-auth-jwt": "jwt-2" } }),
    });
    expect(await createBetterAuthClient(BASE, viaHeader.fetchImpl).token()).toBe("jwt-2");

    const none = fakeServer({});
    expect(await createBetterAuthClient(BASE, none.fetchImpl).token()).toBeNull();
  });

  it("signs out", async () => {
    const { calls, fetchImpl } = fakeServer({ "POST /sign-out": () => json({ success: true }) });
    await createBetterAuthClient(BASE, fetchImpl).signOut();
    expect(calls[0]).toMatchObject({ method: "POST" });
  });
});
