import { loadContent } from "@tutor-nvim/exercise-schema";
import { readContentInput } from "../../scripts/content-fs";

/**
 * Device preferences the existing journeys assume: English text (the suites assert it) and every
 * skill's theory already seen (so a session starts on its first exercise, not on a lesson card).
 * The language and teaching suite starts from a clean browser instead.
 */
const slugs = loadContent(readContentInput()).skills.map((skill) => skill.slug);

export const ENGLISH_PREFS = JSON.stringify({
  sound: false,
  analytics: false,
  installId: null,
  language: "en",
  seenLessons: slugs,
});

export function seededStorage(origin: string) {
  return {
    cookies: [],
    origins: [{ origin, localStorage: [{ name: "tutor-nvim:prefs", value: ENGLISH_PREFS }] }],
  };
}
