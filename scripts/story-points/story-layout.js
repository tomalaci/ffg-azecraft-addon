/**
 * Where the story point bar goes (pure, unit-tested): the bottom-left corner, under the dashboard's
 * squad rail (from its left edge to where the mission tabs begin), or, without the dashboard, next
 * to the scene controls up to the hotbar. The bar is always horizontal.
 */

const GAP = 10;
export const DEFAULT_WIDTH = 330;
export const MIN_WIDTH = 260;

/**
 * @param {{width: number, height: number, controls?: DOMRect, hotbar?: DOMRect, barLeft?: number, railLeft?: number}} ui
 *        barLeft / railLeft: the dashboard's mission tabs' and squad rail's left edges, when shown
 * @returns {{left: number, bottom: number, width: number}}
 */
export function storyPointsBox({ height, controls, hotbar, barLeft, railLeft }) {
    const left = Math.round(Number.isFinite(railLeft) ? railLeft : (controls?.left ?? 16));
    // Bottom-aligned with the hotbar, like the player list it replaces.
    const bottom = Math.round(hotbar ? Math.max(GAP, height - hotbar.bottom) : 16);
    let right = left + DEFAULT_WIDTH;
    if (Number.isFinite(barLeft) && barLeft > left) right = barLeft - GAP;
    else if (hotbar && hotbar.left > left) right = Math.min(right, hotbar.left - GAP);
    return { left, bottom, width: Math.max(MIN_WIDTH, Math.round(right - left)) };
}
