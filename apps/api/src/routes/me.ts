import type { FastifyInstance } from "fastify";
import { settingsSchema } from "@tutor-nvim/shared";
import { callerOf, type RouteContext } from "../app";
import { parse } from "../errors";
import { getMe, updateSettings } from "../services/users";

export function registerMeRoutes(api: FastifyInstance, { db, bundle }: RouteContext): void {
  api.get("/api/me", async (request) => getMe(db, callerOf(request)));

  api.put("/api/me/settings", async (request) => {
    const caller = callerOf(request);
    await updateSettings(db, bundle, caller.id, parse(settingsSchema, request.body));
    return getMe(db, caller);
  });
}
