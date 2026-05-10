import { patchOverrideActorTemplates } from "./scripts/override-actor-templates.js";
import { patchRollPowerModifiers } from "./scripts/roll-power-modifiers.js";

Hooks.once("init", () => {
    console.log("Azecraft Addon | Init");

    patchOverrideActorTemplates();
    patchRollPowerModifiers();
});
