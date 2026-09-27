/**
 * Story point pool maths (pure). The starwarsffg system stores the pool as two world settings:
 * dPoolLight (the players' side, shown here as the squad) and dPoolDark (the GM's side, shown as
 * the threat). Using a point moves it to the other side, like a tug of war.
 */

export const SIDES = Object.freeze({ squad: "squad", threat: "threat" });

function count(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

export function normalizePool(pool) {
    return { squad: count(pool?.squad), threat: count(pool?.threat) };
}

/** Segments left to right: squad points fill from the left, threat points from the right. */
export function poolSegments(pool) {
    const { squad, threat } = normalizePool(pool);
    return [...Array(squad).fill(SIDES.squad), ...Array(threat).fill(SIDES.threat)];
}

/** Share of the pool on the squad side, 0..1 (0.5 when the pool is empty). */
export function squadShare(pool) {
    const { squad, threat } = normalizePool(pool);
    return squad + threat ? squad / (squad + threat) : 0.5;
}

/**
 * Use one point from `side`: it moves to the other side. Returns the new pool, or null when that
 * side has no points left.
 */
export function usePoint(pool, side) {
    const p = normalizePool(pool);
    if (side === SIDES.squad && p.squad > 0) return { squad: p.squad - 1, threat: p.threat + 1 };
    if (side === SIDES.threat && p.threat > 0) return { squad: p.squad + 1, threat: p.threat - 1 };
    return null;
}

/** GM adjustment: add or remove points on one side (never below zero). */
export function adjustPool(pool, side, delta) {
    const p = normalizePool(pool);
    if (!(side in p)) return p;
    return { ...p, [side]: Math.max(0, p[side] + Math.trunc(delta)) };
}

/** Total number of story points in play (both sides). */
export function poolCapacity(pool) {
    const { squad, threat } = normalizePool(pool);
    return squad + threat;
}

/**
 * GM capacity change: add or remove points from the pool as a whole. A new point goes to the side
 * with fewer points (the squad on a tie) and a removed point comes from the side with more (the
 * threat on a tie), so the tug of war stays as balanced as it was.
 */
export function resizePool(pool, delta) {
    let p = normalizePool(pool);
    const steps = Math.trunc(delta);
    for (let i = 0; i < Math.abs(steps); i++) {
        if (steps > 0) {
            p = p.squad <= p.threat ? { ...p, squad: p.squad + 1 } : { ...p, threat: p.threat + 1 };
        } else if (p.squad + p.threat > 0) {
            p = p.threat >= p.squad ? { ...p, threat: p.threat - 1 } : { ...p, squad: p.squad - 1 };
        }
    }
    return p;
}

/** Between the system's setting names and this widget's sides. */
export function toSystemPool(pool) {
    const p = normalizePool(pool);
    return { light: p.squad, dark: p.threat };
}

export function fromSystemPool(light, dark) {
    return normalizePool({ squad: light, threat: dark });
}
