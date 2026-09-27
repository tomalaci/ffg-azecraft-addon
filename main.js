import { patchOverrideActorTemplates } from "./scripts/override-actor-templates.js";
import { patchRollPowerModifiers } from "./scripts/roll-power-modifiers.js";
import { initMissionDashboard } from "./scripts/mission-dashboard/index.js";
import { initStoryPoints } from "./scripts/story-points/story-points.js";
import { initCharacterSheetTheme } from "./scripts/character-sheet-theme.js";
import { initDefaultArt } from "./scripts/default-art/default-art.js";
import { initPowerTabs } from "./scripts/powers/power-tabs.js";

Hooks.once("init", () => {
    console.log("Azecraft Addon | Init");

    patchOverrideActorTemplates();
    patchRollPowerModifiers();
    initMissionDashboard();
    initStoryPoints();
    initCharacterSheetTheme();
    initDefaultArt();
    initPowerTabs();
});
