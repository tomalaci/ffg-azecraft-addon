/**
 * Where the story point bar goes (pure, unit-tested): the bottom-left corner, under the dashboard's
 * squad rail (from its left edge to where the mission tabs begin), or, without the dashboard, next
 * to the scene controls up to the hotbar. The bar is always horizontal.
 */

const GAP = 10;
export const DEFAULT_WIDTH = 330;
export const MIN_WIDTH = 260;
/** Below this width the bar drops the tug-of-war segments and keeps the counts and buttons. */
export const NARROW_WIDTH = 240;
/** The narrow bar's smallest width (the dashboard's smallest squad rail). */
const NARROW_MIN = 170;

/**
 * @param {{width: number, height: number, controls?: DOMRect, hotbar?: DOMRect, barLeft?: number, railLeft?: number, railWidth?: number}} ui
 *        barLeft / railLeft / railWidth: the dashboard's mission tabs' and squad rail's left edges and
 *        the rail's width, when shown
 * @returns {{left: number, bottom: number, width: number, narrow: boolean}}
 */
export function storyPointsBox({ height, controls, hotbar, barLeft, railLeft, railWidth }) {
    const left = Math.round(Number.isFinite(railLeft) ? railLeft : (controls?.left ?? 16));
    // Bottom-aligned with the hotbar, like the player list it replaces.
    const bottom = Math.round(hotbar ? Math.max(GAP, height - hotbar.bottom) : 16);
    let right = left + DEFAULT_WIDTH;
    // With the dashboard: as wide as the squad rail above it, never past the mission tabs.
    const hasRail = Number.isFinite(railWidth) && railWidth > 0;
    if (hasRail) right = left + railWidth;
    if (Number.isFinite(barLeft) && barLeft > left) right = hasRail ? Math.min(right, barLeft - GAP) : barLeft - GAP;
    // On narrow screens the centred hotbar can start before the mission tabs: stay clear of it.
    if (hotbar && hotbar.left > left) right = Math.min(right, hotbar.left - GAP);
    const minimum = hasRail ? NARROW_MIN : MIN_WIDTH;
    const width = Math.max(minimum, Math.round(right - left));
    return { left, bottom, width, narrow: width < NARROW_WIDTH };
}
