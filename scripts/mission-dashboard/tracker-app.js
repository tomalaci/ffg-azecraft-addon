/**
 * Tracker window for Reputation (Fame + factions) or Resources (Credits + materials): totals and the
 * adjustment history. Everyone with read access sees them; only GMs adjust or manage entries.
 */

import { MODULE_ID, REASON_MAX_LENGTH, TEMPLATE_ROOT } from "./constants.js";
import {
    FAME_LABEL,
    TRACKERS,
    addEntry,
    buildStanding,
    createTracker,
    findTrackerCandidates,
    recordAdjustment,
    renameEntry,
    selectTracker,
    setEntryArchived,
    validateAdjustment
} from "./trackers.js";
import { DashboardHelpApp } from "./help-app.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const HISTORY_PREVIEW = 15;

function signed(delta) {
    const amount = Math.abs(delta).toLocaleString();
    return delta > 0 ? `+${amount}` : `−${amount}`;
}

function totalLabel(total, signedTotals) {
    return signedTotals && total > 0 ? `+${total.toLocaleString()}` : total.toLocaleString();
}

export class TrackerApp extends HandlebarsApplicationMixin(ApplicationV2) {
    showAllHistory = false;
    showArchived = false;

    constructor(kind, options = {}) {
        const tracker = TRACKERS[kind];
        super(foundry.utils.mergeObject({
            id: `azecraft-tracker-${kind}`,
            window: { title: tracker.title, icon: tracker.icon }
        }, options));
        this.kind = kind;
        this.tracker = tracker;
    }

    static DEFAULT_OPTIONS = {
        classes: ["azd-campaign"],
        window: {
            resizable: true,
            controls: [{ icon: "fa-solid fa-circle-question", label: "Help", action: "openHelp" }]
        },
        position: { width: 520, height: 640 },
        actions: {
            adjust: TrackerApp.#onAdjust,
            correct: TrackerApp.#onCorrect,
            addEntry: TrackerApp.#onAddEntry,
            renameEntry: TrackerApp.#onRenameEntry,
            archiveEntry: TrackerApp.#onArchiveEntry,
            createTracker: TrackerApp.#onCreateTracker,
            selectTracker: TrackerApp.#onSelectTracker,
            toggleHistory: TrackerApp.#onToggleHistory,
            toggleArchived: TrackerApp.#onToggleArchived,
            openJournal: TrackerApp.#onOpenJournal,
            openHelp: () => DashboardHelpApp.open("reputation")
        }
    };

    static PARTS = {
        body: { template: `${TEMPLATE_ROOT}/campaign.hbs`, scrollable: [".azd-campaign-scroll"] }
    };

    async _prepareContext() {
        const standing = buildStanding(this.kind);
        const isGM = game.user.isGM;
        const tracker = this.tracker;
        const base = {
            isGM,
            title: tracker.title,
            hasFame: tracker.hasFame,
            entryNoun: tracker.entryNoun,
            entriesLabel: tracker.entriesLabel
        };

        if (standing.state !== "ready") {
            return {
                ...base,
                state: standing.state,
                candidates: isGM ? findTrackerCandidates(this.kind).map(e => ({ uuid: e.uuid, name: e.name })) : []
            };
        }

        const format = event => ({
            ...event,
            deltaLabel: signed(event.delta),
            positive: event.delta > 0,
            date: event.createdAt ? new Date(event.createdAt).toLocaleString() : "",
            canCorrect: isGM && !event.corrected && !event.correctsEventId
        });

        const entries = standing.entries
            .filter(e => this.showArchived || !e.archived)
            .map(e => ({ ...e, totalLabel: totalLabel(e.total, tracker.hasFame) }));

        return {
            ...base,
            state: "ready",
            ledgerName: standing.entry.name,
            fame: standing.fame,
            fameLabel: FAME_LABEL,
            entries,
            archivedCount: standing.entries.filter(e => e.archived).length,
            showArchived: this.showArchived,
            history: (this.showAllHistory ? standing.history : standing.history.slice(0, HISTORY_PREVIEW)).map(format),
            historyCount: standing.history.length,
            historyTruncated: !this.showAllHistory && standing.history.length > HISTORY_PREVIEW,
            showAllHistory: this.showAllHistory
        };
    }

    /* -------------------------------------------- */
    /*  Adjustments                                 */
    /* -------------------------------------------- */

    /**
     * Ask for an adjustment and record it. The event id is fixed for the lifetime of one request,
     * so re-submitting after an error can never create a duplicate entry.
     */
    async #requestAdjustment({ target, delta = 1, correcting = null } = {}) {
        if (!game.user.isGM) return;

        const standing = buildStanding(this.kind);
        if (standing.state !== "ready") return;

        const tracker = this.tracker;
        const eventId = foundry.utils.randomID(16);
        const escape = foundry.utils.escapeHTML;
        const firstEntry = standing.entries.find(e => !e.archived)?.id ?? "";
        const initialKey = target?.kind === "fame" ? "fame" : target?.id ?? (tracker.hasFame ? "fame" : firstEntry);
        let values = { targetKey: initialKey, delta, reason: "", sessionLabel: "" };

        while (true) {
            const options = (tracker.hasFame ? [`<option value="fame" ${values.targetKey === "fame" ? "selected" : ""}>${FAME_LABEL}</option>`] : [])
                .concat(standing.entries
                    .filter(e => !e.archived || e.id === values.targetKey)
                    .map(e => `<option value="${escape(e.id)}" ${values.targetKey === e.id ? "selected" : ""}>${escape(e.name)}</option>`));
            const correctionNote = correcting
                ? `<p class="hint">Correcting: <strong>${escape(signed(correcting.delta))} ${escape(correcting.targetLabel ?? "")}</strong>: ${escape(correcting.reason)}</p>`
                : "";

            const result = await DialogV2.input({
                window: { title: correcting ? "Correct adjustment" : `Adjust ${tracker.title.toLowerCase()}` },
                position: { width: 440 },
                content: `${correctionNote}
                    <div class="form-group"><label>${tracker.hasFame ? "Target" : "Resource"}</label><div class="form-fields"><select name="targetKey" ${correcting ? "disabled" : ""}>${options.join("")}</select></div></div>
                    <div class="form-group"><label>Change</label><div class="form-fields"><input type="number" name="delta" step="1" value="${escape(String(values.delta))}" required></div></div>
                    <div class="form-group stacked"><label>Reason (required, visible to players)</label><textarea name="reason" maxlength="${REASON_MAX_LENGTH}" rows="3" required>${escape(values.reason)}</textarea></div>
                    <div class="form-group"><label>Session (optional)</label><div class="form-fields"><input type="text" name="sessionLabel" maxlength="60" value="${escape(values.sessionLabel)}" placeholder="e.g. Session 18"></div></div>`,
                ok: { label: "Record", icon: "fa-solid fa-check" }
            });

            if (!result) return;

            values = {
                targetKey: correcting ? values.targetKey : result.targetKey,
                delta: Number(result.delta),
                reason: String(result.reason ?? "").trim(),
                sessionLabel: String(result.sessionLabel ?? "").trim()
            };

            const chosenTarget = values.targetKey === "fame" ? { kind: "fame" } : { kind: "entry", id: values.targetKey };
            const errors = validateAdjustment(
                { target: chosenTarget, delta: values.delta, reason: values.reason, correctsEventId: correcting?.eventId },
                standing.entry.flags[MODULE_ID].ledger,
                tracker
            );

            if (errors.length) {
                ui.notifications.warn(errors.join(" "));
                continue;
            }

            try {
                await recordAdjustment(this.kind, {
                    eventId,
                    target: chosenTarget,
                    delta: values.delta,
                    reason: values.reason,
                    sessionLabel: values.sessionLabel || null,
                    sceneUuid: game.scenes.viewed?.uuid ?? null,
                    correctsEventId: correcting?.eventId ?? null
                });
                return;
            } catch (error) {
                // Nothing is shown as recorded unless the page was actually created.
                console.error("Azecraft | Could not record adjustment", error);
                ui.notifications.error(`Adjustment not recorded: ${error.message}`);
            }
        }
    }

    static #onAdjust(event, target) {
        const entryId = target.dataset.entryId;
        const delta = Number(target.dataset.delta ?? 1);
        return this.#requestAdjustment({ target: entryId ? { kind: "entry", id: entryId } : { kind: "fame" }, delta });
    }

    static #onCorrect(event, target) {
        const standing = buildStanding(this.kind);
        const original = standing.history?.find(e => e.eventId === target.dataset.eventId);
        if (!original) return;
        return this.#requestAdjustment({ target: original.target, delta: -original.delta, correcting: original });
    }

    /* -------------------------------------------- */
    /*  Entries and tracker Journal                 */
    /* -------------------------------------------- */

    static async #askName(title, value = "") {
        const result = await DialogV2.input({
            window: { title },
            content: `<div class="form-group"><label>Name</label><div class="form-fields"><input type="text" name="name" maxlength="80" value="${foundry.utils.escapeHTML(value)}" required autofocus></div></div>`,
            ok: { label: "Save", icon: "fa-solid fa-check" }
        });
        return result?.name?.trim() || null;
    }

    static async #guard(fn) {
        try {
            await fn();
        } catch (error) {
            ui.notifications.error(error.message);
        }
    }

    static async #onAddEntry() {
        const name = await TrackerApp.#askName(`Add ${this.tracker.entryNoun}`);
        if (name) await TrackerApp.#guard(() => addEntry(this.kind, name));
    }

    static async #onRenameEntry(event, target) {
        const id = target.dataset.entryId;
        const name = await TrackerApp.#askName(`Rename ${this.tracker.entryNoun}`, target.dataset.name);
        if (name) await TrackerApp.#guard(() => renameEntry(this.kind, id, name));
    }

    static async #onArchiveEntry(event, target) {
        await TrackerApp.#guard(() => setEntryArchived(this.kind, target.dataset.entryId, target.dataset.archived !== "true"));
    }

    static async #onCreateTracker() {
        await TrackerApp.#guard(() => createTracker(this.kind));
        this.render();
    }

    static async #onSelectTracker(event, target) {
        await TrackerApp.#guard(() => selectTracker(this.kind, target.dataset.uuid));
        this.render();
    }

    static #onToggleHistory() {
        this.showAllHistory = !this.showAllHistory;
        this.render();
    }

    static #onToggleArchived() {
        this.showArchived = !this.showArchived;
        this.render();
    }

    static #onOpenJournal() {
        buildStanding(this.kind).entry?.sheet.render(true);
    }
}
