// Site navigation (src/data/navigation.json, edited in the CMS) — one
// list feeds both the mega menu and the footer, so a new page only has
// to be added once.
import nav from "../data/navigation.json";

export interface NavLink {
  href: string;
  menuLabel: string;
  footerLabel?: string;
  inMenu?: boolean;
  inFooter?: boolean;
}

const links = nav.links as NavLink[];

export const menuLinks = links.filter((l) => l.inMenu !== false);
export const footerLinks = links
  .filter((l) => l.inFooter !== false)
  .map((l) => ({ ...l, footerLabel: l.footerLabel?.trim() || l.menuLabel }));
export const linkedinUrl: string = nav.linkedin;

/** "/about/" and "/about" are the same page */
const normalize = (path: string) => (path.replace(/\/+$/, "") || "/");
export const isCurrent = (href: string, pathname: string) => normalize(href) === normalize(pathname);
