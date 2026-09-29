/**
 * XP Management (toolbar tab, GMs only): the player characters the GMs added, with their total,
 * available and spent XP; add, reduce or set XP for selected characters with a reason (logged on the
 * character and in the XP Ledger journal); each character's XP log, editable in place. All data is
 * in the world (see xp-ops.js), so every GM sees and changes the same; this window only remembers
 * which rows are open or selected.
 */

import { SceneSpaceApp } from "../ui/scene-space.js";
import { displaySrc } from "../thumbnails/thumbnails.js";
import { CHANGE_MODES, LOG_ACTIONS, changeLabel, signed } from "./xp-core.js";
import { actorXp, addToRoster, addableCharacters, changeXp, findLedger, ledgerRows, readRoster, registerXpSettings, removeFromRoster, repairTotals, rosterActors, updateLogEntry, xpLog } from "./xp-ops.js";

const MODULE_ID = "ffg-azecraft-addon";
const TEMPLATE = `modules/${MODULE_ID}/templates/xp/xp-manager.hbs`;
const LEDGER_SHOWN = 30;

const { DialogV2 } = foundry.applications.api;
const esc = text => foundry.utils.escapeHTML(String(text ?? ""));

function playerOf(actor) {
    return game.users.filter(user => !user.isGM && actor.testUserPermission(user, "OWNER")).map(user => user.name).join(", ");
}

export class XPManagerApp extends SceneSpaceApp {
    static DEFAULT_OPTIONS = {
        id: "azecraft-xp-management",
        classes: ["azecraft-xp-management"],
        window: { title: "XP Management", icon: "fa-solid fa-star" },
        actions: {
            apply: XPManagerApp.#onApply,
            select: XPManagerApp.#onSelect,
            toggleLog: XPManagerApp.#onToggleLog,
            openSheet: XPManagerApp.#onOpenSheet,
            remove: XPManagerApp.#onRemove,
            add: XPManagerApp.#onAdd,
            deleteEntry: XPManagerApp.#onDeleteEntry,
            repair: XPManagerApp.#onRepair,
            openLedger: XPManagerApp.#onOpenLedger
        }
    };

    static PARTS = {
        body: { template: TEMPLATE, scrollable: [".azxp-scroll"] }
    };

    /** Window state only (per GM): selection, open logs, the change being typed. */
    selected = new Set();
    expanded = new Set();
    draft = { mode: "add", amount: 0, reason: "" };
    busy = "";
    /** XP log entries as last shown, to detect entries that changed before an edit is saved. */
    #shownLog = new Map();

    async _prepareContext() {
        const actors = rosterActors();
        const ids = new Set(actors.map(actor => actor.id));
        for (const id of this.selected) if (!ids.has(id)) this.selected.delete(id);
        this.#shownLog.clear();

        const rows = actors.map(actor => {
            const xp = actorXp(actor);
            const log = xpLog(actor);
            const last = log[0];
            const expanded = this.expanded.has(actor.id);
            if (expanded) this.#shownLog.set(actor.id, log);
            return {
                id: actor.id,
                name: actor.name,
                img: actor.img ? displaySrc(actor.img) : "",
                player: playerOf(actor),
                ...xp,
                negative: xp.available < 0,
                selected: this.selected.has(actor.id),
                expanded,
                last: last ? { date: last.date, description: last.description || last.action, cost: signed(last.action === "purchased" ? -Math.abs(last.xp?.cost ?? 0) : last.xp?.cost) } : null,
                log: expanded ? log.map((entry, index) => ({
                    index,
                    date: entry.date ?? "",
                    action: entry.action ?? "",
                    description: entry.description ?? "",
                    cost: entry.xp?.cost ?? 0,
                    available: entry.xp?.available ?? "",
                    total: entry.xp?.total ?? "",
                    purchase: Boolean(entry.id)
                })) : []
            };
        });

        const allLedger = ledgerRows();
        const ledger = allLedger.slice(0, LEDGER_SHOWN).map(row => ({
            when: new Date(row.time).toLocaleString(),
            actorName: row.actorName,
            change: changeLabel(row.mode, row.amount),
            delta: signed(row.delta),
            before: row.before?.total,
            after: row.after?.total,
            reason: row.reason,
            gm: row.gm
        }));

        return {
            rows,
            actions: LOG_ACTIONS,
            draft: this.draft,
            busy: this.busy,
            selectedCount: this.selected.size,
            allSelected: rows.length > 0 && this.selected.size === rows.length,
            addable: addableCharacters(),
            ledger,
            ledgerCount: allLedger.length,
            moreLedger: allLedger.length > LEDGER_SHOWN,
            hasLedger: Boolean(findLedger()),
            repairCount: rows.filter(row => row.needsRepair).length
        };
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        const root = this.element;
        root.querySelector("[data-azxp-all]")?.addEventListener("change", event => {
            this.selected = event.target.checked ? new Set(readRoster().filter(id => game.actors.has(id))) : new Set();
            this.render();
        });
        // The change being typed survives re-renders caused by other GMs' changes.
        for (const field of root.querySelectorAll("[data-azxp-field]")) {
            field.addEventListener("change", () => {
                const key = field.dataset.azxpField;
                if (key in this.draft) this.draft[key] = key === "amount" ? Number(field.value) || 0 : field.value;
            });
        }
        for (const field of root.querySelectorAll("[data-azxp-log]")) {
            field.addEventListener("change", () => this.#saveLogField(field));
        }
    }

    async #run(label, task) {
        this.busy = label;
        await this.render();
        try {
            return await task();
        } catch (error) {
            console.error("Azecraft | XP Management", error);
            ui.notifications.error(error.message);
        } finally {
            this.busy = "";
            this.render();
        }
    }

    #readForm() {
        const value = key => this.element.querySelector(`[data-azxp-field="${key}"]`)?.value ?? "";
        this.draft = { mode: value("mode"), amount: Number(value("amount")) || 0, reason: value("reason").trim() };
        return this.draft;
    }

    async #saveLogField(field) {
        const row = field.closest("tr[data-actor]");
        const actor = game.actors.get(row?.dataset.actor);
        const index = Number(row?.dataset.index);
        const snapshot = this.#shownLog.get(actor?.id)?.[index];
        if (!actor || !snapshot) return;
        const saved = await updateLogEntry(actor, index, snapshot, { [field.dataset.azxpLog]: field.value });
        if (!saved) {
            ui.notifications.warn(`${actor.name}'s XP log changed meanwhile; showing the current log. Please redo the edit.`);
            this.render();
        }
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    static async #onApply() {
        const { mode, amount, reason } = this.#readForm();
        if (!CHANGE_MODES.includes(mode)) return;
        if (!reason) return ui.notifications.warn("Give a reason; it is logged on each character and in the XP Ledger.");
        if (mode !== "set" && !amount) return ui.notifications.warn("Enter an amount of XP.");
        const actors = [...this.selected].map(id => game.actors.get(id)).filter(Boolean);
        const lines = actors.map(actor => {
            const xp = actorXp(actor);
            return `<li>${esc(actor.name)}: total ${xp.total}, available ${xp.available}</li>`;
        }).join("");
        const ok = await DialogV2.confirm({
            window: { title: "Change XP", icon: "fa-solid fa-star" },
            content: `<p><strong>${esc(changeLabel(mode, amount))}</strong> XP for ${actors.length} character(s), reason "${esc(reason)}":</p><ul>${lines}</ul>`,
            yes: { label: "Apply", icon: "fa-solid fa-check" },
            no: { label: "Cancel" },
            rejectClose: false
        });
        if (!ok) return;
        await this.#run("Changing XP…", async () => {
            const { changed, failed } = await changeXp(actors.map(actor => actor.id), mode, amount, reason);
            if (changed.length) ui.notifications.info(`XP: ${changed.join(", ")}.`);
            for (const message of failed) ui.notifications.warn(message);
            this.draft = { ...this.draft, amount: 0, reason: "" };
        });
    }

    static async #onRepair() {
        const actors = rosterActors().filter(actor => actorXp(actor).needsRepair);
        if (!actors.length) return;
        const lines = actors.map(actor => {
            const xp = actorXp(actor);
            return `<li>${esc(actor.name)}: stored total ${xp.storedTotal} → <strong>${xp.total}</strong> (available ${xp.available} + spent ${xp.spent})</li>`;
        }).join("");
        const ok = await DialogV2.confirm({
            window: { title: "Repair stored totals", icon: "fa-solid fa-screwdriver-wrench" },
            content: `<p>Spending recorded with the sheet's <em>Adjust XP</em> used to lower the stored total XP as well. Set it back to all XP given (available + spent from the XP log)? Available XP and the XP logs are not changed; the XP Ledger records it.</p><ul>${lines}</ul>`,
            yes: { label: "Repair", icon: "fa-solid fa-check" },
            no: { label: "Cancel" },
            rejectClose: false
        });
        if (!ok) return;
        await this.#run("Repairing totals…", async () => {
            const repaired = await repairTotals(actors.map(actor => actor.id));
            if (repaired.length) ui.notifications.info(`Repaired: ${repaired.join(", ")}.`);
        });
    }

    static #onSelect(event, target) {
        const id = target.dataset.actor;
        if (target.checked) this.selected.add(id);
        else this.selected.delete(id);
        this.render();
    }

    static #onToggleLog(event, target) {
        const id = target.dataset.actor;
        if (this.expanded.has(id)) this.expanded.delete(id);
        else this.expanded.add(id);
        this.render();
    }

    static #onOpenSheet(event, target) {
        game.actors.get(target.dataset.actor)?.sheet?.render(true);
    }

    static async #onRemove(event, target) {
        const actor = game.actors.get(target.dataset.actor);
        const ok = await DialogV2.confirm({
            window: { title: "Remove from XP Management" },
            content: `<p>Remove <strong>${esc(actor?.name ?? "this character")}</strong> from XP Management for every GM? The character's XP and XP log are not changed.</p>`,
            rejectClose: false
        });
        if (!ok) return;
        this.selected.delete(target.dataset.actor);
        await removeFromRoster(target.dataset.actor);
    }

    static async #onAdd() {
        const id = this.element.querySelector('[data-azxp-field="addActor"]')?.value;
        if (id) await addToRoster(id);
    }

    static async #onDeleteEntry(event, target) {
        const actor = game.actors.get(target.dataset.actor);
        const index = Number(target.dataset.index);
        const snapshot = this.#shownLog.get(actor?.id)?.[index];
        if (!actor || !snapshot) return;
        const link = snapshot.id ? "<p>This entry is linked to a purchase: without it, the sheet can no longer refund that purchase.</p>" : "";
        const ok = await DialogV2.confirm({
            window: { title: "Delete XP log entry" },
            content: `<p>Delete "${esc(snapshot.description || snapshot.action)}" (${esc(snapshot.date)}) from ${esc(actor.name)}'s XP log? The character's XP is not changed.</p>${link}`,
            rejectClose: false
        });
        if (!ok) return;
        const saved = await updateLogEntry(actor, index, snapshot, null);
        if (!saved) ui.notifications.warn(`${actor.name}'s XP log changed meanwhile; nothing was deleted.`);
        this.render();
    }

    static #onOpenLedger() {
        findLedger()?.sheet?.render(true);
    }
}

export function initXpManager() {
    const refresh = foundry.utils.debounce(() => foundry.applications.instances.get(XPManagerApp.DEFAULT_OPTIONS.id)?.render(), 150);
    registerXpSettings(refresh);
    Hooks.on("updateActor", actor => {
        if (readRoster().includes(actor.id)) refresh();
    });
    Hooks.on("deleteActor", refresh);
    Hooks.on("createActor", refresh);
    Hooks.on("updateJournalEntry", entry => {
        if (entry === findLedger()) refresh();
    });
    Hooks.on("createJournalEntry", refresh);
    Hooks.on("deleteJournalEntry", refresh);
}
