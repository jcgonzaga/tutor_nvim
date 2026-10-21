import { describe, expect, it } from "vitest";
import { deterministicUuid, sessionIdOf } from "./submission";
import { uuid } from "@tutor-nvim/shared";

describe("deterministicUuid", () => {
  it("is stable and a valid UUID", () => {
    const id = deterministicUuid("session|1|2");
    expect(id).toBe(deterministicUuid("session|1|2"));
    expect(uuid.safeParse(id).success).toBe(true);
  });

  it("gives different ids to different inputs", () => {
    const ids = new Set(
      Array.from({ length: 2000 }, (_, i) => deterministicUuid(`session|1|${i}`)),
    );
    expect(ids.size).toBe(2000);
  });
});

describe("sessionIdOf", () => {
  it("is the same for a session's attempts and its summary, and differs between sessions", () => {
    const profile = { createdAt: 1_700_000_000_000 };
    const run = { startedAt: 1_700_000_100_000 } as never;
    expect(sessionIdOf(profile, run)).toBe(sessionIdOf(profile, run));
    expect(sessionIdOf(profile, { startedAt: 1_700_000_200_000 } as never)).not.toBe(
      sessionIdOf(profile, run),
    );
  });
});
