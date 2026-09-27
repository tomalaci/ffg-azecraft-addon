export const MODULE_ID = "ffg-azecraft-addon";
export const FLAG_KEY = "dashboard";
export const SCHEMA_VERSION = 1;

export const DEFAULT_SLOT_COUNT = 6;
export const MAX_SLOT_COUNT = 12;

/**
 * Mission panels (tabs) in display order. Each tab shows one ledger at a time: a module-managed
 * Journal whose pages are the tab's entries, oldest first. `pageName` names new entries and
 * `folderName` is the tab's subfolder under the "Mission Dashboard" Journal folder.
 */
export const MISSION_PANELS = [
    { key: "objective", label: "Current objective", pageName: "Objective", folderName: "Objectives" },
    { key: "summary", label: "Mission summary", pageName: "Summary", folderName: "Mission Summaries" },
    { key: "intel", label: "Key intel", pageName: "Intel", folderName: "Key Intel" }
];

export const LEDGER_ROOT_FOLDER_NAME = "Mission Dashboard";
export const DESIRE_MAX_LENGTH = 500;
export const PEOPLE_TEXT_MAX_LENGTH = 120;
export const PEOPLE_NOTE_MAX_LENGTH = 500;
export const REASON_MAX_LENGTH = 300;

/** Actor folder listed first in party dropdowns. */
export const PARTY_FOLDER_NAME = "Player Characters";

export const TEMPLATE_ROOT = `modules/${MODULE_ID}/templates/mission-dashboard`;
export const PLACEHOLDER_ART = `modules/${MODULE_ID}/assets/mission-dashboard/placeholder.svg`;

export const SETTINGS = {
    hidden: "dashboardHidden",
    compact: "dashboardCompact",
    missionCollapsed: "dashboardMissionCollapsed",
    style: "dashboardStyle",
    ledger: "campaignLedgerUuid",
    campaignDashboard: "campaignDashboard",
    showOnAllScenes: "showOnAllScenes"
};

/** Ownership levels, mirrored from CONST.DOCUMENT_OWNERSHIP_LEVELS so pure modules stay testable. */
export const OWNERSHIP = {
    NONE: 0,
    LIMITED: 1,
    OBSERVER: 2,
    OWNER: 3
};
