import { patchOverrideActorTemplates } from "./scripts/override-actor-templates.js";

Hooks.once("init", () => {
    console.log("Azecraft Addon | Init");

    patchOverrideActorTemplates();
});