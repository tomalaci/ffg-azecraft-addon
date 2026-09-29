/**
 * Fixes for starwarsffg actor sheets (all actor types).
 *
 * 1. Keep an actor sheet's size across re-renders.
 *
 * starwarsffg's actor sheets set their size in getData from a size they remember only when their
 * own form submits or item hooks fire. Updates made by addon buttons (power loadouts,
 * concentration, ammo, ...) re-render the sheet without that, so a resized sheet snapped back to
 * its default size. Remember the current size at the start of every re-render instead.
 *
 * (Not done with pre*Item hooks: the system only registers its own item hooks, including drop
 * validation, when no other module has registered those hooks yet.)
 *
 * 2. Compute the sheet's data once, not once per skill. The system's activateListeners draws each
 *    skill's dice pool by calling `this.getData({})` for every skill row (35+ full sheet data
 *    builds per render), which made opening and re-rendering sheets slow. The calls all start
 *    synchronously inside activateListeners, so they now share one result for that render.
 */

const PATCHED = Symbol("azecraftSheetPatches");

function patchSheets() {
    const classes = new Set(Object.values(CONFIG.Actor.sheetClasses ?? {})
        .flatMap(byType => Object.values(byType).map(entry => entry.cls))
        .filter(Boolean));

    for (const cls of classes) {
        const proto = cls.prototype;
        if (!Object.hasOwn(proto, "getData") || proto.getData[PATCHED]) continue;
        const original = proto.getData;
        const wrapped = function (...args) {
            // `rendered` is false while re-rendering; an element already on the page means a re-render.
            if (this.element?.[0]?.isConnected && Number(this.position?.width)) {
                this.sheetWidth = this.position.width;
                this.sheetHeight = this.position.height;
            }
            return original.apply(this, args);
        };
        wrapped[PATCHED] = true;
        proto.getData = wrapped;
    }

    for (const cls of classes) {
        const proto = cls.prototype;
        if (!Object.hasOwn(proto, "activateListeners") || proto.activateListeners[PATCHED]) continue;
        const original = proto.activateListeners;
        const wrapped = function (html) {
            // Share one getData() among the per-skill calls made while listeners are set up.
            const ownGetData = Object.hasOwn(this, "getData") ? this.getData : undefined;
            const getData = this.getData;
            let shared = null;
            this.getData = function (...args) {
                shared ??= getData.apply(this, args);
                return shared;
            };
            try {
                return original.call(this, html);
            } finally {
                if (ownGetData) this.getData = ownGetData;
                else delete this.getData;
            }
        };
        wrapped[PATCHED] = true;
        proto.activateListeners = wrapped;
    }
}

export function initSheetPatches() {
    // The system registers its sheets during its own (async) init; patch once they exist.
    Hooks.once("setup", patchSheets);
    Hooks.once("ready", patchSheets);
}
