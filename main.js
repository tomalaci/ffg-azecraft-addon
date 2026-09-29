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
import { initToolbar } from "./scripts/toolbar/toolbar.js";
import { initPerfMonitor } from "./scripts/perf/perf-monitor.js";
import { initVisualEffects } from "./scripts/perf/visual-effects.js";

Hooks.once("init", () => {
    console.log("Azecraft Addon | Init");
    initPerfMonitor();
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
});
