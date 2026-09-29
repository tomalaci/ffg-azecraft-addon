/**
 * The Azecraft toolbar: a row of tab buttons just right of Foundry's scene list (top left).
 *
 * - Dashboard: shows or hides the mission dashboard on this computer, with an on/off indicator.
 * - Players: Foundry's player list, hidden otherwise, drops down under the button.
 * - Other features add their own buttons with registerToolbarButton() (UI Performance, Admin Panel).
 *
 * The toolbar sits in a top rail across the screen (always there, also with the dashboard hidden or
 * not on a Scene), right of where the dashboard's squad column ends, so it never moves when the
 * dashboard is turned on or off.
 */

const MODULE_ID = "ffg-azecraft-addon";
const GAP = 12;

const EDGE_KEY = "azecraft.toolbarEdge";

const buttons = [];
let element = null;
let rail = null;

/**
 * Add a button to the toolbar.
 * @param {object} button
 * @param {string} button.id
 * @param {string} button.label
 * @param {string} button.icon           Font Awesome classes, e.g. "fa-solid fa-gauge-high"
 * @param {string} [button.tooltip]
 * @param {boolean} [button.gmOnly]
 * @param {number} [button.order]        Lower comes first (Dashboard 10, Players 20)
 * @param {() => void} button.onClick
 * @param {() => boolean} [button.isActive]  Shown pressed while true
 * @param {() => string|null} [button.state] Small status text/indicator, e.g. "on"/"off"
 */
export function registerToolbarButton(button) {
    buttons.push(button);
    buttons.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
    refreshToolbar();
}

function visibleRect(selector) {
    const node = document.querySelector(selector);
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return rect.width || rect.height ? rect : null;
}

/**
 * Where the dashboard's squad column ends (its layout is kept while the dashboard is hidden). Without
 * a dashboard on the Scene, the last known edge on this computer.
 */
function columnEdge() {
    const dashboard = document.getElementById("azecraft-mission-dashboard");
    const left = parseFloat(dashboard?.style.getPropertyValue("--azd-left"));
    const width = parseFloat(dashboard?.style.getPropertyValue("--azd-rail-width"));
    if (Number.isFinite(left) && Number.isFinite(width)) {
        const edge = Math.round(left + width + 12);
        try {
            localStorage.setItem(EDGE_KEY, String(edge));
        } catch {
            // Storage unavailable: fine, only a fallback.
        }
        return edge;
    }
    try {
        return Number(localStorage.getItem(EDGE_KEY)) || 0;
    } catch {
        return 0;
    }
}

/** Put the toolbar in the top rail, right of the scene list and the dashboard's squad column. */
function position() {
    if (!element) return;
    const controls = visibleRect("#scene-controls");
    const edges = ["#scene-navigation-active", "#scene-navigation-expand", "#scene-navigation"].map(visibleRect).filter(Boolean);
    const edge = columnEdge();
    const left = Math.round(Math.max(controls?.right ?? 0, edge, ...edges.map(rect => rect.right)) + GAP);
    const top = Math.round(controls?.top ?? edges[0]?.top ?? GAP);
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    // Icons only when the labelled tabs would run under the sidebar (narrow screens).
    element.classList.remove("aztb--compact");
    const sidebar = visibleRect("#sidebar");
    if (sidebar && element.getBoundingClientRect().right > sidebar.left - GAP) element.classList.add("aztb--compact");
    // The top rail: as tall as the toolbar plus the same margin above and below, up to the sidebar.
    const rect = element.getBoundingClientRect();
    const root = document.documentElement.style;
    if (rect.height) {
        root.setProperty("--aztb-top", `${Math.round(rect.top)}px`);
        root.setProperty("--aztb-bottom", `${Math.round(rect.bottom)}px`);
    }
    root.setProperty("--aztb-rail-right", `${Math.max(0, Math.round(window.innerWidth - (sidebar?.left ?? window.innerWidth)))}px`);
    root.setProperty("--aztb-edge", `${Math.max(0, left - GAP)}px`);
    placePlayers();
}

/** The player list drops down under the Players button while open. */
function placePlayers() {
    const button = element?.querySelector('[data-aztb="players"]')?.getBoundingClientRect();
    if (!button) return;
    document.body.style.setProperty("--aztb-players-left", `${Math.round(button.left)}px`);
    document.body.style.setProperty("--aztb-players-top", `${Math.round(button.bottom + 6)}px`);
}

/** Re-draw the buttons (after a state change such as showing the dashboard). */
export function refreshToolbar() {
    if (!element) return;
    const isGM = game.user?.isGM;
    const esc = foundry.utils.escapeHTML;
    element.innerHTML = buttons
        .filter(button => !button.gmOnly || isGM)
        .map(button => {
            const active = button.isActive?.() ?? false;
            const state = button.state?.() ?? null;
            return `<button type="button" class="aztb-button${active ? " aztb-button--on" : ""}" data-aztb="${button.id}" aria-pressed="${active}"
                data-tooltip="${esc(button.tooltip ?? button.label)}" data-tooltip-direction="DOWN">
                <i class="${button.icon}" inert></i><span>${esc(button.label)}</span>${state ? `<span class="aztb-state aztb-state--${esc(state)}">${esc(state)}</span>` : ""}
            </button>`;
        })
        .join("");
    placePlayers();
}

function mount() {
    element = document.createElement("nav");
    element.id = "azecraft-toolbar";
    element.setAttribute("aria-label", "Azecraft");
    // In <body>, above Foundry's interface layers (its drop-down must cover them).
    document.body.append(element);
    // The rail goes under everything in the interface: first child, below the dashboard and core UI.
    rail = document.createElement("div");
    rail.id = "azecraft-toprail";
    rail.setAttribute("aria-hidden", "true");
    const ui = document.getElementById("interface");
    if (ui) ui.prepend(rail);
    else document.body.prepend(rail);
    element.addEventListener("click", event => {
        const id = event.target.closest("[data-aztb]")?.dataset.aztb;
        buttons.find(button => button.id === id)?.onClick();
    });

    refreshToolbar();
    position();
    const observer = new ResizeObserver(() => position());
    for (const selector of ["#scene-navigation", "#scene-controls", "#sidebar"]) {
        const node = document.querySelector(selector);
        if (node) observer.observe(node);
    }
    window.addEventListener("resize", position);
    // The dashboard's layout (shown, hidden, column width) moves the toolbar.
    document.addEventListener("azecraft:layout", () => requestAnimationFrame(position));
    for (const hook of ["collapseSceneNavigation", "renderSceneNavigation", "renderSceneControls"]) Hooks.on(hook, () => requestAnimationFrame(position));
}

/* -------------------------------------------- */
/*  Built-in buttons                            */
/* -------------------------------------------- */

function dashboardShown() {
    return !game.settings.get(MODULE_ID, "dashboardHidden");
}

function dashboardOnScene() {
    return Boolean(document.getElementById("azecraft-mission-dashboard"));
}

export function initToolbar() {
    // The player list is hidden; the Players button drops it down.
    Hooks.once("ready", () => {
        document.body.classList.add("aztb-players-managed");
        mount();
    });

    registerToolbarButton({
        id: "dashboard",
        order: 10,
        label: "Dashboard",
        icon: "fa-solid fa-satellite-dish",
        tooltip: "Show or hide the mission dashboard on this computer",
        isActive: () => dashboardShown() && dashboardOnScene(),
        state: () => (dashboardOnScene() ? (dashboardShown() ? "on" : "off") : "n/a"),
        onClick: async () => {
            if (!dashboardOnScene()) {
                ui.notifications.info("The mission dashboard is turned off for this Scene (GMs can turn it on in the Scene's context menu).");
                return;
            }
            await game.settings.set(MODULE_ID, "dashboardHidden", dashboardShown());
            refreshToolbar();
        }
    });

    registerToolbarButton({
        id: "players",
        order: 20,
        label: "Players",
        icon: "fa-solid fa-users",
        tooltip: "Show or hide the player list",
        isActive: () => document.body.classList.contains("aztb-players-open"),
        state: () => String(game.users?.filter(user => user.active).length ?? ""),
        onClick: () => {
            document.body.classList.toggle("aztb-players-open");
            refreshToolbar();
        }
    });

    // Keep the online count and the dashboard state current.
    Hooks.on("userConnected", refreshToolbar);
    // Windows opened from the toolbar (UI Performance, Admin Panel) un-press their button on close.
    for (const hook of ["azecraftDashboardChanged", "renderMissionDashboardApp", "closeApplicationV2"]) Hooks.on(hook, () => refreshToolbar());
    for (const hook of ["azecraftDashboardChanged", "renderMissionDashboardApp"]) Hooks.on(hook, () => requestAnimationFrame(position));
    Hooks.on("canvasReady", () => setTimeout(refreshToolbar, 500));
}
