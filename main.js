import { patchOverrideActorTemplates } from "./scripts/override-actor-templates.js";
import { patchRollPowerModifiers } from "./scripts/roll-power-modifiers.js";
import { initMissionDashboard } from "./scripts/mission-dashboard/index.js";
import { initStoryPoints } from "./scripts/story-points/story-points.js";
import { initCharacterSheetTheme } from "./scripts/character-sheet-theme.js";
import { initDefaultArt } from "./scripts/default-art/default-art.js";
import { initPowerTabs } from "./scripts/powers/power-tabs.js";
import { initAmmo } from "./scripts/ammo/ammo.js";
import { initApplyDamage } from "./scripts/combat/apply-damage.js";
import { initSheetPatches } from "./scripts/sheet-patches.js";
import { initThumbnails } from "./scripts/thumbnails/thumbnails.js";
import { initToolbar, refreshToolbar, registerToolbarButton } from "./scripts/toolbar/toolbar.js";
import { initPerfCollector } from "./scripts/perf/perf-collector.js";
import { initPerfWindow, UIPerformanceApp } from "./scripts/perf/perf-window.js";
import { initVisualEffects } from "./scripts/perf/visual-effects.js";
import { AdminPanelApp, initAdminPanel } from "./scripts/admin/admin-panel.js";
import { XPManagerApp, initXpManager } from "./scripts/xp/xp-manager.js";
import { initXpAdjust } from "./scripts/xp/xp-adjust.js";
import { ShareImageApp, initImageShare } from "./scripts/share/image-share.js";
import { ShareTextApp, initShareText } from "./scripts/share/share-text.js";
import { initShareArchive } from "./scripts/share/share-archive.js";
import { initQuickEffects } from "./scripts/effects/quick-effects.js";

Hooks.once("init", () => {
    console.log("Azecraft Addon | Init");
    initPerfCollector();
    initPerfWindow();
    initVisualEffects();

    patchOverrideActorTemplates();
    patchRollPowerModifiers();
    initMissionDashboard();
    initStoryPoints();
    initCharacterSheetTheme();
    initDefaultArt();
    initPowerTabs();
    initAmmo();
    initApplyDamage();
    initSheetPatches();
    initThumbnails();
    initToolbar();
    initShareArchive();
    initImageShare();
    initShareText();
    initQuickEffects();
    registerToolbarButton({
        id: "share-image",
        order: 25,
        label: "Share Image",
        icon: "fa-solid fa-share-from-square",
        tooltip: "Show an image to everyone or chosen players without uploading it (drop, paste or link)",
        isActive: () => Boolean(foundry.applications.instances.get("azecraft-share-image")),
        onClick: async () => {
            await ShareImageApp.toggle();
            refreshToolbar();
        }
    });
    registerToolbarButton({
        id: "share-text",
        order: 26,
        label: "Share Text",
        icon: "fa-solid fa-file-lines",
        tooltip: "Show text (written here or a dropped journal page) to everyone or chosen players",
        isActive: () => Boolean(foundry.applications.instances.get("azecraft-share-text")),
        onClick: async () => {
            await ShareTextApp.toggle();
            refreshToolbar();
        }
    });
    registerToolbarButton({
        id: "ui-performance",
        order: 30,
        label: "UI Performance",
        icon: "fa-solid fa-gauge-high",
        tooltip: "Frame rate, slow code, graphs and loaded assets on this computer",
        isActive: () => Boolean(foundry.applications.instances.get("azecraft-ui-performance")),
        onClick: async () => {
            await UIPerformanceApp.toggle();
            refreshToolbar();
        }
    });
    initXpManager();
    initXpAdjust();
    registerToolbarButton({
        id: "xp-management",
        order: 35,
        gmOnly: true,
        label: "XP Management",
        icon: "fa-solid fa-star",
        tooltip: "Player characters' XP: add, reduce or set it with a logged reason, and edit their XP logs",
        isActive: () => Boolean(foundry.applications.instances.get("azecraft-xp-management")),
        onClick: async () => {
            if (!game.user.isGM) return;
            await XPManagerApp.toggle();
            refreshToolbar();
        }
    });
    initAdminPanel();
    registerToolbarButton({
        id: "admin-panel",
        order: 40,
        gmOnly: true,
        label: "Admin Panel",
        icon: "fa-solid fa-screwdriver-wrench",
        tooltip: "GM tools: fix placeholder art, optimize portraits, manage and convert assets",
        isActive: () => Boolean(foundry.applications.instances.get("azecraft-admin-panel")),
        onClick: async () => {
            if (!game.user.isGM) return;
            await AdminPanelApp.toggle();
            refreshToolbar();
        }
    });
});
