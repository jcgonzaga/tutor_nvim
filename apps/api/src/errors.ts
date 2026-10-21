import type { ZodType } from "zod";

/** An error with an HTTP status, turned into a JSON response by the app's error handler. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Validates external input with a Zod schema; a failure is a 400 listing every problem. */
export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join(".") || "(body)"}: ${issue.message}`,
    );
    throw new HttpError(400, "invalid_request", issues.join("; "));
  }
  return result.data;
}
