/**
 * Where the story point bar goes (pure, unit-tested): right of the player list, bottom-aligned with
 * it, in the corner left under the dashboard's squad rail (or up to the hotbar without a rail).
 * When that corner is too narrow for the horizontal bar, the bar turns vertical.
 */

const GAP = 10;
export const HORIZONTAL_WIDTH = 330;
export const MIN_HORIZONTAL_WIDTH = 270;
export const VERTICAL_WIDTH = 150;

/**
 * @param {{width: number, height: number, players?: DOMRect, controls?: DOMRect, hotbar?: DOMRect, rail?: DOMRect}} ui
 * @returns {{left: number, bottom: number, width: number, maxHeight: number, vertical: boolean}}
 */
export function storyPointsBox({ width, height, players, controls, hotbar, rail }) {
    const left = Math.round(players ? players.right + GAP : (controls?.left ?? 16));
    const bottom = Math.round(players ? Math.max(GAP, height - players.bottom) : 16);

    // The corner ends at the rail's right edge (dashboard shown) and before the hotbar.
    const limits = [left + HORIZONTAL_WIDTH];
    if (rail) limits.push(rail.right);
    if (hotbar && hotbar.left > left) limits.push(hotbar.left - GAP);
    const room = Math.max(0, Math.min(...limits) - left);

    // Up to the rail's bottom edge when the rail ends above the bar's bottom line.
    const floor = height - bottom;
    const ceiling = rail && rail.bottom < floor ? rail.bottom + GAP : Math.max(0, floor - 320);
    const maxHeight = Math.round(Math.max(0, floor - ceiling));

    const vertical = room < MIN_HORIZONTAL_WIDTH && width > 0;
    return {
        left,
        bottom,
        width: vertical ? Math.min(VERTICAL_WIDTH, Math.max(room, 120)) : Math.round(room),
        maxHeight,
        vertical
    };
}
