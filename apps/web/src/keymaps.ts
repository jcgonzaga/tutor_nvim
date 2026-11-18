import { parseKeymapLayers, type KeymapLayer } from "@tutor-nvim/exercise-schema";

/**
 * The keymap catalogs are content, not code (keymap-layers.md S2, S7): adding a seventh tool means
 * adding a YAML file under `content/keymaps`, not a new engine or a new branch in the rail. They are
 * loaded the way exercises are, so an invalid catalog fails loudly at startup instead of reaching
 * the practice screen half-read.
 *
 * Built once at module load: the rail only reads the parsed layers.
 */
const read = (sources: Record<string, string>) =>
  Object.entries(sources)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, text]) => ({ path, text }));

export const keymapLayers: readonly KeymapLayer[] = parseKeymapLayers(
  read(
    import.meta.glob<string>("../../../content/keymaps/**/*.yaml", {
      query: "?raw",
      import: "default",
      eager: true,
    }),
  ),
);
