/**
 * GM configuration opened for one Scene: whether the dashboard shows there, and whether the Scene uses
 * the campaign dashboard (shared by all Scenes) or its own squad, mission pages and People of Note.
 * Edits working copies of both; saving writes only the store the Scene uses, and refuses (with an
 * explicit overwrite choice) if someone else saved that store in the meantime.
 */

import {
    MAX_PANEL_ENTRIES,
    MAX_SLOT_COUNT,
    MISSION_PANELS,
    OWNERSHIP,
    PARTY_FOLDER_NAME,
    PEOPLE_NOTE_MAX_LENGTH,
    PEOPLE_TEXT_MAX_LENGTH,
    MODULE_ID,
    SETTINGS,
    TEMPLATE_ROOT
} from "./constants.js";
import {
    DashboardConflictError,
    configFingerprint,
    normalizeDashboardConfig,
    readCampaignConfig,
    readDashboardConfig,
    resolveSceneDashboard,
    saveCampaignConfig,
    saveSceneDashboard,
    sceneUsesOwnConfig,
    validateDashboardConfig
} from "./dashboard-state.js";
import { SUPPORTED_PAGE_TYPES } from "./mission-data.js";
import { isLedgerEntry } from "./campaign-reputation.js";
import { DashboardHelpApp } from "./help-app.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

function isInFolder(actor, folderName) {
    let folder = actor.folder;

    while (folder) {
        if (folder.name === folderName) return true;
        folder = folder.folder;
    }

    return false;
}

function actorGroups({ npcFirst = false } = {}) {
    const byName = (a, b) => a.name.localeCompare(b.name);
    const all = game.actors.contents.slice().sort(byName);
    const partyFolder = all.filter(a => isInFolder(a, PARTY_FOLDER_NAME));
    const partyIds = new Set(partyFolder.map(a => a.id));
    const characters = all.filter(a => a.type === "character" && !partyIds.has(a.id));
    const others = all.filter(a => a.type !== "character" && !partyIds.has(a.id));
    const toOption = a => ({ uuid: a.uuid, name: a.name });
    const groups = [
        { label: PARTY_FOLDER_NAME, actors: partyFolder.map(toOption) },
        { label: "Other characters", actors: characters.map(toOption) },
        { label: "Adversaries and NPCs", actors: others.map(toOption) }
    ];

    if (npcFirst) groups.reverse();
    return groups.filter(g => g.actors.length);
}

function newId(prefix) {
    return `${prefix}-${foundry.utils.randomID(8)}`;
}

function resolve(uuid) {
    try {
        return uuid ? foundry.utils.fromUuidSync(uuid, { strict: false }) : null;
    } catch {
        return null;
    }
}

export class DashboardConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static #instances = new Map();

    static openFor(scene) {
        let app = DashboardConfigApp.#instances.get(scene.id);
        if (!app) {
            app = new DashboardConfigApp(scene);
            DashboardConfigApp.#instances.set(scene.id, app);
        }
        app.render({ force: true });
        return app;
    }

    constructor(scene, options = {}) {
        super({ ...options, id: `azecraft-dashboard-config-${scene.id}` });
        this.scene = scene;
        this.#reload();
    }

    /** Whether the dashboard shows on this Scene, and which config it uses ("campaign" or "scene"). */
    shown = true;
    source = "campaign";

    /** Working copies per source, fingerprints of the stored configs they started from, chosen Journals. */
    drafts = {};
    fingerprints = {};
    journalUuids = {};

    /** The working copy the form currently edits. */
    get draft() {
        return this.drafts[this.source];
    }

    get journalUuid() {
        return this.journalUuids[this.source] ?? null;
    }

    set journalUuid(uuid) {
        this.journalUuids[this.source] = uuid;
    }

    get #flag() {
        return this.scene.flags?.[MODULE_ID]?.dashboard;
    }

    #reload() {
        const resolved = resolveSceneDashboard(this.scene);
        const sceneStored = readDashboardConfig(this.scene);
        const campaign = readCampaignConfig();
        // A Scene that never had its own config starts from a copy of the campaign dashboard.
        const sceneHasOwn = sceneUsesOwnConfig(this.#flag) || Array.isArray(this.#flag?.party);

        this.shown = resolved.shown;
        this.source = resolved.source;
        this.drafts = {
            scene: foundry.utils.deepClone(sceneHasOwn ? sceneStored : campaign),
            campaign: foundry.utils.deepClone(campaign)
        };
        this.fingerprints = { scene: configFingerprint(sceneStored), campaign: configFingerprint(campaign) };

        for (const [key, draft] of Object.entries(this.drafts)) {
            const newestPage = Object.values(draft.mission).flat().map(resolve).filter(Boolean).at(-1);
            this.journalUuids[key] = newestPage?.parent?.uuid ?? null;
        }
    }

    static DEFAULT_OPTIONS = {
        tag: "form",
        classes: ["azd-config"],
        window: {
            title: "Mission Dashboard",
            icon: "fa-solid fa-satellite-dish",
            resizable: true,
            controls: [{ icon: "fa-solid fa-circle-question", label: "Help", action: "openHelp" }]
        },
        position: { width: 640, height: 760 },
        form: { handler: DashboardConfigApp.#onSubmit, submitOnChange: false, closeOnSubmit: false },
        actions: {
            addSlot: DashboardConfigApp.#onAddSlot,
            removeSlot: DashboardConfigApp.#onRemoveSlot,
            moveSlot: DashboardConfigApp.#onMoveSlot,
            addPerson: DashboardConfigApp.#onAddPerson,
            removePerson: DashboardConfigApp.#onRemovePerson,
            movePerson: DashboardConfigApp.#onMovePerson,
            createJournal: DashboardConfigApp.#onCreateJournal,
            shareJournal: DashboardConfigApp.#onShareJournal,
            openJournal: DashboardConfigApp.#onOpenJournal,
            addEntry: DashboardConfigApp.#onAddEntry,
            removeEntry: DashboardConfigApp.#onRemoveEntry,
            moveEntry: DashboardConfigApp.#onMoveEntry,
            reload: DashboardConfigApp.#onReload,
            copyToCampaign: DashboardConfigApp.#onCopyToCampaign,
            openHelp: () => DashboardHelpApp.open("gm-quick-start"),
            cancel: DashboardConfigApp.#onCancel
        }
    };

    static PARTS = {
        form: { template: `${TEMPLATE_ROOT}/dashboard-config.hbs`, scrollable: [".azd-config-body"] }
    };

    get title() {
        return `Mission Dashboard: ${this.scene.name}`;
    }

    async _prepareContext() {
        const partyGroups = actorGroups();
        const peopleGroups = actorGroups({ npcFirst: true });
        const journals = game.journal.contents
            .filter(entry => !isLedgerEntry(entry))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(entry => ({ uuid: entry.uuid, name: entry.name }));
        const journal = resolve(this.journalUuid);
        const pages = journal?.pages.contents.slice().sort((a, b) => a.sort - b.sort) ?? [];
        const knownActor = uuid => !uuid || Boolean(resolve(uuid));

        const pageOptions = pages.map(page => ({
            uuid: page.uuid,
            name: SUPPORTED_PAGE_TYPES.has(page.type) ? page.name : `${page.name} (${page.type}: not supported)`,
            disabled: !SUPPORTED_PAGE_TYPES.has(page.type)
        }));

        const panels = MISSION_PANELS.map(panel => {
            const list = this.draft.mission[panel.key];
            const entries = list.map((selected, index) => {
                const selectedPage = resolve(selected);
                const options = pageOptions.slice();

                // A page from another Journal (or a deleted one) stays selectable rather than being silently dropped.
                if (selected && !options.some(o => o.uuid === selected)) {
                    options.unshift({ uuid: selected, name: selectedPage ? `${selectedPage.parent?.name} › ${selectedPage.name}` : "Missing page", disabled: false });
                }

                return {
                    index,
                    number: index + 1,
                    selected,
                    options,
                    first: index === 0,
                    last: index === list.length - 1,
                    missing: Boolean(selected) && !selectedPage,
                    playerAccess: selectedPage ? this.#playerAccessLabel(selectedPage) : null
                };
            });

            return { ...panel, entries, canAdd: list.length < MAX_PANEL_ENTRIES };
        });

        const showOnAllScenes = game.settings.get(MODULE_ID, SETTINGS.showOnAllScenes);
        const campaignScenes = game.scenes.filter(scene => !sceneUsesOwnConfig(scene.flags?.[MODULE_ID]?.dashboard));

        return {
            scene: this.scene,
            draft: this.draft,
            shown: this.shown,
            isCampaign: this.source === "campaign",
            showOnAllScenes,
            campaignSceneCount: campaignScenes.length,
            slots: this.draft.party.map((slot, index) => ({
                ...slot,
                index,
                number: index + 1,
                first: index === 0,
                last: index === this.draft.party.length - 1,
                missing: !knownActor(slot.actorUuid)
            })),
            people: this.draft.people.map((person, index) => ({
                ...person,
                index,
                first: index === 0,
                last: index === this.draft.people.length - 1,
                missing: !knownActor(person.actorUuid),
                hiddenFromPlayers: this.#hiddenFromPlayers(person.actorUuid)
            })),
            partyGroups,
            peopleGroups,
            journals,
            journalUuid: this.journalUuid,
            journalHiddenFromPlayers: journal ? (journal.ownership.default ?? 0) < OWNERSHIP.OBSERVER : false,
            panels,
            canAddSlot: this.draft.party.length < MAX_SLOT_COUNT,
            textMax: PEOPLE_TEXT_MAX_LENGTH,
            noteMax: PEOPLE_NOTE_MAX_LENGTH,
            ...validateDashboardConfig(this.draft)
        };
    }

    #playerAccessLabel(page) {
        const players = game.users.filter(u => !u.isGM);
        const readers = players.filter(u => page.testUserPermission(u, OWNERSHIP.OBSERVER) && page.parent.testUserPermission(u, OWNERSHIP.LIMITED));
        if (!players.length) return "No player accounts";
        if (readers.length === players.length) return "All players can read";
        if (!readers.length) return "Hidden from players";
        return `Readable by ${readers.map(u => u.name).join(", ")}`;
    }

    #hiddenFromPlayers(uuid) {
        const actor = resolve(uuid);
        if (!actor) return false;
        return !game.users.some(u => !u.isGM && actor.testUserPermission(u, OWNERSHIP.LIMITED));
    }

    async _onFirstRender(context, options) {
        await super._onFirstRender(context, options);

        // The form element persists across renders, so this delegated listener is attached once.
        // Keep the working copy in step with the form so row actions never lose typed values.
        this.element.addEventListener("change", event => {
            this.#readForm();
            if (event.target.name === "source") {
                // The form's fields were read into the previous source's copy; now show the other copy.
                this.source = event.target.value === "scene" ? "scene" : "campaign";
                this.render();
            } else if (event.target.name === "journalUuid") {
                this.#autoSelectPages();
                this.render();
            } else if (event.target.matches("select")) {
                this.render();
            }
        });
    }

    /** Copy current form values into the working copy. */
    #readForm() {
        const data = foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(this.element).object);
        this.shown = Boolean(data.shown);
        this.journalUuid = data.journalUuid || null;

        for (const [index, slot] of this.draft.party.entries()) {
            slot.actorUuid = data.party?.[index]?.actorUuid || null;
        }

        for (const { key } of MISSION_PANELS) {
            const rows = data.mission?.[key] ?? {};
            // Rows stay in place (even unselected ones) until saving normalizes them away.
            this.draft.mission[key] = this.draft.mission[key].map((_, index) => rows[index] || "");
        }

        for (const [index, person] of this.draft.people.entries()) {
            const row = data.people?.[index] ?? {};
            Object.assign(person, {
                actorUuid: row.actorUuid || null,
                role: row.role ?? "",
                status: row.status ?? "",
                relationship: row.relationship ?? "",
                note: row.note ?? ""
            });
        }
    }

    /** Convenience only: pick pages by name, and save their UUIDs. */
    #autoSelectPages() {
        const journal = resolve(this.journalUuid);
        if (!journal) return;

        const pages = journal.pages.contents.slice().sort((a, b) => a.sort - b.sort);

        for (const panel of MISSION_PANELS) {
            // Keep a panel that already uses this Journal; otherwise take every matching page, in Journal order,
            // as its history (e.g. "Current Objective", "Current Objective 2").
            if (this.draft.mission[panel.key].some(uuid => resolve(uuid)?.parent?.uuid === journal.uuid)) continue;
            this.draft.mission[panel.key] = pages
                .filter(page => SUPPORTED_PAGE_TYPES.has(page.type) && panel.pattern.test(page.name))
                .map(page => page.uuid);
        }
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    static #onAddSlot() {
        this.#readForm();
        if (this.draft.party.length >= MAX_SLOT_COUNT) return;
        this.draft.party.push({ id: newId("slot"), actorUuid: null });
        this.render();
    }

    static #onRemoveSlot(event, target) {
        this.#readForm();
        if (this.draft.party.length <= 1) return;
        this.draft.party.splice(Number(target.dataset.index), 1);
        this.render();
    }

    static #onMoveSlot(event, target) {
        this.#readForm();
        DashboardConfigApp.#move(this.draft.party, Number(target.dataset.index), Number(target.dataset.direction));
        this.render();
    }

    static #onAddEntry(event, target) {
        this.#readForm();
        const list = this.draft.mission[target.dataset.panel];
        if (!list || list.length >= MAX_PANEL_ENTRIES) return;
        list.push("");
        this.render();
    }

    static #onRemoveEntry(event, target) {
        this.#readForm();
        this.draft.mission[target.dataset.panel]?.splice(Number(target.dataset.index), 1);
        this.render();
    }

    static #onMoveEntry(event, target) {
        this.#readForm();
        const list = this.draft.mission[target.dataset.panel];
        if (list) DashboardConfigApp.#move(list, Number(target.dataset.index), Number(target.dataset.direction));
        this.render();
    }

    static #onAddPerson() {
        this.#readForm();
        this.draft.people.push({ id: newId("person"), actorUuid: null, role: "", status: "", relationship: "", note: "" });
        this.render();
    }

    static #onRemovePerson(event, target) {
        this.#readForm();
        this.draft.people.splice(Number(target.dataset.index), 1);
        this.render();
    }

    static #onMovePerson(event, target) {
        this.#readForm();
        DashboardConfigApp.#move(this.draft.people, Number(target.dataset.index), Number(target.dataset.direction));
        this.render();
    }

    static #move(list, index, direction) {
        const to = index + direction;
        if (to < 0 || to >= list.length) return;
        [list[index], list[to]] = [list[to], list[index]];
    }

    /** Create a new mission Journal with the conventional pages; hidden from players until shared. */
    static async #onCreateJournal() {
        this.#readForm();
        const name = await DialogV2.input({
            window: { title: "Create mission Journal" },
            content: `<div class="form-group"><label>Mission title</label><div class="form-fields"><input type="text" name="name" value="${foundry.utils.escapeHTML(this.scene.name)}" required></div></div>
                <p class="hint">Creates Summary, Current Objective, Key Intel and GM Notes pages. The Journal starts hidden from players; use “Share with players” when ready. GM Notes always stays GM-only.</p>`,
            ok: { label: "Create", icon: "fa-solid fa-book" }
        });

        if (!name?.name?.trim()) return;

        const entry = await JournalEntry.implementation.create({
            name: `Mission: ${name.name.trim()}`,
            ownership: { default: OWNERSHIP.NONE },
            pages: [
                { name: "Summary", type: "text", sort: 100000, text: { content: "<p>Why are we here?</p>" } },
                { name: "Current Objective", type: "text", sort: 200000, text: { content: "<p>What do we do next?</p>" } },
                { name: "Key Intel", type: "text", sort: 300000, text: { content: "<h3>People</h3><ul><li></li></ul><h3>Places</h3><ul><li></li></ul><h3>Clues</h3><ul><li></li></ul>" } },
                { name: "GM Notes", type: "text", sort: 400000, ownership: { default: OWNERSHIP.NONE }, text: { content: "<p>Not shown on the dashboard.</p>" } }
            ]
        });

        this.journalUuid = entry.uuid;
        this.#autoSelectPages();
        this.render();
    }

    /** Give all players Observer on the mission Journal; explicitly restricted pages (GM Notes) stay hidden. */
    static async #onShareJournal() {
        this.#readForm();
        const journal = resolve(this.journalUuid);
        if (!journal) return;

        const confirmed = await DialogV2.confirm({
            window: { title: "Share mission Journal" },
            content: `<p>Set default ownership of <strong>${foundry.utils.escapeHTML(journal.name)}</strong> to Observer so all players can read it?</p><p class="hint">Pages with their own ownership (such as GM Notes) keep it.</p>`
        });

        if (!confirmed) return;
        await journal.update({ "ownership.default": OWNERSHIP.OBSERVER });
        this.render();
    }

    static #onOpenJournal() {
        resolve(this.journalUuid)?.sheet.render(true);
    }

    static #onReload() {
        this.#reload();
        this.render();
    }

    /** Make this Scene's own setup the campaign dashboard (applied on save). */
    static #onCopyToCampaign() {
        this.#readForm();
        this.drafts.campaign = foundry.utils.deepClone(this.drafts.scene);
        this.journalUuids.campaign = this.journalUuids.scene;
        this.source = "campaign";
        ui.notifications.info("Copied into the campaign dashboard. Save to apply it to every Scene that uses the campaign dashboard.");
        this.render();
    }

    static #onCancel() {
        this.close();
    }

    static async #onSubmit() {
        this.#readForm();
        const config = normalizeDashboardConfig(this.draft);
        const { errors } = validateDashboardConfig(config);

        if (errors.length) {
            ui.notifications.error(errors.join(" "));
            this.render();
            return;
        }

        const save = async ({ force = false } = {}) => {
            if (this.source === "campaign") {
                if (configFingerprint(config) !== this.fingerprints.campaign) {
                    await saveCampaignConfig(config, { expectedFingerprint: force ? null : this.fingerprints.campaign });
                }
                await saveSceneDashboard(this.scene, { shown: this.shown, source: "campaign" });
            } else {
                await saveSceneDashboard(this.scene, {
                    shown: this.shown,
                    source: "scene",
                    config,
                    expectedFingerprint: force ? null : this.fingerprints.scene
                });
            }
        };

        try {
            await save();
        } catch (error) {
            if (!(error instanceof DashboardConflictError)) {
                ui.notifications.error(error.message);
                return;
            }

            const choice = await DialogV2.wait({
                window: { title: "Dashboard changed elsewhere" },
                content: `<p>${foundry.utils.escapeHTML(error.message)}</p><p>Overwrite their changes with yours, or reload the latest version (your unsaved edits are discarded)?</p>`,
                buttons: [
                    { action: "overwrite", label: "Overwrite", icon: "fa-solid fa-floppy-disk" },
                    { action: "reload", label: "Reload latest", icon: "fa-solid fa-rotate", default: true }
                ]
            });

            if (choice === "overwrite") {
                await save({ force: true });
            } else {
                if (choice === "reload") DashboardConfigApp.#onReload.call(this);
                return;
            }
        }

        ui.notifications.info(this.source === "campaign"
            ? "Campaign dashboard saved."
            : `Mission dashboard saved for ${this.scene.name}.`);
        this.close();
    }

    _onClose(options) {
        super._onClose(options);
        DashboardConfigApp.#instances.delete(this.scene.id);
    }
}

