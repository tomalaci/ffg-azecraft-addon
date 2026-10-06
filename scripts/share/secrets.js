/**
 * Journal secrets: text pages can hold GM-only sections (`<section class="secret">`), which stay
 * hidden until revealed (class "revealed"). Shared text goes to players and into the archive they can
 * read, so unrevealed secrets are removed first.
 */

const SECRET = "section.secret:not(.revealed)";

function parse(html) {
    return new DOMParser().parseFromString(String(html ?? ""), "text/html");
}

/** HTML without its unrevealed secret sections (browser only: uses DOMParser). */
export function stripSecrets(html) {
    const doc = parse(html);
    const secrets = doc.body.querySelectorAll(SECRET);
    if (!secrets.length) return String(html ?? "");
    for (const section of secrets) section.remove();
    return doc.body.innerHTML;
}

/** Whether the HTML has unrevealed secret sections. */
export function hasSecrets(html) {
    return Boolean(parse(html).body.querySelector(SECRET));
}
