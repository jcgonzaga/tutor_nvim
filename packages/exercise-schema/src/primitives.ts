import { z } from "zod";

/** Stable public identifier: `vim-ci-quotes-001`. */
export const idSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be kebab-case (a-z, 0-9, -)");

/** Stable dotted identifier: `vim.ci-quotes.basic-001`. */
export const slugSchema = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/,
    "must be dot-separated lowercase segments, e.g. vim.operator.change",
  );

/** Free-form lowercase tag: `context:javascript`, `quotes`. */
export const tagSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:[.:_-][a-z0-9]+)*$/, "must be lowercase letters, digits and . : _ -");

export const difficultySchema = z.number().int().min(1).max(5);

/** A tool layer id, the same rule `content/keymaps/<id>.yaml` follows (`keymap-layers.md` S2). */
export const layerIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "must be a keymap layer id (lowercase letters, digits, -)");

/**
 * What the exercise runs in, plus the tool layers it needs (S4). `layers` is empty for the content
 * that needs no particular tool, and an exercise stays available only while every one is enabled.
 */
export const environmentSchema = z
  .strictObject({
    type: z.literal("simulator"),
    profile: z.string().min(1),
    layers: z
      .array(layerIdSchema)
      .max(8)
      .default([])
      .refine((layers) => new Set(layers).size === layers.length, "repeats a layer"),
  })
  .default({ type: "simulator", profile: "vim-basic-v1", layers: [] });
export type ExerciseEnvironment = z.output<typeof environmentSchema>;

/** One screen of theory (PRD §8, Discover): a single idea, short enough to read in seconds. */
export const lessonCardSchema = z.strictObject({
  title: z.string().min(1).max(70),
  body: z.string().min(1).max(320),
  /** A key sequence shown as keycaps (display only, never evaluated), e.g. `ci"`. */
  keys: z.string().min(1).max(40).optional(),
});
export type LessonCard = z.output<typeof lessonCardSchema>;

/** Why the best solution works. Shown after the attempt, so it stays short. */
export const explanationSchema = z.string().min(1).max(500);
