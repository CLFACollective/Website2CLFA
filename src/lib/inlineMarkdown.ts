// Editor-entered text (src/data/*.json, edited in the CMS) is plain
// text, escaped before it reaches the page. The only formatting
// supported is **bold** and a line break where the editor pressed
// Enter — enough for the site's copy without letting raw HTML in.
const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export function inlineMarkdown(text: string): string {
  return escapeHtml(text.trim())
    .replace(/\*\*(.+?)\*\*/gs, "<strong>$1</strong>")
    .replace(/\r?\n/g, "<br />");
}

// *single asterisks* for the copper italic words, Enter for a line break
export function italicMarkdown(text: string): string {
  return escapeHtml(text.trim())
    .replace(/\*(.+?)\*/gs, "<em>$1</em>")
    // keep a space after the break, so the words don't run together
    // for screen readers and copy/paste
    .replace(/\s*\r?\n\s*/g, "<br /> ");
}
