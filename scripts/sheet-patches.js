/**
 * Keep an actor sheet's size across re-renders.
 *
 * starwarsffg's actor sheets set their size in getData from a size they remember only when their
 * own form submits or item hooks fire. Updates made by addon buttons (power loadouts,
 * concentration, ammo, ...) re-render the sheet without that, so a resized sheet snapped back to
 * its default size. Remember the current size at the start of every re-render instead.
 *
 * (Not done with pre*Item hooks: the system only registers its own item hooks, including drop
 * validation, when no other module has registered those hooks yet.)
 */

const PATCHED = Symbol("azecraftSheetSize");

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
}

export function initSheetSize() {
    // The system registers its sheets during its own (async) init; patch once they exist.
    Hooks.once("setup", patchSheets);
    Hooks.once("ready", patchSheets);
}
