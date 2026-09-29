/**
 * Default actor art: replaces the starwarsffg Star Wars placeholder portraits and tokens of new
 * actors with configurable art (by default the addon's abstract Mass Effect style tokens), and lets
 * the GM swap the placeholders on existing actors and placed tokens. See default-art-core.js for
 * what counts as a placeholder.
 */

import {
    ART_TYPES,
    MODULE_ID,
    TYPE_LABELS,
    defaultArtConfig,
    normalizeArtConfig,
    placedTokenUpdate,
    placeholderUpdate,
    resolveArt,
    systemDefaultArt
} from "./default-art-core.js";

const SETTING = "defaultActorArt";
const TEMPLATE = `modules/${MODULE_ID}/templates/default-art-config.hbs`;

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

function readConfig() {
    return normalizeArtConfig(game.settings.get(MODULE_ID, SETTING));
}

/** Everything in the world still showing placeholder art, as updates ready to apply. */
function findPlaceholders(config, previous = null) {
    const actors = [];
    for (const actor of game.actors) {
        const update = placeholderUpdate({ type: actor.type, img: actor.img, token: actor.prototypeToken?.texture?.src }, config, previous);
        if (update) actors.push({ actor, update });
    }

    const tokens = [];
    for (const scene of game.scenes) {
        const updates = [];
        for (const token of scene.tokens) {
            const src = placedTokenUpdate(token.actor?.type, token.texture?.src, config, previous);
            if (src) updates.push({ _id: token.id, "texture.src": src });
        }
        if (updates.length) tokens.push({ scene, updates });
    }

    return { actors, tokens };
}

async function applyPlaceholders({ actors, tokens }) {
    const actorUpdates = actors.map(({ actor, update }) => {
        const data = { _id: actor.id };
        if (update.img) data.img = update.img;
        if (update.token) data["prototypeToken.texture.src"] = update.token;
        return data;
    });
    if (actorUpdates.length) await Actor.updateDocuments(actorUpdates);
    for (const { scene, updates } of tokens) await scene.updateEmbeddedDocuments("Token", updates);
}

/**
 * Ask the GM whether to swap the placeholders found, and do it on confirmation.
 * @returns {Promise<boolean>} Whether anything was updated
 */
async function offerReplacement(config, previous = null, { quietWhenNone = false } = {}) {
    const found = findPlaceholders(config, previous);
    const tokenCount = found.tokens.reduce((sum, entry) => sum + entry.updates.length, 0);
    if (!found.actors.length && !tokenCount) {
        if (!quietWhenNone) ui.notifications.info("No actors or placed tokens use placeholder art.");
        return false;
    }

    const byType = Object.fromEntries(ART_TYPES.map(type => [type, 0]));
    for (const { actor } of found.actors) byType[actor.type] += 1;
    const rows = ART_TYPES.filter(type => byType[type])
        .map(type => `<li>${TYPE_LABELS[type]}: ${byType[type]}</li>`).join("");

    const confirmed = await DialogV2.confirm({
        window: { title: "Replace placeholder art", icon: "fa-solid fa-image" },
        content: `<p>${found.actors.length} actor(s) and ${tokenCount} placed token(s) still use placeholder art
            (Star Wars defaults, the generic silhouette${previous ? ", or the previous default art" : ""}).</p>
            ${rows ? `<ul>${rows}</ul>` : ""}
            <p>Replace it with the configured default art? Art that someone picked is not touched.</p>`,
        yes: { label: "Replace", icon: "fa-solid fa-check" },
        no: { label: "Leave as is" },
        rejectClose: false
    });
    if (!confirmed) return false;

    await applyPlaceholders(found);
    ui.notifications.info(`Replaced placeholder art on ${found.actors.length} actor(s) and ${tokenCount} placed token(s).`);
    return true;
}

/** Admin Panel: count and (after confirmation) replace Star Wars placeholders with the configured art. */
export function replacePlaceholderArt() {
    return offerReplacement(readConfig());
}

export class DefaultArtConfig extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "azecraft-default-art",
        tag: "form",
        classes: ["azecraft-default-art"],
        window: { title: "Default Actor Art", icon: "fa-solid fa-image-portrait", contentClasses: ["standard-form"] },
        position: { width: 620 },
        form: { handler: DefaultArtConfig.#onSubmit, closeOnSubmit: true },
        actions: {
            resetType: DefaultArtConfig.#onResetType,
            resetAll: DefaultArtConfig.#onResetAll,
            replaceExisting: DefaultArtConfig.#onReplaceExisting
        }
    };

    static PARTS = {
        form: { template: TEMPLATE },
        footer: { template: "templates/generic/form-footer.hbs" }
    };

    /** Unsaved edits survive re-renders (resets re-render the form). */
    #draft = null;

    async _prepareContext() {
        const config = this.#draft ?? readConfig();
        return {
            types: ART_TYPES.map(type => ({
                type,
                label: TYPE_LABELS[type],
                art: config[type].art,
                token: config[type].token,
                preview: resolveArt(config, type),
                systemArt: systemDefaultArt(type)
            })),
            buttons: [
                { type: "button", action: "replaceExisting", icon: "fa-solid fa-wand-magic-sparkles", label: "Replace placeholders on existing actors" },
                { type: "button", action: "resetAll", icon: "fa-solid fa-arrow-rotate-left", label: "Reset all" },
                { type: "submit", icon: "fa-solid fa-save", label: "Save" }
            ]
        };
    }

    _onChangeForm(formConfig, event) {
        super._onChangeForm(formConfig, event);
        this.#draft = this.#readForm();
        // Keep the previews in step with the paths.
        for (const type of ART_TYPES) {
            const art = resolveArt(this.#draft, type);
            const images = this.element.querySelectorAll(`[data-preview="${type}"] img`);
            if (images[0]) images[0].src = art.art;
            if (images[1]) images[1].src = art.token;
        }
    }

    #readForm() {
        const data = new foundry.applications.ux.FormDataExtended(this.element).object;
        return normalizeArtConfig(foundry.utils.expandObject(data));
    }

    static #onResetType(event, target) {
        const type = target.dataset.type;
        this.#draft = { ...this.#readForm(), [type]: defaultArtConfig()[type] };
        this.render();
    }

    static #onResetAll() {
        this.#draft = defaultArtConfig();
        this.render();
    }

    static async #onReplaceExisting() {
        const draft = this.#readForm();
        if (!foundry.utils.objectsEqual(draft, readConfig())) {
            ui.notifications.warn("Save the default art first, then replace the placeholders.");
            return;
        }
        await offerReplacement(draft);
    }

    static async #onSubmit(event, form, formData) {
        const previous = readConfig();
        const next = normalizeArtConfig(foundry.utils.expandObject(formData.object));
        this.#draft = null;
        if (foundry.utils.objectsEqual(previous, next)) return;
        await game.settings.set(MODULE_ID, SETTING, next);
        // Actors still showing the old default art are offered the new one.
        await offerReplacement(next, previous, { quietWhenNone: true });
    }
}

export function initDefaultArt() {
    game.settings.register(MODULE_ID, SETTING, {
        scope: "world",
        config: false,
        type: Object,
        default: defaultArtConfig()
    });
    game.settings.registerMenu(MODULE_ID, `${SETTING}Menu`, {
        name: "Default actor art",
        label: "Configure default art",
        hint: "Portrait and token art that new minions, rivals, nemeses, characters and vehicles get instead of the Star Wars placeholders.",
        icon: "fa-solid fa-image-portrait",
        type: DefaultArtConfig,
        restricted: true
    });

    Hooks.once("setup", () => foundry.applications.handlebars.loadTemplates([TEMPLATE]));

    // Runs after the system's _preCreate has filled in its Star Wars placeholder.
    Hooks.on("preCreateActor", (actor, data, options, userId) => {
        if (userId !== game.user.id) return;
        const update = placeholderUpdate({ type: actor.type, img: actor.img, token: actor.prototypeToken?.texture?.src }, readConfig());
        if (!update) return;
        const source = {};
        if (update.img) source.img = update.img;
        if (update.token) source["prototypeToken.texture.src"] = update.token;
        actor.updateSource(source);
    });
}
