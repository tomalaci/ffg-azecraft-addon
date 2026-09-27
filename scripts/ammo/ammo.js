/**
 * Ammunition upgrades on weapons (see ammo-catalog.js for the rules).
 *
 * - The consumables are the world's ammo gear items ("Incendiary Ammo", "AP Ammo", ...), matched by
 *   name. Applying one to a weapon uses one up; a GM may also apply ammo nobody carries.
 * - The applied ammo is a flag on the weapon (`ammo: {type}`), not an attachment, so it costs no
 *   hardpoints. It stays until someone clicks "Run out" (the GM's ⚙⚙⚙ / Despair call).
 * - The weapon's quality summary, which the item sheet and the roll chat card show, includes the
 *   ammo's quality at the rules' rating (e.g. Burn 2, or +1 to an existing Burn).
 */

import { AMMO_TYPES, ammoForItemName, findAmmo, qualityKey, withAmmoQualities } from "./ammo-catalog.js";

const MODULE_ID = "ffg-azecraft-addon";
const FLAG = "ammo";
const ACTOR_TYPES = new Set(["character"]);
const PATCHED = Symbol("azecraftAmmo");

const { DialogV2 } = foundry.applications.api;

/**
 * Write the weapon's ammo flag. starwarsffg's ItemBaseFFG.update adds `flags: {}` to any update
 * without a top-level `flags` key, which wipes dotted flag keys (so setFlag/unsetFlag do nothing
 * on its items); a nested `flags` object survives.
 */
function writeAmmo(weapon, type) {
    const value = type ? { [FLAG]: { type } } : { [`-=${FLAG}`]: null };
    return weapon.update({ flags: { [MODULE_ID]: value } });
}

export function appliedAmmo(weapon) {
    return weapon?.type === "weapon" ? findAmmo(weapon.getFlag(MODULE_ID, FLAG)?.type) : null;
}

/** Quality items in the world by qualityKey, so an added quality links to its description. */
function knownQualities() {
    const known = {};
    for (const item of game.items) {
        if (item.type === "itemmodifier") known[qualityKey(item.name)] ??= { name: item.name, img: item.img, description: item.system.description };
    }
    return known;
}

/** Ammo gear the actor carries, by ammo type id: [{item, quantity}]. */
function carriedAmmo(actor) {
    const carried = {};
    for (const item of actor.items) {
        const ammo = item.type === "gear" ? ammoForItemName(item.name) : null;
        const quantity = Number(item.system.quantity?.value ?? 1);
        if (ammo && quantity > 0) (carried[ammo.id] ??= []).push({ item, quantity });
    }
    return carried;
}

/** Wrap the item sheets' quality summary (used by the item sheet and the weapon chat card). */
function patchQualitySummary() {
    const classes = new Set(Object.values(CONFIG.Item.sheetClasses.weapon ?? {}).map(entry => entry.cls));
    for (const cls of classes) {
        let proto = cls?.prototype;
        while (proto && !Object.hasOwn(proto, "_getSummarizedQualities")) proto = Object.getPrototypeOf(proto);
        if (!proto || proto._getSummarizedQualities[PATCHED]) continue;
        const original = proto._getSummarizedQualities;
        const wrapped = function (data) {
            const result = original.call(this, data);
            const ammo = appliedAmmo(this.item);
            const summary = result?.data?.doNotSubmit;
            if (ammo && summary) summary.qualities = withAmmoQualities(summary.qualities, ammo, knownQualities());
            return result;
        };
        wrapped[PATCHED] = true;
        proto._getSummarizedQualities = wrapped;
    }
}

/** The weapon's rating for the ammo's quality, from the same summary the chat card uses. */
async function ratingText(weapon, ammo) {
    try {
        const data = await weapon.sheet.getData();
        const quality = data?.data?.doNotSubmit?.qualities?.find(q => qualityKey(q.name) === qualityKey(ammo.quality));
        return quality ? `${ammo.quality} ${quality.totalRanks}` : ammo.quality;
    } catch {
        return ammo.quality;
    }
}

async function announce(actor, content) {
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="azam-chat">${content}</div>` });
}

async function applyAmmo(actor, weapon) {
    const carried = carriedAmmo(actor);
    const isGM = game.user.isGM;
    const current = appliedAmmo(weapon);
    const rows = AMMO_TYPES.map(ammo => {
        const count = (carried[ammo.id] ?? []).reduce((sum, entry) => sum + entry.quantity, 0);
        const usable = count > 0 || isGM;
        const rule = `${ammo.quality} ${ammo.gain}, or +${ammo.increase} to an existing ${ammo.quality}`;
        return `<label class="azam-option ${usable ? "" : "azam-option--none"}">
            <input type="radio" name="ammo" value="${ammo.id}" ${usable ? "" : "disabled"}>
            <span class="azam-option-name">${ammo.label}</span>
            <span class="azam-option-rule">${rule}</span>
            <span class="azam-option-count">${count ? `${count} carried` : isGM ? "none carried (GM)" : "none carried"}</span>
        </label>`;
    }).join("");

    const type = await DialogV2.prompt({
        window: { title: `Apply ammo: ${weapon.name}`, icon: "fa-solid fa-bullseye" },
        position: { width: 460 },
        content: `<p>Spend a maneuver to apply an ammunition upgrade. It uses up one you carry, and the weapon keeps it until it runs out.${current ? ` It replaces the <strong>${current.label} Ammo</strong> loaded now.` : ""}</p>
            <div class="azam-options">${rows}</div>`,
        ok: {
            label: "Apply",
            icon: "fa-solid fa-check",
            callback: (event, button) => button.form.elements.ammo?.value || null
        },
        rejectClose: false
    });
    const ammo = findAmmo(type);
    if (!ammo) return;

    const source = carried[ammo.id]?.[0];
    if (!source && !isGM) return;
    if (source) {
        if (source.quantity > 1) await source.item.update({ "system.quantity.value": source.quantity - 1 });
        else await source.item.delete();
    }
    await writeAmmo(weapon, ammo.id);
    const esc = foundry.utils.escapeHTML;
    await announce(actor, `<strong>${esc(weapon.name)}</strong> loaded with <strong>${ammo.label} Ammo</strong>: ${await ratingText(weapon, ammo)}.${ammo.note ? ` ${ammo.note}` : ""}${source ? "" : " <em>(applied by the GM, none used up)</em>"}`);
}

async function runOut(actor, weapon) {
    const ammo = appliedAmmo(weapon);
    if (!ammo) return;
    await writeAmmo(weapon, null);
    await announce(actor, `<strong>${foundry.utils.escapeHTML(weapon.name)}</strong> ran out of <strong>${ammo.label} Ammo</strong>.`);
}

function decorateWeaponRows(app, root) {
    const actor = app.actor;
    const canEdit = actor.isOwner;
    for (const row of root.querySelectorAll("li.item[data-item-id]")) {
        const weapon = actor.items.get(row.dataset.itemId);
        if (weapon?.type !== "weapon") continue;
        const name = row.querySelector(".item-name .hover") ?? row.querySelector(".item-name");
        if (!name || name.querySelector(".azam")) continue;

        const ammo = appliedAmmo(weapon);
        const line = document.createElement("span");
        line.className = "azam";
        if (ammo) {
            line.innerHTML = `<span class="azam-chip" data-tooltip="${ammo.label} Ammo: ${ammo.quality} ${ammo.gain}, or +${ammo.increase} to an existing ${ammo.quality}.${ammo.note ? ` ${ammo.note}` : ""}">
                <i class="fa-solid fa-bullseye" inert></i> ${ammo.label} ammo</span>`
                + (canEdit ? `<a class="azam-action" data-azam="out" data-tooltip="The weapon ran out of this ammo (e.g. the GM spent three Threat or a Despair)">Run out</a>` : "");
        } else if (canEdit) {
            line.innerHTML = `<a class="azam-action" data-azam="apply" data-tooltip="Apply an ammunition upgrade (a maneuver)"><i class="fa-solid fa-plus" inert></i> Ammo</a>`;
        }
        if (!line.innerHTML) continue;
        name.append(line);

        line.addEventListener("click", event => {
            const action = event.target.closest("[data-azam]")?.dataset.azam;
            if (!action) return;
            // The row's own click handler would open the weapon's details.
            event.stopPropagation();
            event.preventDefault();
            if (action === "apply") applyAmmo(actor, weapon);
            else if (action === "out") runOut(actor, weapon);
        });
    }
}

export function initAmmo() {
    // starwarsffg registers its item sheets late in its own init (after awaits); patch once they exist.
    Hooks.once("setup", patchQualitySummary);
    Hooks.once("ready", patchQualitySummary);

    // ActorSheet is an Application V1 sheet in starwarsffg 2.0: html is a jQuery object.
    Hooks.on("renderActorSheet", (app, html) => {
        if (!ACTOR_TYPES.has(app.actor?.type)) return;
        const root = app.element?.[0] ?? html?.[0];
        if (root) decorateWeaponRows(app, root);
    });
}
