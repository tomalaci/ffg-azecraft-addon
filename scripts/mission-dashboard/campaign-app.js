/**
 * Campaign standing window: Fame, faction reputation totals and the adjustment history.
 * Everyone with read access sees totals and history; only GMs adjust or manage factions.
 */

import { MODULE_ID, REASON_MAX_LENGTH, TEMPLATE_ROOT } from "./constants.js";
import { DashboardHelpApp } from "./help-app.js";
import {
    FAME_LABEL,
    addFaction,
    buildStanding,
    createLedger,
    findLedgerCandidates,
    recordAdjustment,
    renameFaction,
    selectLedger,
    setFactionArchived,
    validateAdjustment
} from "./campaign-reputation.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const HISTORY_PREVIEW = 15;

function signed(delta) {
    return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}

export class CampaignStandingApp extends HandlebarsApplicationMixin(ApplicationV2) {
    showAllHistory = false;
    showArchived = false;

    static DEFAULT_OPTIONS = {
        id: "azecraft-campaign-standing",
        classes: ["azd-campaign"],
        window: {
            title: "Campaign Standing",
            icon: "fa-solid fa-ranking-star",
            resizable: true,
            controls: [{ icon: "fa-solid fa-circle-question", label: "Help", action: "openHelp" }]
        },
        position: { width: 520, height: 640 },
        actions: {
            adjust: CampaignStandingApp.#onAdjust,
            correct: CampaignStandingApp.#onCorrect,
            addFaction: CampaignStandingApp.#onAddFaction,
            renameFaction: CampaignStandingApp.#onRenameFaction,
            archiveFaction: CampaignStandingApp.#onArchiveFaction,
            createLedger: CampaignStandingApp.#onCreateLedger,
            selectLedger: CampaignStandingApp.#onSelectLedger,
            toggleHistory: CampaignStandingApp.#onToggleHistory,
            toggleArchived: CampaignStandingApp.#onToggleArchived,
            openLedger: CampaignStandingApp.#onOpenLedger,
            openHelp: () => DashboardHelpApp.open("reputation")
        }
    };

    static PARTS = {
        body: { template: `${TEMPLATE_ROOT}/campaign.hbs`, scrollable: [".azd-campaign-scroll"] }
    };

    async _prepareContext() {
        const standing = buildStanding();
        const isGM = game.user.isGM;

        if (standing.state !== "ready") {
            return {
                isGM,
                state: standing.state,
                candidates: isGM ? findLedgerCandidates().map(e => ({ uuid: e.uuid, name: e.name })) : []
            };
        }

        const format = event => ({
            ...event,
            deltaLabel: signed(event.delta),
            positive: event.delta > 0,
            date: event.createdAt ? new Date(event.createdAt).toLocaleString() : "",
            canCorrect: isGM && !event.corrected && !event.correctsEventId
        });

        const factions = standing.factions
            .filter(f => this.showArchived || !f.archived)
            .map(f => ({ ...f, totalLabel: f.total > 0 ? `+${f.total}` : String(f.total) }));

        return {
            isGM,
            state: "ready",
            ledgerName: standing.entry.name,
            fame: standing.fame,
            fameLabel: FAME_LABEL,
            factions,
            archivedCount: standing.factions.filter(f => f.archived).length,
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
    async #requestAdjustment({ target = { kind: "fame" }, delta = 1, correcting = null } = {}) {
        if (!game.user.isGM) return;

        const standing = buildStanding();
        if (standing.state !== "ready") return;

        const eventId = foundry.utils.randomID(16);
        const escape = foundry.utils.escapeHTML;
        let values = { targetKey: target.kind === "fame" ? "fame" : target.id, delta, reason: "", sessionLabel: "" };

        while (true) {
            const options = [`<option value="fame" ${values.targetKey === "fame" ? "selected" : ""}>${FAME_LABEL}</option>`]
                .concat(standing.factions
                    .filter(f => !f.archived || f.id === values.targetKey)
                    .map(f => `<option value="${escape(f.id)}" ${values.targetKey === f.id ? "selected" : ""}>${escape(f.name)}</option>`));
            const correctionNote = correcting
                ? `<p class="hint">Correcting: <strong>${escape(signed(correcting.delta))} ${escape(correcting.targetLabel ?? "")}</strong>: ${escape(correcting.reason)}</p>`
                : "";

            const result = await DialogV2.input({
                window: { title: correcting ? "Correct adjustment" : "Adjust campaign standing" },
                position: { width: 440 },
                content: `${correctionNote}
                    <div class="form-group"><label>Target</label><div class="form-fields"><select name="targetKey" ${correcting ? "disabled" : ""}>${options.join("")}</select></div></div>
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

            const chosenTarget = values.targetKey === "fame" ? { kind: "fame" } : { kind: "faction", id: values.targetKey };
            const errors = validateAdjustment({ target: chosenTarget, delta: values.delta, reason: values.reason, correctsEventId: correcting?.eventId }, standing.entry.flags[MODULE_ID].ledger);

            if (errors.length) {
                ui.notifications.warn(errors.join(" "));
                continue;
            }

            try {
                await recordAdjustment({
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
        const factionId = target.dataset.factionId;
        const delta = Number(target.dataset.delta ?? 1);
        return this.#requestAdjustment({ target: factionId ? { kind: "faction", id: factionId } : { kind: "fame" }, delta });
    }

    static #onCorrect(event, target) {
        const standing = buildStanding();
        const original = standing.history?.find(e => e.eventId === target.dataset.eventId);
        if (!original) return;
        return this.#requestAdjustment({ target: original.target, delta: -original.delta, correcting: original });
    }

    /* -------------------------------------------- */
    /*  Factions and ledger                         */
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

    static async #onAddFaction() {
        const name = await CampaignStandingApp.#askName("Add faction");
        if (name) await CampaignStandingApp.#guard(() => addFaction(name));
    }

    static async #onRenameFaction(event, target) {
        const id = target.dataset.factionId;
        const name = await CampaignStandingApp.#askName("Rename faction", target.dataset.name);
        if (name) await CampaignStandingApp.#guard(() => renameFaction(id, name));
    }

    static async #onArchiveFaction(event, target) {
        await CampaignStandingApp.#guard(() => setFactionArchived(target.dataset.factionId, target.dataset.archived !== "true"));
    }

    static async #onCreateLedger() {
        await CampaignStandingApp.#guard(() => createLedger());
        this.render();
    }

    static async #onSelectLedger(event, target) {
        await CampaignStandingApp.#guard(() => selectLedger(target.dataset.uuid));
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

    static #onOpenLedger() {
        buildStanding().entry?.sheet.render(true);
    }
}
