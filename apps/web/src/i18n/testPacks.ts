/**
 * The language packs the test runner holds from the start.
 *
 * In the app a pack outside the source language arrives as a chunk, so the screen reads the source
 * language for a moment first (T-902). A suite has no chunk to wait for and renders a component in
 * the same tick, so it is handed the packs it asks for up front: a test can then assert Spanish
 * interface text and Spanish content without a timer and without a network round trip.
 *
 * Everything here is dynamically imported, and the whole block is behind a build-time constant: in
 * the app it is removed, so this file and the packs behind it are not part of any chunk, and the
 * packs stay lazy. The top-level await is what makes them available before the first test renders.
 */
if (import.meta.env.MODE === "test") {
  const [{ registerCatalog }, { es }, { localizedContent, registerContent }, { esOverlay }] =
    await Promise.all([
      import("./catalogs"),
      import("./es"),
      import("../exercises"),
      import("./esContent"),
    ]);
  registerCatalog("es", es);
  registerContent("es", localizedContent("es", esOverlay));
}
