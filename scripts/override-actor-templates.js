/**
 * This module replaces the system's original actor sheet templates with the addon's versions.
 * Original templates: (StarWarsFFG/templates/actors/ffg-*.html)
 * Replacements: ./templates/actors/ffg-*.html
 * 
 * Only replaces templates that are available locally, otherwise use the original ones.
 */

const MODULE_ID = "ffg-azecraft-addon";
const OVERRIDDEN_ACTOR_TYPES = new Set(["minion", "rival", "nemesis"]);
const TEMPLATE_OVERRIDES = {
    minion: `modules/${MODULE_ID}/templates/actors/ffg-minion-sheet.html`,
    rival: `modules/${MODULE_ID}/templates/actors/ffg-rival-sheet.html`,
    nemesis: `modules/${MODULE_ID}/templates/actors/ffg-nemesis-sheet.html`
};

function getPropertyDescriptor(object, property) {
    let current = object;

    while (current) {
        const descriptor = Object.getOwnPropertyDescriptor(current, property);

        if (descriptor) {
            return descriptor;
        }

        current = Object.getPrototypeOf(current);
    }

    return null;
}

async function enrichBiographyIfNeeded(sheet, data) {
    if (!OVERRIDDEN_ACTOR_TYPES.has(sheet.actor?.type)) {
        return data;
    }

    if (data?.data?.enrichedBio) {
        return data;
    }

    const biography = sheet.actor?.system?.biography ?? "";
    const textEditor = foundry.applications?.ux?.TextEditor ?? globalThis.TextEditor;

    if (!textEditor?.enrichHTML) {
        console.warn("Azecraft | TextEditor.enrichHTML is unavailable for actor biography enrichment");
        return data;
    }

    data.data.enrichedBio = await textEditor.enrichHTML(biography, {
        async: true,
        secrets: sheet.actor.isOwner,
        relativeTo: sheet.actor
    });

    return data;
}

function patchSheetClass(sheetClass) {
    if (sheetClass.prototype._azecraftTemplateOverridePatched) {
        return false;
    }

    const templateDescriptor = getPropertyDescriptor(sheetClass.prototype, "template");
    const originalGetTemplate = templateDescriptor?.get;
    const originalGetData = sheetClass.prototype.getData;

    if (!originalGetTemplate || typeof originalGetData !== "function") {
        console.warn(`Azecraft | Could not patch ${sheetClass.name}; missing template getter or getData`);
        return false;
    }

    Object.defineProperty(sheetClass.prototype, "template", {
        configurable: true,
        get() {
            const override = TEMPLATE_OVERRIDES[this.actor?.type];

            if (override) {
                return override;
            }

            return originalGetTemplate.call(this);
        }
    });

    sheetClass.prototype.getData = async function (options = {}) {
        const data = await originalGetData.call(this, options);
        return enrichBiographyIfNeeded(this, data);
    };

    sheetClass.prototype._azecraftTemplateOverridePatched = true;

    return true;
}

export function patchOverrideActorTemplates() {
    Hooks.once("setup", async () => {
        console.log("Azecraft | Patching actor sheet templates");

        if (typeof loadTemplates === "function") {
            await loadTemplates(Object.values(TEMPLATE_OVERRIDES));
        }

        const sheetClasses = Object.values(CONFIG.Actor?.sheetClasses ?? {}).flatMap(group => Object.values(group));
        const baseSheet = sheetClasses.find(entry => entry.id === "ffg.ActorSheetFFG")?.cls;

        if (!baseSheet) {
            console.warn("Azecraft | Could not find ffg.ActorSheetFFG to patch");
            return;
        }

        if (!patchSheetClass(baseSheet)) {
            return;
        }

        for (const [actorType, templatePath] of Object.entries(TEMPLATE_OVERRIDES)) {
            console.log(`Azecraft | Overriding ${actorType} sheet template -> ${templatePath}`);
        }
    });
}