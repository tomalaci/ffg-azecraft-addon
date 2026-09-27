/**
 * Mission ledgers: module-managed Journals, one per ledger, whose pages are a tab's entries.
 *
 * Ledgers live in a "Mission Dashboard" Journal folder with one subfolder per tab, so existing
 * campaign Journals are never touched. Folders and ledgers are recognised by module flags, not by
 * name, so GMs can rename or move them freely.
 */

import { LEDGER_ROOT_FOLDER_NAME, MISSION_PANELS, MODULE_ID, OWNERSHIP } from "./constants.js";

export const LEDGER_FLAG = "missionLedger";
export const FOLDER_FLAG = "dashboardFolder";

/* -------------------------------------------- */
/*  Pure helpers                                */
/* -------------------------------------------- */

/**
 * Choose which ledger a tab shows. Pure.
 * @param {string[]} visible     Ledger UUIDs the viewer may see, oldest first
 * @param {string|null} fallback The configured default ledger
 * @param {string|null} choice   The viewer's own selection, if any
 * @returns {string|null}
 */
export function chooseLedger(visible, fallback, choice = null) {
    if (choice && visible.includes(choice)) return choice;
    if (fallback && visible.includes(fallback)) return fallback;
    return visible.at(-1) ?? null;
}

export function ledgerPanel(entry) {
    return entry?.flags?.[MODULE_ID]?.[LEDGER_FLAG]?.panel ?? null;
}

/* -------------------------------------------- */
/*  Reads                                       */
/* -------------------------------------------- */

function createdTime(document) {
    return document._stats?.createdTime ?? 0;
}

/** All ledgers of a tab, oldest first. */
export function ledgersFor(panelKey) {
    return game.journal
        .filter(entry => ledgerPanel(entry) === panelKey)
        .sort((a, b) => createdTime(a) - createdTime(b) || a.name.localeCompare(b.name));
}

/** Ledgers a user may switch to: GMs see all; players need at least Limited on the Journal. */
export function visibleLedgers(panelKey, user) {
    return ledgersFor(panelKey).filter(entry => user.isGM || entry.testUserPermission(user, OWNERSHIP.LIMITED));
}

/** Entry pages of a ledger, oldest first. */
export function ledgerPages(entry) {
    return entry ? entry.pages.contents.slice().sort((a, b) => a.sort - b.sort) : [];
}

/* -------------------------------------------- */
/*  Writes (GM only)                            */
/* -------------------------------------------- */

function assertGM() {
    if (!game.user?.isGM) throw new Error("Only a GM can manage mission ledgers.");
}

function findFolder(kind) {
    return game.folders.find(folder => folder.type === "JournalEntry" && folder.flags?.[MODULE_ID]?.[FOLDER_FLAG] === kind) ?? null;
}

/**
 * Make sure the "Mission Dashboard" folder and its subfolders (one per tab, plus Trackers) exist.
 * Idempotent.
 * @returns {Promise<Record<string, Folder>>} subfolders by tab key, plus `trackers`
 */
export async function ensureLedgerFolders() {
    assertGM();

    let root = findFolder("root");
    if (!root) {
        root = await Folder.implementation.create({
            name: LEDGER_ROOT_FOLDER_NAME,
            type: "JournalEntry",
            color: "#1b3a57",
            flags: { [MODULE_ID]: { [FOLDER_FLAG]: "root" } }
        });
    }

    // One subfolder per mission tab, plus "Trackers" for the Reputation and Resources Journals.
    const subfolders = [...MISSION_PANELS.map(panel => ({ key: panel.key, name: panel.folderName })), { key: "trackers", name: "Trackers" }];
    const folders = {};
    for (const [index, sub] of subfolders.entries()) {
        folders[sub.key] = findFolder(sub.key) ?? await Folder.implementation.create({
            name: sub.name,
            type: "JournalEntry",
            folder: root.id,
            sort: (index + 1) * 100000,
            flags: { [MODULE_ID]: { [FOLDER_FLAG]: sub.key } }
        });
    }

    return folders;
}

/** Page data for the next entry of a ledger, placed after its current last page. */
function nextPageData(panel, entry) {
    const pages = ledgerPages(entry);
    return {
        name: `${panel.pageName} ${pages.length + 1}`,
        type: "text",
        text: { content: "" },
        sort: (pages.at(-1)?.sort ?? 0) + 100000
    };
}

/**
 * Create a ledger for a tab, with its first (empty) entry.
 * @param {string} panelKey
 * @param {string} name
 * @param {{playersCanRead?: boolean}} [options]
 */
export async function createLedger(panelKey, name, { playersCanRead = true } = {}) {
    assertGM();

    const panel = MISSION_PANELS.find(p => p.key === panelKey);
    if (!panel) throw new Error(`Unknown mission tab: ${panelKey}`);

    const clean = String(name ?? "").trim();
    if (!clean) throw new Error("A ledger needs a name.");

    const folders = await ensureLedgerFolders();
    return JournalEntry.implementation.create({
        name: clean,
        folder: folders[panelKey].id,
        ownership: { default: playersCanRead ? OWNERSHIP.OBSERVER : OWNERSHIP.NONE },
        flags: { [MODULE_ID]: { [LEDGER_FLAG]: { panel: panelKey } } },
        pages: [nextPageData(panel, null)]
    });
}

/** Append a new, empty entry page to a ledger and return it. */
export async function createLedgerEntry(ledgerUuid) {
    assertGM();

    const entry = foundry.utils.fromUuidSync(ledgerUuid, { strict: false });
    const panel = MISSION_PANELS.find(p => p.key === ledgerPanel(entry));
    if (!entry || !panel) throw new Error("That ledger no longer exists.");

    const [page] = await entry.createEmbeddedDocuments("JournalEntryPage", [nextPageData(panel, entry)]);
    return page;
}
