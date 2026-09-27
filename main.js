import { patchOverrideActorTemplates } from "./scripts/override-actor-templates.js";
import { patchRollPowerModifiers } from "./scripts/roll-power-modifiers.js";
import { initMissionDashboard } from "./scripts/mission-dashboard/index.js";
import { initStoryPoints } from "./scripts/story-points/story-points.js";
import { initCharacterSheetTheme } from "./scripts/character-sheet-theme.js";
import { initDefaultArt } from "./scripts/default-art/default-art.js";
import { initPowerTabs } from "./scripts/powers/power-tabs.js";
import { initAmmo } from "./scripts/ammo/ammo.js";
import { initApplyDamage } from "./scripts/combat/apply-damage.js";
import { initSheetSize } from "./scripts/sheet-size.js";

Hooks.once("init", () => {
    console.log("Azecraft Addon | Init");

    patchOverrideActorTemplates();
    patchRollPowerModifiers();
    initMissionDashboard();
    initStoryPoints();
    initCharacterSheetTheme();
    initDefaultArt();
    initPowerTabs();
    initAmmo();
    initApplyDamage();
    initSheetSize();
});
