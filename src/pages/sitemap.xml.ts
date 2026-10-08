// /sitemap.xml — every page in src/pages, picked up automatically, so a
// new page is listed for search engines without editing this file.
import type { APIRoute } from "astro";

const pages = Object.keys(import.meta.glob("./**/*.astro"))
  .map((f) => f.replace(/^\.\//, "/").replace(/\.astro$/, "").replace(/(^|\/)index$/, "$1"))
  .filter((p) => !/\[|\/404$|\/500$/.test(p))
  .sort();

export const GET: APIRoute = ({ site }) => {
  const urls = pages.map((p) => `  <url><loc>${new URL(p, site).href}</loc></url>`).join("\n");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { "Content-Type": "application/xml" } },
  );
};
