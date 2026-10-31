/**
 * Item Maker (toolbar tab, everyone): make a weapon, armour, gear or an attachment, with stats, item
 * properties and an icon from the icon folders GMs allow. Its price is worked out from the price
 * table (GMs edit it in the Item Maker). New items go to the Item folder
 * "Item Maker › <creator's name>", owned by their creator and visible to everyone.
 *
 * Players may not create world Items or browse files (Foundry's default permissions), so their
 * requests go over the module socket to the active GM's client: it lists icon folders (only inside
 * the allowed folders) and creates the item from the form's plain values (item-maker-core.js builds
 * the data; nothing a client sends is used as Item data directly).
 */

import { SceneSpaceApp } from "../ui/scene-space.js";
import { PRICE_SECTIONS, PROPERTY_DEFAULTS, normalizeTable, priceBreakdown, priceHtml, propertyKey } from "./item-prices.js";
import {
    DEFAULT_ICON_PATHS,
    IMAGE_EXTENSIONS,
    MAKER_TYPES,
    NAME_MAX,
    DESCRIPTION_MAX,
    RANGES,
    SPECIAL_MAX,
    WEAPON_SKILLS,
    EFFECT_TARGET_TYPES,
    buildItemData,
    cleanFolderPath,
    defaultImage,
    emptyDraft,
    iconSource,
    isWithinRoots,
    normalizeDraft,
    searchProperties,
    similarItems,
    validateDraft
} from "./item-maker-core.js";

const MODULE_ID = "ffg-azecraft-addon";
const SOCKET = `module.${MODULE_ID}`;
const TEMPLATE = `modules/${MODULE_ID}/templates/item-maker/item-maker.hbs`;
const PATHS_SETTING = "itemMakerIconPaths";
const PRICES_SETTING = "itemMakerPriceTable";
/** The system's item helpers (served by Foundry; not resolvable at lint time). */
const SYSTEM_ITEM_HELPERS = "/systems/starwarsffg/modules/helpers/item-helpers.js";
const FOLDER_FLAG = "itemMakerFolder";
const ITEM_FLAG = "itemMaker";
const REQUEST_TIMEOUT = 20000;
/** Icons shown at once in a folder (the filter narrows the rest). */
const ICON_LIMIT = 300;

/* -------------------------------------------- */
/*  Settings and lists                          */
/* -------------------------------------------- */

export function iconRoots() {
    const stored = game.settings.get(MODULE_ID, PATHS_SETTING);
    const list = (Array.isArray(stored) ? stored : DEFAULT_ICON_PATHS).map(cleanFolderPath).filter(Boolean);
    return [...new Set(list)];
}

/** What an attachment fits (the system's CONFIG.FFG.itemmodifier_types), as {value, label}. */
function attachmentKinds() {
    const types = CONFIG.FFG?.itemmodifier_types ?? { all: { value: "all", label: "All" } };
    return Object.entries(types).map(([key, entry]) => ({ value: entry?.value ?? key, label: game.i18n.localize(entry?.label ?? key) }));
}

function normalize(raw) {
    return normalizeDraft(raw, { attachmentTypes: attachmentKinds().map(t => t.value) });
}

/** Weapon skills: the usual ones plus any other skill a world weapon uses. */
function weaponSkills() {
    const used = game.items.filter(item => item.type === "weapon").map(item => item.system?.skill?.value).filter(Boolean);
    return [...new Set([...WEAPON_SKILLS, ...used])];
}

/** Whether only GMs can edit an item (no player owns it, by default or by name). */
function gmOnly(item) {
    const owner = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    if ((item.ownership?.default ?? 0) >= owner) return false;
    return !Object.entries(item.ownership ?? {}).some(([id, level]) => id !== "default" && level >= owner && game.users.get(id) && !game.users.get(id).isGM);
}

/**
 * World property items (type itemmodifier) the maker offers, one per name; ones in an "Item
 * Properties" folder win. Only properties no player can edit, so nobody can slip changed stats into
 * other people's items.
 */
export function propertyItems() {
    const byName = new Map();
    const inPropertyFolder = item => /propert/i.test(item.folder?.name ?? "");
    for (const item of game.items.filter(i => i.type === "itemmodifier" && gmOnly(i))) {
        const key = item.name.trim().toLowerCase();
        const existing = byName.get(key);
        if (!existing || (!inPropertyFolder(existing) && inPropertyFolder(item))) byName.set(key, item);
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The price table: the GMs' values where set, the defaults elsewhere. */
export function priceTable() {
    return normalizeTable(game.settings.get(MODULE_ID, PRICES_SETTING));
}

/** A draft's price, line by line, from the price table and the chosen properties' names. */
function draftPrice(draft, table = priceTable()) {
    const props = new Map(propertyItems().map(item => [item.id, item]));
    const chosen = draft.properties.filter(p => props.has(p.id)).map(p => ({ name: props.get(p.id).name, rank: p.rank }));
    return priceBreakdown(draft, table, chosen);
}

/**
 * What GMs saved in the price table: only values that differ from the defaults, so later default
 * changes still reach rows nobody changed.
 */
function tableChanges(values, properties) {
    const changed = { values: {}, properties: {} };
    for (const row of PRICE_SECTIONS.flatMap(section => section.rows)) {
        if (values[row.key] !== row.value) changed.values[row.key] = values[row.key];
    }
    for (const [key, entry] of Object.entries(properties)) {
        const fallback = PROPERTY_DEFAULTS[key] ?? { flat: 0, perRank: values.otherProperty };
        if (entry.flat !== fallback.flat || entry.perRank !== fallback.perRank) changed.properties[key] = entry;
    }
    return changed;
}

function plainText(html) {
    return String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\[[A-Z]{2}\]/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/* -------------------------------------------- */
/*  Requests (players relay through the GM)     */
/* -------------------------------------------- */

const pending = new Map();

function isActiveGM() {
    return game.user.isGM && game.user === game.users.activeGM;
}

/** Ask the active GM's client; resolves with its reply or rejects after a timeout. */
function ask(type, payload) {
    if (!game.users.activeGM) return Promise.reject(new Error("A GM needs to be online for this."));
    const requestId = foundry.utils.randomID(16);
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pending.delete(requestId);
            reject(new Error("No answer from the GM's client. Try again in a moment."));
        }, REQUEST_TIMEOUT);
        pending.set(requestId, { resolve, reject, timer });
        game.socket.emit(SOCKET, { type, requestId, ...payload }, { recipients: [game.users.activeGM.id] });
    });
}

function answer(message) {
    const request = pending.get(message.requestId);
    if (!request || message.userId !== game.user.id) return;
    clearTimeout(request.timer);
    pending.delete(message.requestId);
    if (message.error) request.reject(new Error(message.error));
    else request.resolve(message.result);
}

/** One GM task at a time, so two requests never both create the same folder. */
let gmQueue = Promise.resolve();
function queueGM(task) {
    const run = gmQueue.then(task);
    gmQueue = run.catch(() => {});
    return run;
}

/**
 * Icons and subfolders of a folder inside the allowed icon folders. For a player (relayed), folders
 * Foundry marks private are left out, as Foundry's own file browser does for them.
 */
async function browse(path, { forPlayer = false } = {}) {
    const clean = cleanFolderPath(path);
    if (!clean || !isWithinRoots(clean, iconRoots())) throw new Error("That folder is not one of the icon folders.");
    if (forPlayer && clean.split("/").some((_, i, parts) => privateDirs.has(parts.slice(0, i + 1).join("/")))) throw new Error("That folder is private.");
    const result = await foundry.applications.apps.FilePicker.implementation.browse(iconSource(clean), clean, { extensions: IMAGE_EXTENSIONS });
    const hidden = new Set((result.privateDirs ?? []).map(cleanFolderPath));
    for (const dir of hidden) privateDirs.add(dir);
    const within = p => isWithinRoots(p, iconRoots());
    return {
        dirs: (result.dirs ?? []).filter(within).filter(dir => !forPlayer || !hidden.has(cleanFolderPath(dir))).sort(),
        files: (result.files ?? []).filter(file => within(file.split("/").slice(0, -1).join("/"))).sort()
    };
}

/** Private folders seen while browsing (GM side), so a player cannot open one by its path. */
const privateDirs = new Set();

export async function listIcons(path) {
    if (game.user.can("FILES_BROWSE")) return browse(path);
    return ask("itemMakerBrowse", { path });
}

/** The "Item Maker" Item folder and the creator's folder in it (GM). */
async function makerFolder(user) {
    let root = game.folders.find(f => f.type === "Item" && f.getFlag(MODULE_ID, FOLDER_FLAG) === "root");
    root ??= await Folder.implementation.create({ name: "Item Maker", type: "Item", color: "#1b3a57", sorting: "a", flags: { [MODULE_ID]: { [FOLDER_FLAG]: "root" } } });
    // Found by its flag, wherever a GM moved it.
    const mine = game.folders.find(f => f.type === "Item" && f.getFlag(MODULE_ID, FOLDER_FLAG) === user.id);
    return mine ?? Folder.implementation.create({ name: user.name, type: "Item", folder: root.id, sorting: "a", flags: { [MODULE_ID]: { [FOLDER_FLAG]: user.id } } });
}

/** Create an item for `user` from a draft (GM side); the price is worked out here. Returns the new Item. */
async function createFor(rawDraft, user) {
    const draft = normalize(rawDraft);
    const errors = validateDraft(draft);
    if (errors.length) throw new Error(errors.join(" "));
    // Only icons from the allowed folders, or the type's default image.
    if (draft.img && !isWithinRoots(draft.img.split("/").slice(0, -1).join("/"), iconRoots()) && draft.img !== defaultImage(draft.type)) draft.img = "";

    const price = draftPrice(draft);
    const properties = new Map(propertyItems().filter(item => draft.properties.some(p => p.id === item.id)).map(item => [item.id, item.toObject()]));
    const folder = await makerFolder(user);
    const ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER, [user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER };
    const data = buildItemData(draft, {
        properties,
        newId: () => foundry.utils.randomID(),
        folder: folder.id,
        ownership,
        price: { total: price.total, html: priceHtml(price, { maker: user.name }) },
        flags: { [MODULE_ID]: { [ITEM_FLAG]: {
            createdBy: user.id,
            createdAt: new Date().toISOString(),
            price
        } } }
    });
    const item = await Item.implementation.create(data);
    await copyPropertyEffects(item, draft, properties);
    return item;
}

/**
 * The properties' Active Effects on the new item, as the system's item sheet adds them when a
 * property is dropped on armour, a weapon or an attachment (including syncing them to the ranks).
 */
async function copyPropertyEffects(item, draft, properties) {
    if (!EFFECT_TARGET_TYPES.has(item.type)) return;
    const effects = draft.properties.flatMap(({ id }) => (properties.get(id)?.effects ?? []).map(effect => {
        const copy = foundry.utils.deepClone(effect);
        delete copy._id;
        return copy;
    }));
    if (!effects.length) return;
    try {
        const created = await item.createEmbeddedDocuments("ActiveEffect", effects);
        const { default: ItemHelpers } = await import(SYSTEM_ITEM_HELPERS);
        await ItemHelpers.syncAEStatus(item, created);
    } catch (error) {
        console.warn("Azecraft | Item Maker: could not copy property effects", error);
    }
}

/**
 * Create an item from a draft: on the active GM's client (queued), else through it.
 * @returns {Promise<Item|null>}
 */
export async function createItem(draft) {
    if (isActiveGM() || (game.user.isGM && !game.users.activeGM)) return queueGM(() => createFor(draft, game.user));
    // Other GMs go through the active GM too, so two GMs never create the same folder at once.
    const { uuid } = await ask("itemMakerCreate", { draft });
    return fromUuid(uuid);
}

function onSocket(message, senderId) {
    // Replies only count from a GM (anyone could send a message with the right request id).
    if (message?.type === "itemMakerReply") return game.users.get(senderId)?.isGM ? answer(message) : undefined;
    if (!isActiveGM()) return;
    const user = game.users.get(senderId);
    if (!user || user.isSelf) return;
    const reply = (result, error) => game.socket.emit(SOCKET, { type: "itemMakerReply", requestId: message.requestId, userId: user.id, result, error }, { recipients: [user.id] });

    if (message.type === "itemMakerBrowse") {
        browse(message.path, { forPlayer: !user.isGM }).then(result => reply(result), error => reply(null, error.message));
    } else if (message.type === "itemMakerCreate") {
        queueGM(() => createFor(message.draft ?? {}, user))
            .then(item => reply({ uuid: item.uuid }), error => {
                console.warn("Azecraft | Item Maker: could not create an item", error);
                reply(null, error.message || "The item could not be created.");
            });
    }
}

/* -------------------------------------------- */
/*  Window                                      */
/* -------------------------------------------- */

export class ItemMakerApp extends SceneSpaceApp {
    static DEFAULT_OPTIONS = {
        id: "azecraft-item-maker",
        classes: ["azecraft-item-maker"],
        window: { title: "Item Maker", icon: "fa-solid fa-hammer" },
        actions: {
            setType: ItemMakerApp.#onSetType,
            togglePicker: ItemMakerApp.#onTogglePicker,
            pickIcon: ItemMakerApp.#onPickIcon,
            openFolder: ItemMakerApp.#onOpenFolder,
            addProperty: ItemMakerApp.#onAddProperty,
            removeProperty: ItemMakerApp.#onRemoveProperty,
            openItem: ItemMakerApp.#onOpenItem,
            create: ItemMakerApp.#onCreate,
            reset: ItemMakerApp.#onReset,
            addRoot: ItemMakerApp.#onAddRoot,
            removeRoot: ItemMakerApp.#onRemoveRoot,
            browseRoot: ItemMakerApp.#onBrowseRoot,
            showPrices: ItemMakerApp.#onShowPrices,
            savePrices: ItemMakerApp.#onSavePrices,
            resetPrices: ItemMakerApp.#onResetPrices
        }
    };

    static PARTS = {
        body: { template: TEMPLATE, scrollable: [".azim-form", ".azim-icons", ".azim-prices"] }
    };

    /** The form, kept across renders (and while the window is closed, until it is cleared). */
    static draft = emptyDraft("weapon");

    picker = { root: null, path: null, dirs: [], files: [], filter: "", loading: false, error: "", more: 0 };
    busy = "";
    rootsOpen = false;
    propertyQuery = "";
    /** "form", or "prices" for the price table. */
    view = "form";
    #listings = new Map();

    get draft() {
        return ItemMakerApp.draft;
    }

    set draft(value) {
        ItemMakerApp.draft = value;
    }

    async _prepareContext() {
        if (this.view === "prices") return this.#pricesContext();
        const draft = this.draft;
        const definition = MAKER_TYPES[draft.type];
        const roots = iconRoots();
        if (!this.picker.root || !roots.includes(this.picker.root)) {
            this.picker.root = roots[0] ?? null;
            this.picker.path = this.picker.root;
            if (this.picker.root) this.#load(this.picker.root);
        }
        const groups = Object.fromEntries(definition.groups.map(group => [group, true]));
        const props = new Map(propertyItems().map(item => [item.id, item]));
        const filter = this.picker.filter.trim().toLowerCase();
        const files = this.picker.files.filter(path => !filter || path.toLowerCase().split("/").pop().includes(filter));
        const rootParts = (this.picker.root ?? "").split("/").length;
        const parts = (this.picker.path ?? "").split("/");

        return {
            appId: this.id,
            draft,
            types: Object.entries(MAKER_TYPES).map(([key, t]) => ({ key, ...t, selected: key === draft.type })),
            typeLabel: definition.label.toLowerCase(),
            img: draft.img || defaultImage(draft.type),
            groups,
            hasGroups: definition.groups.length > 0,
            skills: weaponSkills(),
            ranges: RANGES,
            attachmentTypes: attachmentKinds(),
            hasProperties: definition.properties,
            properties: draft.properties.map(p => {
                const item = props.get(p.id);
                return { ...p, name: item?.name ?? "Missing property", tooltip: plainText(item?.system?.description).slice(0, 300) };
            }),
            limits: { name: NAME_MAX, description: DESCRIPTION_MAX, special: SPECIAL_MAX },
            canSingleUse: ["weapon", "gear"].includes(draft.type),
            userName: game.user.name,
            busy: this.busy,
            isGM: game.user.isGM,
            worldId: game.world.id,
            rootsOpen: this.rootsOpen,
            iconRoots: roots,
            crumbs: parts.slice(rootParts - 1).map((name, index) => ({
                name: index === 0 ? this.picker.root : name,
                path: parts.slice(0, rootParts + index).join("/")
            })),
            picker: {
                ...this.picker,
                dirs: this.picker.dirs.map(path => ({ path, name: decodeURIComponent(path.split("/").pop()) })),
                files: files.slice(0, ICON_LIMIT).map(path => ({ path, name: decodeURIComponent(path.split("/").pop()), selected: path === draft.img })),
                more: Math.max(0, files.length - ICON_LIMIT)
            }
        };
    }

    /** The price table: every row, and a row per world property (GMs edit, players read). */
    #pricesContext() {
        const table = priceTable();
        const keys = [...new Set(propertyItems().map(item => propertyKey(item.name)))].sort();
        return {
            pricesView: true,
            isGM: game.user.isGM,
            busy: this.busy,
            sections: PRICE_SECTIONS.map(section => ({
                ...section,
                rows: section.rows.map(row => ({ ...row, current: table.values[row.key], changed: table.values[row.key] !== row.value }))
            })),
            properties: keys.map(key => {
                const entry = table.properties[key] ?? { flat: 0, perRank: table.values.otherProperty };
                const fallback = PROPERTY_DEFAULTS[key] ?? { flat: 0, perRank: table.values.otherProperty };
                return { key, label: key.replace(/(^|[\s-])\p{L}/gu, c => c.toUpperCase()), ...entry, changed: entry.flat !== fallback.flat || entry.perRank !== fallback.perRank };
            })
        };
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        const root = this.element;
        const form = root.querySelector(".azim-form");
        if (!form) return;
        // Typing updates the draft without re-rendering (focus and caret stay).
        form.addEventListener("input", event => this.#readField(event.target));
        form.addEventListener("change", event => this.#readField(event.target));
        form.addEventListener("submit", event => event.preventDefault());

        // The property search keeps its text, results and focus across re-renders (e.g. when an icon
        // listing arrives from the GM while someone is typing).
        const search = root.querySelector("[data-azim-prop-search]");
        if (search && this.propertyQuery) {
            search.value = this.propertyQuery;
            this.#showPropertyResults(this.propertyQuery);
        }
        search?.addEventListener("input", () => {
            this.propertyQuery = search.value;
            this.#showPropertyResults(search.value);
        });
        search?.addEventListener("keydown", event => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            root.querySelector("[data-azim-prop-results] [data-action=addProperty]")?.click();
        });

        root.querySelector("[data-azim-root]")?.addEventListener("change", event => this.#openFolder(event.target.value, true));
        root.querySelector("[data-azim-icon-filter]")?.addEventListener("input", foundry.utils.debounce(event => {
            this.picker.filter = event.target.value;
            this.render({ parts: ["body"] }).then(() => {
                const input = this.element.querySelector("[data-azim-icon-filter]");
                input?.focus();
                input?.setSelectionRange(input.value.length, input.value.length);
            });
        }, 250));
        root.querySelector(".azim-roots")?.addEventListener("toggle", event => { this.rootsOpen = event.target.open; });
        this.#showSimilar();
        this.#showPrice();
    }

    /** The price, line by line, under the stats; updated as the form changes. */
    #showPrice() {
        const box = this.element?.querySelector("[data-azim-price]");
        if (!box) return;
        const { lines, total } = draftPrice(this.draft);
        const escape = foundry.utils.escapeHTML;
        const format = value => `${value < 0 ? "−" : ""}${Math.abs(value).toLocaleString()}`;
        box.querySelector("[data-azim-price-lines]").innerHTML = lines.map(line => `<li><span>${escape(line.label)}</span><span>${format(line.amount)}</span></li>`).join("")
            || '<li class="azim-muted"><span>Add stats, properties or a base price.</span></li>';
        box.querySelector("[data-azim-price-total]").textContent = total.toLocaleString();
    }

    #readField(input) {
        const name = input?.name;
        if (input?.dataset.azimRank) {
            const id = input.dataset.azimRank;
            this.draft = normalize({ ...this.draft, properties: this.draft.properties.map(p => (p.id === id ? { ...p, rank: input.value } : p)) });
            this.#showPrice();
            return;
        }
        if (!name) return;
        const value = input.type === "checkbox" ? input.checked : input.value;
        // Keep exactly what is typed in text fields; numbers and choices are cleaned.
        const next = normalize({ ...this.draft, [name]: value });
        if (input.type === "text" || input.tagName === "TEXTAREA") next[name] = String(value).slice(0, input.maxLength > 0 ? input.maxLength : undefined);
        this.draft = next;
        if (name === "name") this.#showSimilar();
        else this.#showPrice();
    }

    /** Similarly named items the user can see, under the name field. */
    #showSimilar() {
        const box = this.element?.querySelector("[data-azim-similar]");
        if (!box) return;
        const visible = game.items.filter(item => item.testUserPermission(game.user, "LIMITED"))
            .map(item => ({ id: item.id, uuid: item.uuid, name: item.name, type: item.type, img: item.img, folder: item.folder?.name ?? "" }));
        const found = similarItems(this.draft.name, visible);
        const escape = foundry.utils.escapeHTML;
        box.hidden = !found.length;
        box.querySelector("[data-azim-similar-list]").innerHTML = found.map(item => `<li>
            <button type="button" data-action="openItem" data-uuid="${escape(item.uuid)}" data-tooltip="Open ${escape(item.name)}">
                <img src="${escape(item.img || defaultImage(item.type))}" alt=""> <span class="azim-similar-name">${escape(item.name)}</span>
                <span class="azim-muted">${escape(MAKER_TYPES[item.type]?.label ?? item.type)}${item.folder ? ` · ${escape(item.folder)}` : ""}</span>
            </button></li>`).join("");
    }

    #showPropertyResults(query) {
        const list = this.element?.querySelector("[data-azim-prop-results]");
        if (!list) return;
        const chosen = new Set(this.draft.properties.map(p => p.id));
        const found = query.trim() ? searchProperties(query, propertyItems().filter(item => !chosen.has(item.id))) : [];
        const escape = foundry.utils.escapeHTML;
        list.hidden = !found.length;
        list.innerHTML = found.map(item => `<li><button type="button" data-action="addProperty" data-id="${escape(item.id)}" data-tooltip="${escape(plainText(item.system?.description).slice(0, 300))}">
            <i class="fa-solid fa-plus" inert></i> ${escape(item.name)}</button></li>`).join("");
    }

    /** Show a folder's listing: at once when it was listed before, otherwise when it arrives. */
    async #load(path) {
        this.picker.error = "";
        const cached = this.#listings.get(path);
        if (cached) {
            this.picker.dirs = cached.dirs;
            this.picker.files = cached.files;
            this.picker.loading = false;
            return;
        }
        this.picker.loading = true;
        try {
            const listing = await listIcons(path);
            this.#listings.set(path, listing);
            if (this.picker.path !== path) return;
            this.picker.dirs = listing.dirs;
            this.picker.files = listing.files;
        } catch (error) {
            if (this.picker.path !== path) return;
            this.picker.dirs = [];
            this.picker.files = [];
            this.picker.error = error.message || "Could not list this folder.";
        } finally {
            if (this.picker.path === path) {
                this.picker.loading = false;
                if (this.rendered) this.render({ parts: ["body"] });
            }
        }
    }

    #openFolder(path, isRoot = false) {
        if (isRoot) this.picker.root = path;
        this.picker.path = path;
        this.picker.filter = "";
        this.picker.dirs = [];
        this.picker.files = [];
        this.#load(path);
        this.render({ parts: ["body"] });
    }

    /** Forget folder listings when the window reopens, so new icons show up. */
    _onClose(options) {
        this.#listings.clear();
        super._onClose(options);
    }

    /* Actions */

    static #onSetType(event, target) {
        this.draft = normalize({ ...this.draft, type: target.dataset.type });
        this.render({ parts: ["body"] });
    }

    static #onTogglePicker() {
        this.element.querySelector(".azim-picker")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        this.element.querySelector("[data-azim-icon-filter]")?.focus();
    }

    static #onPickIcon(event, target) {
        this.draft = { ...this.draft, img: target.dataset.path };
        this.render({ parts: ["body"] });
    }

    static #onOpenFolder(event, target) {
        this.#openFolder(target.dataset.path);
    }

    static #onAddProperty(event, target) {
        if (this.draft.properties.some(p => p.id === target.dataset.id)) return;
        this.draft = normalize({ ...this.draft, properties: [...this.draft.properties, { id: target.dataset.id, rank: 1 }] });
        this.propertyQuery = "";
        this.render({ parts: ["body"] }).then(() => this.element.querySelector("[data-azim-prop-search]")?.focus());
    }

    static #onRemoveProperty(event, target) {
        this.draft = normalize({ ...this.draft, properties: this.draft.properties.filter(p => p.id !== target.dataset.id) });
        this.render({ parts: ["body"] });
    }

    static async #onOpenItem(event, target) {
        const item = await fromUuid(target.dataset.uuid);
        item?.sheet?.render(true);
    }

    static #onReset() {
        this.draft = emptyDraft(this.draft.type);
        this.render({ parts: ["body"] });
    }

    static async #onCreate() {
        if (this.busy) return;
        const draft = normalize(this.draft);
        const errors = validateDraft(draft);
        if (errors.length) {
            ui.notifications.warn(errors.join(" "));
            this.element.querySelector("input[name=name]")?.focus();
            return;
        }
        this.busy = "Creating…";
        this.render({ parts: ["body"] });
        try {
            const item = await createItem(draft);
            ui.notifications.info(`Created ${item?.name ?? draft.name} in Item Maker › ${game.user.name}.`);
            item?.sheet?.render(true);
            // A fresh form of the same type; the icon folder stays where it was.
            this.draft = emptyDraft(draft.type);
        } catch (error) {
            ui.notifications.error(error.message || "The item could not be created.");
        } finally {
            this.busy = "";
            if (this.rendered) this.render({ parts: ["body"] });
        }
    }

    /** Switch between the form and the price table. */
    static #onShowPrices() {
        this.view = this.view === "prices" ? "form" : "prices";
        this.render({ parts: ["body"] });
    }

    static async #onSavePrices() {
        if (!game.user.isGM) return;
        const read = selector => [...this.element.querySelectorAll(selector)];
        const raw = { values: {}, properties: {} };
        for (const input of read("[data-price-row]")) raw.values[input.dataset.priceRow] = input.value;
        for (const input of read("[data-price-property]")) {
            const key = input.dataset.priceProperty;
            raw.properties[key] = { ...raw.properties[key], [input.dataset.field]: input.value };
        }
        // Rows for properties no longer in the world keep what was saved for them.
        const stored = game.settings.get(MODULE_ID, PRICES_SETTING) ?? {};
        const table = normalizeTable({ values: raw.values, properties: { ...(stored.properties ?? {}), ...raw.properties } });
        await game.settings.set(MODULE_ID, PRICES_SETTING, tableChanges(table.values, table.properties));
        ui.notifications.info("Price table saved.");
    }

    static async #onResetPrices() {
        if (!game.user.isGM) return;
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: "Reset the price table" },
            content: "<p>Put every price in the table back to the module's defaults?</p>"
        });
        if (confirmed) await game.settings.set(MODULE_ID, PRICES_SETTING, {});
    }

    static async #onAddRoot() {
        if (!game.user.isGM) return;
        const input = this.element.querySelector("[data-azim-root-input]");
        const path = cleanFolderPath(input?.value);
        if (!path) {
            ui.notifications.warn("Enter a folder path such as icons/weapons or worlds/<world>/icons.");
            return;
        }
        this.rootsOpen = true;
        await game.settings.set(MODULE_ID, PATHS_SETTING, [...new Set([...iconRoots(), path])]);
    }

    static async #onRemoveRoot(event, target) {
        if (!game.user.isGM) return;
        this.rootsOpen = true;
        await game.settings.set(MODULE_ID, PATHS_SETTING, iconRoots().filter(root => root !== target.dataset.path));
    }

    static #onBrowseRoot() {
        if (!game.user.isGM) return;
        const input = this.element.querySelector("[data-azim-root-input]");
        new foundry.applications.apps.FilePicker.implementation({
            type: "folder",
            current: input?.value || "icons",
            callback: path => { if (input) input.value = path; }
        }).render(true);
    }
}

/* -------------------------------------------- */
/*  Setup                                       */
/* -------------------------------------------- */

export function initItemMaker() {
    game.settings.register(MODULE_ID, PATHS_SETTING, {
        name: "Item Maker icon folders",
        scope: "world",
        config: false,
        type: Array,
        default: DEFAULT_ICON_PATHS,
        onChange: () => foundry.applications.instances.get(ItemMakerApp.DEFAULT_OPTIONS.id)?.render()
    });
    // Only the GMs' changes to the default prices (item-prices.js); edited in the Item Maker.
    game.settings.register(MODULE_ID, PRICES_SETTING, {
        name: "Item Maker price table",
        scope: "world",
        config: false,
        type: Object,
        default: {},
        onChange: () => foundry.applications.instances.get(ItemMakerApp.DEFAULT_OPTIONS.id)?.render()
    });
    Hooks.once("setup", () => foundry.applications.handlebars.loadTemplates([TEMPLATE]));
    Hooks.once("ready", () => game.socket.on(SOCKET, onSocket));
}
