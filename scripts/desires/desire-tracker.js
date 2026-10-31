/**
 * Desire Tracker (toolbar tab, GMs only): the active squad's characters with their Desire (the
 * Genesys motivation on the sheet), marked fulfilled for the current session, with a note. "New
 * session" files the session's marks in the history. All data is one world setting (desire-core.js),
 * so every GM sees and changes the same.
 */

import { SceneSpaceApp } from "../ui/scene-space.js";
import { displaySrc } from "../thumbnails/thumbnails.js";
import { readDesire } from "../mission-dashboard/actor-adapter.js";
import { readActiveSquad } from "../mission-dashboard/squads.js";
import { LABEL_MAX, NOTE_MAX, closeSession, fulfilledCounts, normalizeTracker, sessionLabel, setFulfilled, setLabel, setNote } from "./desire-core.js";

const MODULE_ID = "ffg-azecraft-addon";
const SETTING = "desireTracker";
const TEMPLATE = `modules/${MODULE_ID}/templates/desires/desire-tracker.hbs`;
const HISTORY_SHOWN = 20;

function readTracker() {
    return normalizeTracker(game.settings.get(MODULE_ID, SETTING));
}

async function writeTracker(tracker) {
    if (!game.user.isGM) return;
    await game.settings.set(MODULE_ID, SETTING, tracker);
}

/** The active squad's characters; without a squad, the characters players own. */
function trackedActors() {
    const squad = readActiveSquad();
    const fromSquad = (squad?.party ?? []).map(slot => (slot.actorUuid ? fromUuidSync(slot.actorUuid) : null))
        .filter(actor => actor instanceof Actor && actor.type === "character");
    if (fromSquad.length) return [...new Set(fromSquad)];
    return game.actors.filter(actor => actor.type === "character" && actor.hasPlayerOwner).sort((a, b) => a.name.localeCompare(b.name));
}

function playerOf(actor) {
    return game.users.filter(user => !user.isGM && actor.testUserPermission(user, "OWNER")).map(user => user.name).join(", ");
}

const dateOf = value => (value ? new Date(value).toLocaleDateString() : "");

export class DesireTrackerApp extends SceneSpaceApp {
    static DEFAULT_OPTIONS = {
        id: "azecraft-desires",
        classes: ["azecraft-desires"],
        window: { title: "Desire Tracker", icon: "fa-solid fa-heart" },
        actions: {
            toggle: DesireTrackerApp.#onToggle,
            openSheet: DesireTrackerApp.#onOpenSheet,
            newSession: DesireTrackerApp.#onNewSession
        }
    };

    static PARTS = {
        body: { template: TEMPLATE, scrollable: [".azds-scroll"] }
    };

    historyOpen = false;

    async _prepareContext() {
        const tracker = readTracker();
        const counts = fulfilledCounts(tracker);
        const actors = trackedActors();
        const rows = actors.map(actor => {
            const desire = readDesire(actor)?.text ?? "";
            const mark = tracker.session.marks[actor.id];
            return {
                id: actor.id,
                name: actor.name,
                img: actor.img ? displaySrc(actor.img) : "",
                player: playerOf(actor),
                desire,
                done: Boolean(mark),
                note: mark?.note ?? "",
                // The Desire changed on the sheet after it was marked: show what was fulfilled.
                markedDesire: mark && mark.desire && mark.desire !== desire ? mark.desire : "",
                count: counts[actor.id] ?? 0
            };
        });
        const names = new Map(game.actors.map(actor => [actor.id, actor.name]));
        return {
            isGM: game.user.isGM,
            label: tracker.session.label,
            placeholder: sessionLabel({ ...tracker.session, label: "" }),
            started: dateOf(tracker.session.startedAt),
            rows,
            doneCount: rows.filter(row => row.done).length,
            // Marked characters no longer in the squad stay visible, so their marks are not lost.
            others: Object.entries(tracker.session.marks).filter(([id]) => !actors.some(actor => actor.id === id))
                .map(([id, mark]) => ({ id, name: names.get(id) ?? "Removed character", desire: mark.desire, note: mark.note })),
            limits: { note: NOTE_MAX, label: LABEL_MAX },
            historyOpen: this.historyOpen,
            history: tracker.history.slice(0, HISTORY_SHOWN).map(entry => ({
                label: sessionLabel(entry),
                dates: [dateOf(entry.startedAt), dateOf(entry.endedAt)].filter(Boolean).filter((d, i, all) => all.indexOf(d) === i).join(" – "),
                marks: entry.marks.map(mark => ({ name: names.get(mark.actorId) ?? mark.name ?? "Removed character", desire: mark.desire, note: mark.note }))
            })),
            moreHistory: Math.max(0, tracker.history.length - HISTORY_SHOWN)
        };
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        const root = this.element;
        // Notes and the session name are saved when the field is left (or Enter), not on each key.
        root.querySelectorAll("[data-azds-note]").forEach(input => input.addEventListener("change", () => {
            writeTracker(setNote(readTracker(), input.dataset.azdsNote, input.value));
        }));
        root.querySelector("[data-azds-label]")?.addEventListener("change", event => writeTracker(setLabel(readTracker(), event.target.value)));
        root.querySelectorAll("input[type=text]").forEach(input => input.addEventListener("keydown", event => {
            if (event.key === "Enter") input.blur();
        }));
        root.querySelector(".azds-history")?.addEventListener("toggle", event => { this.historyOpen = event.target.open; });
    }

    static async #onToggle(event, target) {
        const actor = game.actors.get(target.dataset.actor);
        const tracker = readTracker();
        const done = !tracker.session.marks[target.dataset.actor];
        await writeTracker(setFulfilled(tracker, target.dataset.actor, done, { desire: actor ? readDesire(actor)?.text ?? "" : "" }));
        if (done) this.element?.querySelector(`[data-azds-note="${CSS.escape(target.dataset.actor)}"]`)?.focus();
    }

    static #onOpenSheet(event, target) {
        game.actors.get(target.dataset.actor)?.sheet?.render(true);
    }

    static async #onNewSession() {
        const tracker = readTracker();
        const count = Object.keys(tracker.session.marks).length;
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: "Start a new session" },
            content: `<p>End ${foundry.utils.escapeHTML(sessionLabel(tracker.session))}${count ? ` and file its ${count} fulfilled Desire${count === 1 ? "" : "s"} in the history` : " (nothing was marked, so it is not kept)"}, and start session ${tracker.session.number + 1}?</p>`
        });
        if (!confirmed) return;
        const names = Object.fromEntries(game.actors.map(actor => [actor.id, actor.name]));
        await writeTracker(closeSession(tracker, { names }));
    }
}

export function initDesireTracker() {
    const refresh = foundry.utils.debounce(() => foundry.applications.instances.get(DesireTrackerApp.DEFAULT_OPTIONS.id)?.render(), 150);
    game.settings.register(MODULE_ID, SETTING, {
        name: "Desire Tracker",
        scope: "world",
        config: false,
        type: Object,
        default: {},
        onChange: refresh
    });
    Hooks.once("setup", () => foundry.applications.handlebars.loadTemplates([TEMPLATE]));
    // Desires are edited on the sheet and on the dashboard cards.
    Hooks.on("updateActor", (actor, change) => {
        if (foundry.utils.hasProperty(change, "system.motivation") || "name" in change || "img" in change) refresh();
    });
    Hooks.on("deleteActor", refresh);
    // A different squad, or squad members, change the list.
    Hooks.on("updateSetting", setting => {
        if ([`${MODULE_ID}.squads`, `${MODULE_ID}.activeSquadId`].includes(setting.key)) refresh();
    });
}
