/**
 * The character sheet's "Adjust XP" (eraser icon on the XP log tab), replaced. Players record
 * spending there, but the system changed the total XP along with the available XP, so the total no
 * longer showed all XP ever given. Now it changes available XP only (negative: XP spent; positive:
 * spent XP given back); the total is XP given, set by GMs in XP Management. It is logged like
 * before: an "adjusted" entry with the reason.
 */

import { logDate, xpStatus, xpSummary } from "./xp-core.js";

const PATCHED = Symbol("azecraftXpAdjust");
const { DialogV2 } = foundry.applications.api;
const esc = text => foundry.utils.escapeHTML(String(text ?? ""));

async function adjustXp(actor) {
    const result = await DialogV2.prompt({
        window: { title: game.i18n.localize("SWFFG.XP.Adjust.Window.Title"), icon: "fa-solid fa-eraser" },
        content: `<div class="form-group"><label>${esc(game.i18n.localize("SWFFG.XP.Adjust.Window.Amount"))}</label>
                <div class="form-fields"><input type="number" name="amount" value="0" step="1" autofocus></div></div>
            <div class="form-group"><label>${esc(game.i18n.localize("SWFFG.XP.Adjust.Window.Reason"))}</label>
                <div class="form-fields"><input type="text" name="reason" value="${esc(game.i18n.localize("SWFFG.XP.Adjust.Window.Default"))}"></div></div>
            <p class="hint">Changes available XP only. Negative: XP spent. Positive: spent XP given back. Total XP (all XP given) is set by GMs in XP Management.</p>`,
        ok: {
            label: game.i18n.localize("SWFFG.XP.Adjust.Confirm"),
            icon: "fa-solid fa-check",
            callback: (event, button) => ({ amount: Math.trunc(Number(button.form.elements.amount.value) || 0), reason: button.form.elements.reason.value.trim() })
        },
        rejectClose: false
    });
    if (!result?.amount) return;

    const { amount, reason } = result;
    const stored = xpSummary(actor._source.system?.experience);
    const log = actor.getFlag("starwarsffg", "xpLog");
    const entries = Array.isArray(log) ? log : [];
    const before = xpStatus(actor.system.experience, entries);
    const entry = {
        action: "adjusted",
        id: undefined,
        xp: { cost: amount, available: before.available + amount, total: before.total },
        date: logDate(),
        description: reason
    };
    // The total (all XP given) is left to GMs.
    await actor.update({
        "system.experience.available": stored.available + amount,
        "flags.starwarsffg.xpLog": [entry, ...entries]
    });
}

function patchSheets() {
    const classes = new Set(Object.values(CONFIG.Actor.sheetClasses ?? {})
        .flatMap(byType => Object.values(byType).map(entry => entry.cls))
        .filter(Boolean));
    for (const cls of classes) {
        const proto = cls.prototype;
        if (!Object.hasOwn(proto, "_xpAdjustment") || proto._xpAdjustment[PATCHED]) continue;
        const replacement = async function (event) {
            event?.preventDefault?.();
            event?.stopPropagation?.();
            if (!this.actor?.isOwner) return;
            await adjustXp(this.actor);
        };
        replacement[PATCHED] = true;
        proto._xpAdjustment = replacement;
    }
}

export function initXpAdjust() {
    // The system registers its sheets during its own (async) init; patch once they exist.
    Hooks.once("setup", patchSheets);
    Hooks.once("ready", patchSheets);
}
