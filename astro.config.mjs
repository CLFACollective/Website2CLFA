import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  site: "https://clfacollective.com",
  compressHTML: true,
  // The dev toolbar docks at the bottom of the screen, same spot
  // GSDevTools (src/scripts/momentumGallery.ts) uses for its own
  // scrub UI — the two stack and fight for space. Off by request; has
  // no effect on the production build either way (dev-only).
  devToolbar: { enabled: false },
});
