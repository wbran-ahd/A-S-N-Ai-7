/**
 * Icon stylesheet loader (task 8).
 *
 * FontAwesome ships one large CSS file plus several webfonts. Linking it in
 * `<head>` made it render-blocking on a 3G phone: the ledger waited for a
 * stylesheet that only draws small glyphs. The link is now created here with
 * `media="print"` (which downloads without blocking) and flipped to `all` once
 * it has loaded.
 *
 * Deliberately a module and not an inline `<script>` in index.html: the
 * production CSP forbids inline script, and a same-origin module is allowed.
 * Loading it is idempotent and never throws.
 */
const ICON_STYLESHEET = "/fonts/fontawesome/all.min.css";
const LINK_ID = "sauti-icon-styles";

export function loadIconStyles(doc: Document | null = typeof document === "undefined" ? null : document): void {
  if (!doc || doc.getElementById(LINK_ID)) return;
  try {
    const link = doc.createElement("link");
    link.id = LINK_ID;
    link.rel = "stylesheet";
    link.href = ICON_STYLESHEET;
    /* Non-blocking: the browser fetches it, but painting does not wait. */
    link.media = "print";
    link.onload = () => {
      link.media = "all";
    };
    doc.head.appendChild(link);
  } catch {
    /* An icon-less UI is degraded, not broken. */
  }
}
