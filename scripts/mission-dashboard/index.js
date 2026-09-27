/**
 * Mission dashboard entry point: settings, templates, integration points and the public API.
 */

import { MODULE_ID, SETTINGS, TEMPLATE_ROOT } from "./constants.js";
import { isDashboardEnabled, setDashboardEnabled } from "./dashboard-state.js";
import { DashboardController } from "./controller.js";
import { DashboardHelpApp } from "./help-app.js";

// Keys are Handlebars partial names; most partials are referenced by their path.
const TEMPLATES = Object.fromEntries(
    ["header", "rail", "card", "mission", "intel", "dashboard-config", "campaign", "help"]
        .map(name => `${TEMPLATE_ROOT}/${name}.hbs`)
        .map(path => [path, path])
);
TEMPLATES["azd-page-state"] = `${TEMPLATE_ROOT}/page-state.hbs`;
TEMPLATES["azd-panel-tools"] = `${TEMPLATE_ROOT}/panel-tools.hbs`;

let controller = null;

function registerSettings() {
    // Client scope: stored per browser, so one person's choice never affects anyone else.
    game.settings.register(MODULE_ID, SETTINGS.hidden, {
        name: "Hide mission dashboard",
        hint: "Hide the mission dashboard on this computer. A small button stays available to show it again.",
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
        onChange: () => controller?.app?.applyPreferences()
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

    // World scope: the campaign reputation ledger shared by every GM and Scene.
    game.settings.register(MODULE_ID, SETTINGS.ledger, {
        name: "Campaign reputation ledger",
        scope: "world",
        config: false,
        type: String,
        default: "",
        onChange: () => controller?.onLedgerSettingChanged()
    });
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
            name: "Disable Mission Dashboard",
            icon: '<i class="fa-solid fa-eye-slash"></i>',
            condition: li => game.user.isGM && isDashboardEnabled(sceneFrom(li)),
            callback: li => setDashboardEnabled(sceneFrom(li), false)
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
            openCampaign: () => controller.openCampaign(),
            /** Open the help window, optionally at a section such as "gm-quick-start". */
            openHelp: section => DashboardHelpApp.open(section),
            refresh: () => controller.sync()
        }
    };
}
