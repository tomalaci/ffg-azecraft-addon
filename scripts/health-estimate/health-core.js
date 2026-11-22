/**
 * Health estimate: pure helpers (unit-tested). A trimmed port of the Health Estimate module's
 * starwarsffg provider and estimate logic (MIT, see LICENSE in this folder).
 *
 * starwarsffg 2.0.3 actors (template.json, ActorFFG.prepareDerivedData):
 * - character, rival, nemesis, minion: system.stats.wounds {value, max}; value is the wounds taken,
 *   max the threshold. A minion group's max is unit_wounds x quantity.max and its value the group's
 *   wounds; a minion goes down only when the wounds exceed its share (quantity.value), so the group is
 *   out once value > max.
 * - vehicle: system.stats.hullTrauma {value, max}, the same way.
 * - homestead: no track, no estimate.
 */

export const MODULE_ID = "ffg-azecraft-addon";
/** The Health Estimate module's id and flag scope, read as a fallback. */
export const LEGACY_ID = "healthEstimate";

/** Actor types that are people (they can be "Dead"); vehicles are wrecked instead. */
export const ORGANIC_TYPES = Object.freeze(["character", "minion", "rival", "nemesis"]);
export const VEHICLE_TYPES = Object.freeze(["vehicle"]);

/** Brackets: the first whose value (percent of health left) is >= the token's. From Health Estimate's en.json. */
export const STATES = Object.freeze([
    { value: 0, label: "Unconscious" },
    { value: 25, label: "Near Death" },
    { value: 50, label: "Badly Injured" },
    { value: 75, label: "Injured" },
    { value: 99, label: "Barely Injured" },
    { value: 100, label: "Unharmed" }
]);
export const VEHICLE_STATES = Object.freeze([
    { value: 0, label: "Wrecked" },
    { value: 20, label: "Flaming" },
    { value: 40, label: "Smoking" },
    { value: 60, label: "Battered" },
    { value: 80, label: "Scratched" },
    { value: 100, label: "Pristine" }
]);
export const DEAD_LABEL = "Dead";
export const DEAD_COLORS = Object.freeze({ fill: "#990000", stroke: "#340000" });

/** Who sees estimates (world setting). */
export const VISIBILITY = Object.freeze({
    all: "Everyone, every token",
    playersNpcs: "Players see NPCs only, GMs see every token",
    npcs: "Everyone, NPCs only",
    gm: "GMs only"
});

/** Health left on a track as 0..1, or null when the track is missing or has no threshold. */
export function trackFraction(track) {
    const value = Number(track?.value);
    const max = Number(track?.max);
    if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return null;
    // Genesys: out only when the damage exceeds the threshold. At exactly the threshold there is
    // still a sliver left (shown as the bracket above the last; a minion group still has one member).
    if (value > max) return 0;
    if (value === max) return 0.001;
    return Math.min(1, Math.max(0, (max - value) / max));
}

/**
 * An actor's health: { fraction, vehicle } or null when it has no estimate (unknown types,
 * homesteads, no threshold, vehicles while they are hidden).
 */
export function actorHealth(actor, { hideVehicles = false } = {}) {
    const type = actor?.type;
    if (VEHICLE_TYPES.includes(type)) {
        if (hideVehicles) return null;
        const fraction = trackFraction(actor.system?.stats?.hullTrauma);
        return fraction === null ? null : { fraction, vehicle: true };
    }
    if (!ORGANIC_TYPES.includes(type)) return null;
    const fraction = trackFraction(actor.system?.stats?.wounds);
    return fraction === null ? null : { fraction, vehicle: false };
}

/** The bracket for a fraction, as Health Estimate picks it: { label, index }. */
export function bracket(fraction, states = STATES) {
    let percent = fraction * 100;
    // Below 1% but not 0 still counts as alive.
    percent = percent !== 0 && Math.floor(percent) === 0 ? 0.1 : Math.trunc(percent);
    const index = states.findIndex(state => state.value >= percent);
    return index < 0 ? { label: "", index } : { label: states[index].label, index };
}

/** HSL (h in degrees, s and l 0..1) to "#rrggbb". */
export function hslToHex(h, s, l) {
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const channel = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
    return `#${[channel(0), channel(8), channel(4)].map(c => c.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Text colours for a fraction: red at 0 through yellow to green at 1 (Health Estimate's default
 * HSL gradient, fixed) with a dark outline of the same hue.
 */
export function estimateColors(fraction) {
    const hue = 120 * Math.min(1, Math.max(0, fraction));
    return { fill: hslToHex(hue, 1, 0.5), stroke: hslToHex(hue, 1, 0.18) };
}

/** Our flag if it is set (true or false), else the Health Estimate module's, else false. */
function flag(flags, key, legacyKey = key) {
    const own = flags?.[MODULE_ID]?.[key];
    if (typeof own === "boolean") return own;
    return Boolean(flags?.[LEGACY_ID]?.[legacyKey]);
}

/** Flag keys under flags["ffg-azecraft-addon"]; the legacy keys are Health Estimate's. */
export const FLAGS = Object.freeze({
    hidden: { key: "healthEstimateHidden", legacy: "hideHealthEstimate" },
    dead: { key: "healthEstimateDead", legacy: "dead" },
    dontMarkDead: { key: "healthEstimateDontMarkDead", legacy: "dontMarkDead" }
});
/** Set on an actor whose dead status this feature applied (removed again when it is healed). */
export const AUTO_DEAD_FLAG = "healthEstimateAutoDead";

/** A token's estimate flags from the token's and the actor's flags (either one counts). */
export function readFlags(tokenFlags, actorFlags) {
    const read = ({ key, legacy }) => flag(tokenFlags, key, legacy) || flag(actorFlags, key, legacy);
    return { hidden: read(FLAGS.hidden), dead: read(FLAGS.dead), dontMarkDead: read(FLAGS.dontMarkDead) };
}

/** Does this user see the estimate of a token (by the "who sees it" setting)? */
export function visibleTo(mode, { isGM, npc }) {
    switch (mode) {
        case "gm": return isGM;
        case "npcs": return npc;
        case "playersNpcs": return isGM || npc;
        default: return true;
    }
}

/**
 * Should "NPCs die at 0" mark this actor dead? Health Estimate checked generic types (npc,
 * monster...) and so never matched starwarsffg's minions, rivals and nemeses.
 */
export function diesAtZero({ type, playerOwned, fraction, npcsDie, dontMarkDead }) {
    return Boolean(npcsDie) && ORGANIC_TYPES.includes(type) && !playerOwned && fraction === 0 && !dontMarkDead;
}

/**
 * The estimate shown for a token: { label, fill, stroke, dead } or null.
 * `statusDead`: the actor has Foundry's dead status or its combatant is defeated.
 */
export function estimate({ actor, playerOwned, flags, statusDead = false, npcsDie = true, hideVehicles = false, isGM = false }) {
    const health = actorHealth(actor, { hideVehicles });
    if (!health) return null;
    const organic = !health.vehicle;
    const dead = organic && (flags.dead || statusDead || diesAtZero({
        type: actor.type, playerOwned, fraction: health.fraction, npcsDie, dontMarkDead: flags.dontMarkDead
    }));
    const label = dead ? DEAD_LABEL : bracket(health.fraction, health.vehicle ? VEHICLE_STATES : STATES).label;
    const colors = dead ? DEAD_COLORS : estimateColors(health.fraction);
    // GMs see hidden estimates with an asterisk; players don't see them at all (checked by the caller).
    return { label: flags.hidden && isGM ? `${label}*` : label, ...colors, dead };
}
