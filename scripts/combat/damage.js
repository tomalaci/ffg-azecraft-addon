/**
 * Damage arithmetic for the "Apply damage" helper on weapon roll chat cards (pure, unit-tested).
 * Genesys: a hit deals the weapon's damage plus one per uncancelled Success; the target reduces it
 * by soak. Pierce ignores one soak per rank, Breach ten per rank. Stun Damage goes to strain.
 */

/** "Pierce (passive)" -> "pierce". */
function key(name) {
    return String(name ?? "").replace(/\(.*?\)/g, "").trim().toLowerCase();
}

/** A quality's rank from a summarized quality list ({name, totalRanks}); 0 when absent. */
export function qualityRank(qualities, name) {
    const found = (qualities ?? []).find(quality => key(quality.name) === key(name));
    if (!found) return 0;
    const rank = Number(found.totalRanks);
    return Number.isFinite(rank) && rank > 0 ? rank : 1;
}

export function hasQuality(qualities, name) {
    return (qualities ?? []).some(quality => key(quality.name) === key(name));
}

/** The hit's damage before soak: weapon damage plus successes (0 on a miss). */
export function hitDamage(weaponDamage, successes) {
    const hits = Math.max(0, Number(successes) || 0);
    return hits > 0 ? Math.max(0, Number(weaponDamage) || 0) + hits : 0;
}

/** Soak left after Pierce and Breach. */
export function effectiveSoak(soak, { pierce = 0, breach = 0 } = {}) {
    return Math.max(0, (Number(soak) || 0) - pierce - 10 * breach);
}

/** Damage that gets through to wounds (or strain). */
export function damageAfterSoak(damage, soak, qualities = {}) {
    return Math.max(0, (Number(damage) || 0) - effectiveSoak(soak, qualities));
}
