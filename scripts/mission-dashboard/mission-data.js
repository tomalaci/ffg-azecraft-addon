/**
 * Mission tabs (current objective, mission summary, key intel) and People of Note.
 *
 * Each tab shows one ledger (a module-managed Journal) at a time: the viewer's own choice, else the
 * configured default, else the most recent ledger. Its pages are the entries, oldest first, and the
 * newest is shown by default. Access is checked per user (page ownership inherits from its Journal)
 * before any content is enriched or inserted; ledgers and entries a player cannot read are left out.
 */

import { OWNERSHIP } from "./constants.js";
import { chooseLedger, ledgerPages, visibleLedgers } from "./ledgers.js";

export const SUPPORTED_PAGE_TYPES = new Set(["text", "image"]);

/**
 * Decide what a user may see of a referenced page. Pure: works on any page-like object.
 * @returns {"unassigned"|"missing"|"restricted"|"unsupported"|"available"}
 */
export function pageAccess(uuid, page, user) {
    if (!uuid) return "unassigned";
    if (!page || page.documentName !== "JournalEntryPage") return "missing";

    const entry = page.parent;

    // Parent entry must be at least visible in the Journal directory; the page itself must be observable.
    if (entry && !entry.testUserPermission(user, OWNERSHIP.LIMITED)) return "restricted";
    if (!page.testUserPermission(user, OWNERSHIP.OBSERVER)) return "restricted";
    if (!SUPPORTED_PAGE_TYPES.has(page.type)) return "unsupported";

    return "available";
}

function resolveUuid(uuid) {
    if (!uuid) return null;

    try {
        return foundry.utils.fromUuidSync(uuid, { strict: false }) ?? null;
    } catch {
        return null;
    }
}

function escapeHTML(value) {
    return foundry.utils.escapeHTML ? foundry.utils.escapeHTML(String(value)) : String(value).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
}

async function renderPageContent(page) {
    const TextEditor = foundry.applications.ux.TextEditor.implementation;

    if (page.type === "text") {
        return TextEditor.enrichHTML(page.text?.content ?? "", {
            secrets: page.isOwner,
            relativeTo: page,
            rollData: {}
        });
    }

    if (page.type === "image" && page.src) {
        const caption = page.image?.caption ? `<figcaption>${escapeHTML(page.image.caption)}</figcaption>` : "";
        return `<figure class="azd-page-image"><img src="${escapeHTML(page.src)}" alt="${escapeHTML(page.name)}">${caption}</figure>`;
    }

    return "";
}

/**
 * Choose which entry of a panel's history to show. Pure.
 * Players only page through entries they can read; GMs see every entry, including broken ones.
 * @param {string[]} uuids              Panel entries, oldest first
 * @param {(uuid: string) => string} accessOf  pageAccess result for an entry
 * @param {boolean} isGM
 * @param {number|null} requested       Index into the visible entries, or null for the newest
 */
export function selectEntry(uuids, accessOf, isGM, requested = null) {
    const visible = uuids.filter(uuid => isGM || accessOf(uuid) === "available");
    const count = visible.length;
    const index = count === 0 ? -1 : requested === null ? count - 1 : Math.min(Math.max(0, requested), count - 1);

    return {
        uuid: index >= 0 ? visible[index] : null,
        index,
        count,
        isLatest: count > 0 && index === count - 1
    };
}

/**
 * Build a tab's view model: ledger choice, pager, and the chosen entry's enriched content.
 * Titles of restricted or missing pages are only shown to GMs.
 * @param {string} kind                 Tab key
 * @param {string|null} defaultLedger   Configured default ledger UUID
 * @param {User} user
 * @param {{ledger?: string|null, index?: number|null}} [view]  This client's selection
 */
export async function buildPanel(kind, defaultLedger, user, { ledger: choice = null, index, indexLedger = null } = {}) {
    const ledgers = visibleLedgers(kind, user);
    const ledgerUuid = chooseLedger(ledgers.map(l => l.uuid), defaultLedger, choice);
    // A remembered entry position only applies to the ledger it was made in.
    const requestedIndex = indexLedger && indexLedger !== ledgerUuid ? null : index ?? null;
    const ledger = ledgers.find(l => l.uuid === ledgerUuid) ?? null;
    const pages = new Map(ledgerPages(ledger).map(page => [page.uuid, page]));
    const accessOf = uuid => pageAccess(uuid, pages.get(uuid), user);
    const entry = selectEntry([...pages.keys()], accessOf, user.isGM, requestedIndex);
    const page = entry.uuid ? pages.get(entry.uuid) : null;
    const access = entry.uuid ? accessOf(entry.uuid) : "unassigned";
    const panel = {
        kind,
        uuid: entry.uuid,
        access,
        isGM: user.isGM,
        title: null,
        html: "",
        empty: false,
        canEdit: false,
        // Ledger switcher
        ledgerUuid,
        ledgerName: ledger?.name ?? null,
        hasLedger: Boolean(ledger),
        isDefaultLedger: Boolean(ledger) && (ledgerUuid === defaultLedger || (!defaultLedger && ledger === ledgers.at(-1))),
        defaultIsSet: Boolean(defaultLedger),
        ledgers: ledgers.map(l => ({ uuid: l.uuid, name: l.name, selected: l.uuid === ledgerUuid, isDefault: l.uuid === defaultLedger })).reverse(),
        // Pager: 1-based position among the entries this user may see.
        position: entry.index + 1,
        count: entry.count,
        index: entry.index,
        paged: entry.count > 1,
        isLatest: entry.isLatest,
        hasPrevious: entry.index > 0,
        hasNext: entry.index >= 0 && !entry.isLatest
    };

    if (access === "available") {
        panel.title = page.name;
        panel.html = await renderPageContent(page);
        panel.empty = !panel.html.replace(/<[^>]*>|&nbsp;|\s/g, "").length && !/<img/i.test(panel.html);
        panel.canEdit = page.canUserModify(user, "update");
    } else if (user.isGM && page) {
        panel.title = page.name;
    }

    return panel;
}

/**
 * Mission title: the name of the objective ledger being shown (else the summary ledger), otherwise
 * the Scene's navigation name.
 */
export function missionTitle(panels, scene) {
    const name = panels.objective?.ledgerName ?? panels.summary?.ledgerName;
    // The header already says "Mission", so drop a "Mission: " prefix.
    if (name) return name.replace(/^mission\s*[:\-–—]\s*/i, "") || name;
    return scene?.navName || scene?.name || "";
}

/**
 * People of Note: name/portrait come from the Actor; only shown to users who can at least see
 * the Actor (Limited). GMs see hidden entries flagged as such.
 */
export function buildPeople(config, user) {
    return config.people
        .map(person => {
            const actor = resolveUuid(person.actorUuid);
            // Missing Actors are only reported to GMs; players never learn an unseen Actor exists.
            const visible = actor ? actor.testUserPermission(user, OWNERSHIP.LIMITED) : user.isGM;

            if (!visible) {
                return null;
            }

            return {
                id: person.id,
                uuid: person.actorUuid,
                name: actor?.name ?? "Missing actor",
                img: actor?.img ?? null,
                missing: !actor,
                role: person.role,
                status: person.status,
                relationship: person.relationship,
                note: person.note,
                hiddenFromPlayers: user.isGM && (!actor || !playersCanSee(actor))
            };
        })
        .filter(Boolean);
}

/** True when at least one non-GM user, or the default level, can see the Actor. */
function playersCanSee(actor) {
    if ((actor.ownership?.default ?? 0) >= OWNERSHIP.LIMITED) return true;
    return game.users.some(u => !u.isGM && actor.testUserPermission(u, OWNERSHIP.LIMITED));
}
