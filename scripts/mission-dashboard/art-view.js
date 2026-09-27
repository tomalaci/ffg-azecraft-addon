/**
 * Card art framing: how a character's picture fills its fixed box. Pure maths, no DOM.
 *
 * A view is {x, y, z}: x/y are the pan position in percent (0 = left/top edge of the image,
 * 100 = right/bottom edge) and z is the zoom relative to "cover" (1 = the image just fills the box).
 * CSS applies it by sizing the image element to z × the box with object-fit: cover and offsetting
 * it by the same fraction as object-position, which together place the image exactly at
 * x% of its overflow, whatever the box size.
 */

export const DEFAULT_ART_VIEW = Object.freeze({ x: 50, y: 0, z: 1.5 });
export const MIN_ART_ZOOM = 1;
export const MAX_ART_ZOOM = 4;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = value => Math.round(value * 100) / 100;

/** A saved view, validated; anything missing or invalid falls back to the default. */
export function normalizeArtView(view) {
    const number = (value, fallback) => (Number.isFinite(value) ? value : fallback);
    return {
        x: clamp(number(view?.x, DEFAULT_ART_VIEW.x), 0, 100),
        y: clamp(number(view?.y, DEFAULT_ART_VIEW.y), 0, 100),
        z: clamp(number(view?.z, DEFAULT_ART_VIEW.z), MIN_ART_ZOOM, MAX_ART_ZOOM)
    };
}

/**
 * How far the zoomed image overflows its box, in pixels, on each axis.
 * @param {{width: number, height: number}} box
 * @param {{width: number, height: number}} natural  The image's natural size
 */
export function artOverflow(box, natural, zoom) {
    if (!box.width || !box.height || !natural.width || !natural.height) return { x: 0, y: 0 };
    const cover = Math.max(box.width / natural.width, box.height / natural.height);
    return {
        x: Math.max(0, natural.width * cover * zoom - box.width),
        y: Math.max(0, natural.height * cover * zoom - box.height)
    };
}

/** Pan by a pointer movement of (dx, dy) pixels: the image follows the pointer 1:1. */
export function panArtView(view, dx, dy, overflow) {
    const v = normalizeArtView(view);
    return {
        ...v,
        x: overflow.x ? round(clamp(v.x - (dx / overflow.x) * 100, 0, 100)) : v.x,
        y: overflow.y ? round(clamp(v.y - (dy / overflow.y) * 100, 0, 100)) : v.y
    };
}

/** Zoom by a step, keeping the pan position; clamped to the allowed range. */
export function zoomArtView(view, step) {
    const v = normalizeArtView(view);
    return { ...v, z: round(clamp(v.z + step, MIN_ART_ZOOM, MAX_ART_ZOOM)) };
}

/** CSS custom properties for a view (see the .azd-card-art img rules). */
export function artViewStyle(view) {
    const v = normalizeArtView(view);
    return `--azd-art-x: ${v.x}; --azd-art-y: ${v.y}; --azd-art-z: ${v.z};`;
}
