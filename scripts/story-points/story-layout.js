/**
 * Where the story point bar goes (pure, unit-tested): the bottom-left corner, where Foundry's player
 * list used to be, stretched right to where the dashboard's mission tabs begin (or up to the
 * hotbar when there is no dashboard). The bar is always horizontal.
 */

const GAP = 10;
export const DEFAULT_WIDTH = 330;
export const MIN_WIDTH = 260;

/**
 * @param {{width: number, height: number, controls?: DOMRect, hotbar?: DOMRect, barLeft?: number}} ui
 *        barLeft: left edge of the dashboard's mission tabs, when the dashboard is shown
 * @returns {{left: number, bottom: number, width: number}}
 */
export function storyPointsBox({ height, controls, hotbar, barLeft }) {
    const left = Math.round(controls?.left ?? 16);
    // Bottom-aligned with the hotbar, like the player list it replaces.
    const bottom = Math.round(hotbar ? Math.max(GAP, height - hotbar.bottom) : 16);
    let right = left + DEFAULT_WIDTH;
    if (Number.isFinite(barLeft) && barLeft > left) right = barLeft - GAP;
    else if (hotbar && hotbar.left > left) right = Math.min(right, hotbar.left - GAP);
    return { left, bottom, width: Math.max(MIN_WIDTH, Math.round(right - left)) };
}
