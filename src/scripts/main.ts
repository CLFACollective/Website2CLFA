import { useGsap } from "./gsapSetup";
import { setupReveals } from "./reveals";
import { setupWindowParallax } from "./windowParallax";
import { setupShimmer } from "./shimmer";

/**
 * Page-wide setup. Section-specific behaviour (nav, hero, day one,
 * momentum, the cards fan, the marquees) is wired up from within each
 * section's own <script> tag, right next to the markup it drives —
 * this only covers the effects that read the whole page.
 */
useGsap();
setupShimmer();
setupReveals();
setupWindowParallax();
