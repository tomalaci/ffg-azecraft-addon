/**
 * Mission dashboard entry point: settings, templates, integration points and the public API.
 */

import { MODULE_ID, SETTINGS, TEMPLATE_ROOT } from "./constants.js";
import { isDashboardEnabled, setDashboardEnabled } from "./dashboard-state.js";
import { DashboardController } from "./controller.js";
import { DashboardHelpApp } from "./help-app.js";
import { ensureLedgerFolders } from "./ledgers.js";
import { ensureSquads } from "./squads.js";
import { ensureTrackers } from "./trackers.js";

// Keys are Handlebars partial names; most partials are referenced by their path.
const TEMPLATES = Object.fromEntries(
    ["frame", "dividers", "header", "rail", "card", "mission", "intel", "dashboard-config", "campaign", "help"]
        .map(name => `${TEMPLATE_ROOT}/${name}.hbs`)
        .map(path => [path, path])
);
TEMPLATES["azd-page-state"] = `${TEMPLATE_ROOT}/page-state.hbs`;
TEMPLATES["azd-panel-tools"] = `${TEMPLATE_ROOT}/panel-tools.hbs`;
TEMPLATES["azd-ledger-bar"] = `${TEMPLATE_ROOT}/ledger-bar.hbs`;

let controller = null;

function registerSettings() {
    // Client scope: stored per browser, so one person's choice never affects anyone else.
    game.settings.register(MODULE_ID, SETTINGS.hidden, {
        name: "Hide mission dashboard",
        hint: "Hide the mission dashboard on this computer. The Dashboard button next to the Scene list shows it again.",
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
        onChange: () => {
            controller?.app?.applyPreferences();
            Hooks.callAll("azecraftDashboardChanged");
        }
    });

    game.settings.register(MODULE_ID, SETTINGS.compact, {
        name: "Mission dashboard compact cards",
        hint: "Auto uses compact character cards on small screens.",
        scope: "client",
        config: true,
        type: String,
        choices: { auto: "Auto", always: "Always", never: "Never" },
        default: "auto",
        onChange: () => {
            controller?.app?.applyPreferences();
            controller?.refresh("header", "rail");
        }
    });

    game.settings.register(MODULE_ID, SETTINGS.style, {
        name: "Mission dashboard style",
        hint: "Framed: the squad column and mission bar form a solid frame around the map. Floating: separate panels over the map.",
        scope: "client",
        config: true,
        type: String,
        choices: { framed: "Framed", floating: "Floating panels" },
        default: "framed",
        onChange: () => controller?.app?.applyPreferences()
    });

    // Relative widths of the objective / summary / intel tabs, set by dragging the dividers.
    game.settings.register(MODULE_ID, SETTINGS.columns, {
        name: "Mission tab widths",
        scope: "client",
        config: false,
        type: Array,
        default: [1 / 3, 1 / 3, 1 / 3],
        onChange: () => controller?.app?.applyPreferences()
    });

    game.settings.register(MODULE_ID, SETTINGS.missionCollapsed, {
        name: "Collapse mission panels",
        scope: "client",
        config: false,
        type: Boolean,
        default: false,
        onChange: () => {
            controller?.app?.applyPreferences();
            controller?.refresh("header");
        }
    });

    // World scope: the campaign dashboard shown on every Scene that has no config of its own.
    game.settings.register(MODULE_ID, SETTINGS.showOnAllScenes, {
        name: "Show mission dashboard on every Scene",
        hint: "Show the campaign dashboard on all Scenes, including new ones. A GM can still hide it on a single Scene in its dashboard configuration. When off, it only shows on Scenes where a GM enabled it.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        onChange: () => controller?.sync()
    });

    // Superseded by squads; read once to create the first squad (see ensureSquads).
    game.settings.register(MODULE_ID, SETTINGS.campaignDashboard, {
        name: "Campaign dashboard (legacy)",
        scope: "world",
        config: false,
        type: Object,
        default: {}
    });

    // World scope: squads and the squad every Scene shows. Changes re-sync every client.
    game.settings.register(MODULE_ID, SETTINGS.squads, {
        name: "Mission dashboard squads",
        scope: "world",
        config: false,
        type: Object,
        default: {},
        onChange: () => controller?.sync()
    });

    game.settings.register(MODULE_ID, SETTINGS.activeSquad, {
        name: "Active squad",
        scope: "world",
        config: false,
        type: String,
        default: "",
        onChange: () => controller?.sync()
    });

    // Client scope: the ledger this browser last chose per squad and tab (with the squad's revision).
    game.settings.register(MODULE_ID, SETTINGS.ledgerChoices, {
        name: "Last active mission ledgers",
        scope: "client",
        config: false,
        type: Object,
        default: {},
        onChange: () => controller?.refresh("mission", "intel", "header")
    });

    // World scope: the Reputation and Resources tracker Journals shared by every GM and Scene.
    for (const [key, name] of [[SETTINGS.ledger, "Reputation tracker"], [SETTINGS.resourcesLedger, "Resources tracker"]]) {
        game.settings.register(MODULE_ID, key, {
            name,
            scope: "world",
            config: false,
            type: String,
            default: "",
            onChange: () => controller?.onTrackerSettingChanged()
        });
    }
}

function registerKeybindings() {
    game.keybindings.register(MODULE_ID, "toggleDashboard", {
        name: "Toggle mission dashboard",
        hint: "Show or hide the mission dashboard on this computer.",
        editable: [],
        onDown: () => {
            game.settings.set(MODULE_ID, SETTINGS.hidden, !game.settings.get(MODULE_ID, SETTINGS.hidden));
            return true;
        }
    });
}

function registerIntegrations() {
    // Scene directory: enable/disable and configure.
    Hooks.on("getSceneContextOptions", (_app, options) => {
        const sceneFrom = li => game.scenes.get(li.closest("[data-entry-id]")?.dataset.entryId);

        options.push({
            name: "Configure Mission Dashboard",
            icon: '<i class="fa-solid fa-satellite-dish"></i>',
            condition: () => game.user.isGM,
            callback: li => {
                const scene = sceneFrom(li);
                if (scene) controller.openConfig(scene);
            }
        }, {
            name: "Hide Mission Dashboard on this Scene",
            icon: '<i class="fa-solid fa-eye-slash"></i>',
            condition: li => game.user.isGM && isDashboardEnabled(sceneFrom(li)),
            callback: li => setDashboardEnabled(sceneFrom(li), false)
        }, {
            name: "Show Mission Dashboard on this Scene",
            icon: '<i class="fa-solid fa-eye"></i>',
            condition: li => game.user.isGM && !isDashboardEnabled(sceneFrom(li)),
            callback: li => setDashboardEnabled(sceneFrom(li), true)
        });
    });

    // Scene configuration window: header menu entry opening the dashboard configuration.
    Hooks.on("getHeaderControlsSceneConfig", (app, controls) => {
        if (!game.user.isGM) return;
        controls.push({
            icon: "fa-solid fa-satellite-dish",
            label: "Mission Dashboard",
            action: "azecraftMissionDashboard",
            onClick: () => controller.openConfig(app.document)
        });
    });
}

export function initMissionDashboard() {
    registerSettings();
    registerKeybindings();
    registerIntegrations();

    controller = new DashboardController();
    controller.registerHooks();

    Hooks.once("setup", () => foundry.applications.handlebars.loadTemplates(TEMPLATES));

    // First-run setup, by the active GM only: Journal folders, the first squad, and the trackers.
    Hooks.once("ready", async () => {
        if (!game.users.activeGM?.isSelf) return;
        try {
            await ensureLedgerFolders();
            await ensureSquads();
            await ensureTrackers();
        } catch (error) {
            console.warn("Azecraft | Mission dashboard setup failed", error);
        }
    });

    const module = game.modules.get(MODULE_ID);
    module.api = {
        ...(module.api ?? {}),
        missionDashboard: {
            controller,
            /** Open the configuration for a Scene (defaults to the viewed Scene). GM only. */
            configure: (scene = game.scenes.viewed) => controller.openConfig(scene),
            /** Enable the dashboard on a Scene. GM only. */
            enable: (scene = game.scenes.viewed) => setDashboardEnabled(scene, true),
            disable: (scene = game.scenes.viewed) => setDashboardEnabled(scene, false),
            /** Open a tracker window: "reputation" (default) or "resources". */
            openTracker: kind => controller.openTracker(kind),
            openCampaign: () => controller.openTracker("reputation"),
            /** Open the help window, optionally at a section such as "gm-quick-start". */
            openHelp: section => DashboardHelpApp.open(section),
            refresh: () => controller.sync()
        }
    };
}
