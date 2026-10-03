/**
 * Readied tech powers and omni-tool slots (pure rules, unit-tested).
 *
 * Mass Effect rules: tech powers are readied by installing them into the slots of the character's
 * omni-tool (about an hour of work). Each tech attack element, tech augment mode and tech construct
 * counts as a separate readied power; Tech Sabotage is one power with all its effects. A character
 * can have at most as many tech powers ready as ranks in Tech. Software installed on the omni-tool
 * uses slots too. Slots: the omni-tool model's (the item's hardpoints) plus 1 per rank of the
 * Customized Omni-tool talent. Over either limit the sheet warns; nothing is blocked.
 */

/**
 * The powers that can be readied: one per subtype of attack / augment / construct, one for sabotage.
 * @param {object[]} techPowers  the tech powers of the catalog
 * @returns {{id: string, powerId: string, subtypeId: string|null, label: string, group: string, icon: string|null}[]}
 */
export function readyUnits(techPowers) {
    return techPowers.flatMap(power => power.id === "tech-sabotage" || !power.subtypes?.length
        ? [{ id: power.id, powerId: power.id, subtypeId: null, label: power.label.replace(/^Tech /, ""), group: power.label, icon: null }]
        : power.subtypes.map(subtype => ({
            id: `${power.id}:${subtype.id}`,
            powerId: power.id,
            subtypeId: subtype.id,
            label: subtype.label,
            group: power.label,
            icon: subtype.icon ?? null
        })));
}

/** The readied list as stored: known unit ids, no duplicates, in catalog order. */
export function normalizeReadied(raw, units) {
    const ids = new Set(Array.isArray(raw) ? raw : []);
    return units.filter(unit => ids.has(unit.id)).map(unit => unit.id);
}

/** Add or remove a unit from the readied list. */
export function toggleReadied(raw, unitId, units) {
    const current = normalizeReadied(raw, units);
    return current.includes(unitId) ? current.filter(id => id !== unitId) : normalizeReadied([...current, unitId], units);
}

/** Whether a power (with a subtype, for powers that have them) is readied. */
export function isReadied(readied, powerId, subtypeId = null) {
    return readied.includes(powerId) || (subtypeId !== null && readied.includes(`${powerId}:${subtypeId}`));
}

/**
 * The omni-tool among a character's items: the equipped one, else the first.
 * @param {{name: string, type: string, equipped: boolean}[]} items
 */
export function pickOmniTool(items) {
    const tools = items.filter(item => item.type === "weapon" && /omni[\s-]?tool/i.test(item.name));
    return tools.find(item => item.equipped) ?? tools[0] ?? null;
}

/**
 * Slots and limits.
 * @param {{slots: number, software: {name: string, slots: number}[]}|null} tool  the omni-tool: model slots and installed software
 * @param {number} customizedRanks  ranks of the Customized Omni-tool talent
 * @param {number} techRank
 * @param {number} readiedCount
 */
export function omniToolStatus(tool, customizedRanks, techRank, readiedCount) {
    const softwareSlots = (tool?.software ?? []).reduce((sum, entry) => sum + Math.max(0, Number(entry.slots) || 0), 0);
    const total = tool ? Math.max(0, Number(tool.slots) || 0) + Math.max(0, Number(customizedRanks) || 0) : 0;
    const used = softwareSlots + readiedCount;
    return {
        hasTool: Boolean(tool),
        total,
        used,
        softwareSlots,
        readied: readiedCount,
        techRank: Math.max(0, Number(techRank) || 0),
        overSlots: used > total,
        overRank: readiedCount > Math.max(0, Number(techRank) || 0)
    };
}
