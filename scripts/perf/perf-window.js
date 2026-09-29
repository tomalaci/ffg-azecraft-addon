/**
 * UI Performance window (toolbar tab, every user): general statistics (top left), graphs of the
 * periodic snapshots (bottom left) and the loaded assets sorted by size (right third). Buttons:
 * Lag now!, Reset, Rescan assets, and a detailed report (download, copy or send to the GM).
 */

import { SceneSpaceApp } from "../ui/scene-space.js";
import { chartPath, formatBytes, round } from "./perf-core.js";
import { SNAPSHOT_SETTING, buildReport, currentStats, environment, lagMarks, markLag, onSnapshot, reset, scanAssets, snapshots, support, topTables } from "./perf-collector.js";

const MODULE_ID = "ffg-azecraft-addon";
const TEMPLATE_ROOT = `modules/${MODULE_ID}/templates/perf`;
const CHART = { width: 300, height: 70 };

const CHARTS = [
    { key: "fps", label: "UI fps", color: "#72d4ff", max: null },
    { key: "canvasFps", label: "Canvas fps", color: "#7fe0a0", max: null },
    { key: "slowShare", label: "Slow frames %", color: "#ff9d42", max: 100 },
    { key: "freezes", label: "Freezes (>100 ms)", color: "#ff5d55", max: null },
    { key: "longTaskMs", label: "Long tasks (ms)", color: "#ff5d55", max: null, needs: "longTasks" },
    { key: "heapMB", label: "Memory (MB)", color: "#b58cf0", max: null, needs: "memory" },
    { key: "elements", label: "Page elements", color: "#95a6ba", max: null },
    { key: "animations", label: "Running animations", color: "#95a6ba", max: null }
];

export class UIPerformanceApp extends SceneSpaceApp {
    static DEFAULT_OPTIONS = {
        id: "azecraft-ui-performance",
        classes: ["azecraft-ui-performance"],
        window: { title: "UI Performance", icon: "fa-solid fa-gauge-high" },
        actions: {
            lag: UIPerformanceApp.#onLag,
            reset: UIPerformanceApp.#onReset,
            rescan: UIPerformanceApp.#onRescan,
            report: UIPerformanceApp.#onReport
        }
    };

    static PARTS = {
        stats: { template: `${TEMPLATE_ROOT}/stats.hbs`, scrollable: [""] },
        charts: { template: `${TEMPLATE_ROOT}/charts.hbs`, scrollable: [""] },
        assets: { template: `${TEMPLATE_ROOT}/assets.hbs`, scrollable: [".azpf-asset-list"] }
    };

    assets = null;
    filter = "";
    #unsubscribe = null;

    async _preparePartContext(partId, context) {
        context = await super._preparePartContext(partId, context);
        if (partId === "stats") Object.assign(context, this.#statsContext());
        if (partId === "charts") Object.assign(context, this.#chartsContext());
        if (partId === "assets") Object.assign(context, await this.#assetsContext());
        return context;
    }

    #statsContext() {
        const s = currentStats();
        const env = environment();
        const t = topTables(6);
        const firefox = /firefox/i.test(navigator.userAgent);
        return {
            stats: s,
            env,
            browserShort: firefox ? "Firefox" : /edg\//i.test(navigator.userAgent) ? "Edge" : /chrome/i.test(navigator.userAgent) ? "Chrome" : "Browser",
            attribution: support.longAnimationFrames,
            firefox,
            byOwner: t.byOwner,
            renders: t.renders,
            hooks: t.hooks,
            marks: lagMarks().length,
            interval: game.settings.get(MODULE_ID, SNAPSHOT_SETTING)
        };
    }

    #chartsContext() {
        const recent = snapshots.slice(-60);
        const charts = CHARTS.filter(chart => !chart.needs || support[chart.needs]).map(chart => {
            const values = recent.map(s => s[chart.key]);
            const numbers = values.filter(Number.isFinite);
            const max = chart.max ?? Math.max(1, ...numbers);
            return {
                ...chart,
                path: chartPath(values, CHART.width, CHART.height, max),
                last: numbers.length ? numbers.at(-1) : "–",
                peak: numbers.length ? round(Math.max(...numbers)) : "–",
                max: round(max)
            };
        });
        return { charts, chart: CHART, count: recent.length, empty: !recent.length, interval: game.settings.get(MODULE_ID, SNAPSHOT_SETTING) };
    }

    async #assetsContext() {
        this.assets ??= await scanAssets();
        const filter = this.filter.toLowerCase();
        const rows = this.assets
            .filter(row => !filter || row.name.toLowerCase().includes(filter))
            .slice(0, 400)
            .map(row => ({
                ...row,
                display: (() => {
                    try {
                        return decodeURIComponent(row.name);
                    } catch {
                        return row.name;
                    }
                })(),
                sizeText: row.size ? formatBytes(row.size) : "?",
                gpuText: row.gpu ? formatBytes(row.gpu) : "",
                heavy: row.size >= 5 * 1048576
            }));
        return {
            rows,
            filter: this.filter,
            total: formatBytes(this.assets.reduce((s, r) => s + (r.size || 0), 0)),
            gpu: formatBytes(this.assets.reduce((s, r) => s + (r.gpu || 0), 0)),
            count: this.assets.length
        };
    }

    async _onFirstRender(context, options) {
        await super._onFirstRender(context, options);
        this.#unsubscribe = onSnapshot(() => this.render({ parts: ["stats", "charts"] }));
        // Filter and snapshot interval inputs (not form submissions).
        this.element.addEventListener("input", event => {
            if (event.target.matches("[data-azpf-filter]")) {
                this.filter = event.target.value;
                clearTimeout(this._filterTimer);
                this._filterTimer = setTimeout(() => this.render({ parts: ["assets"] }), 200);
            }
        });
        this.element.addEventListener("change", event => {
            if (event.target.matches("[data-azpf-interval]")) {
                const seconds = Math.max(0, Math.min(600, Number(event.target.value) || 0));
                game.settings.set(MODULE_ID, SNAPSHOT_SETTING, seconds);
            }
        });
    }

    _onClose(options) {
        this.#unsubscribe?.();
        super._onClose(options);
    }

    static #onLag() {
        markLag();
        ui.notifications.info("Lag marked: the last 5 seconds are saved in the report.");
        this.render({ parts: ["stats"] });
    }

    static #onReset() {
        reset();
        this.render({ parts: ["stats", "charts"] });
    }

    static async #onRescan() {
        ui.notifications.info("Scanning loaded assets…");
        this.assets = await scanAssets();
        this.render({ parts: ["assets"] });
    }

    static async #onReport() {
        const report = await buildReport({ assets: this.assets });
        const choice = await foundry.applications.api.DialogV2.wait({
            window: { title: "Performance report", icon: "fa-solid fa-gauge-high" },
            position: { width: 640 },
            content: `<div class="azpm-report">${summarize(report)}</div>`,
            buttons: [
                { action: "send", label: "Send to GM", icon: "fa-solid fa-paper-plane", default: true },
                { action: "download", label: "Download", icon: "fa-solid fa-download" },
                { action: "copy", label: "Copy", icon: "fa-solid fa-copy" }
            ],
            rejectClose: false
        });
        if (choice === "send") await sendToGM(report);
        else if (choice === "download") downloadReport(report);
        else if (choice === "copy") {
            await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
            ui.notifications.info("Report copied to the clipboard.");
        }
    }
}

/** Readable summary of a report (report dialog and the chat card). */
export function summarize(report) {
    const esc = foundry.utils.escapeHTML;
    const s = report.stats;
    const env = report.environment;
    const list = (rows, fmt) => rows.length ? `<ul>${rows.map(r => `<li>${fmt(r)}</li>`).join("")}</ul>` : "<p><em>none</em></p>";
    return `<div class="azpm-summary">
        <p><strong>${esc(env.user)}</strong>, ${s.minutes} min measured. ${esc(env.gpu)} · ${env.cpuThreads ?? "?"} threads · ${env.deviceMemoryGB ?? "?"} GB · ${esc(env.screen)}</p>
        <p>UI ${s.avgFps} fps (now ${s.recentFps}), canvas ${s.canvasFps ?? "?"} fps · slow frames ${s.slowFrames} (${s.slowShare}%) · freezes ${s.freezes} · worst ${s.worstFrame} ms
        ${s.heapMB ? ` · memory ${s.heapMB} MB` : ""} · ${s.elements} elements, ${s.animations ?? "?"} animations</p>
        <p><strong>Slow-frame time by code</strong>${report.support.longAnimationFrames ? "" : " (not available in this browser)"}</p>
        ${list(report.slowScriptsByOwner.slice(0, 6), r => `${esc(r.name)}: ${r.total} ms (${r.count}×)`)}
        <p><strong>Slowest renders</strong></p>
        ${list(report.renders.slice(0, 6), r => `${esc(r.name)}: avg ${r.avg} ms, max ${r.max} ms (${r.count}×)`)}
        <p><strong>Slowest hooks</strong></p>
        ${list(report.hooks.slice(0, 6), r => `${esc(r.name)}: ${r.total} ms total, max ${r.max} ms (${r.count}×)`)}
        <p><strong>Largest assets</strong> (${report.assets.count} loaded, ${esc(report.assets.totalSize)}; canvas textures ${esc(report.assets.canvasGpu)} of GPU memory)</p>
        ${list(report.assets.largest.slice(0, 6), r => `${esc(decodeURIComponent(r.name).split("/").pop())}: ${esc(r.size)}${r.pixels ? `, ${esc(r.pixels)}` : ""}`)}
        ${report.lagMarks.length ? `<p><strong>"Lag now!" marks:</strong> ${report.lagMarks.length}</p>` : ""}
    </div>`;
}

function downloadReport(report) {
    const name = `perf-${(report.environment?.user ?? "report").replace(/\W+/g, "-")}-${report.createdAt.slice(0, 19).replace(/:/g, "")}.json`;
    foundry.utils.saveDataToFile(JSON.stringify(report, null, 2), "application/json", name);
}

async function sendToGM(report) {
    const gms = game.users.filter(u => u.isGM).map(u => u.id);
    await ChatMessage.create({
        content: `<div class="azpm-chat"><div class="azpm-chat-title"><i class="fa-solid fa-gauge-high" inert></i> Performance report</div>${summarize(report)}
            <button type="button" data-azpm-download><i class="fa-solid fa-download" inert></i> Download full report</button></div>`,
        whisper: [...new Set([...gms, game.user.id])],
        flags: { [MODULE_ID]: { perfReport: report } }
    });
    ui.notifications.info("Performance report sent to the GM.");
}

export function initPerfWindow() {
    Hooks.once("setup", () => foundry.applications.handlebars.loadTemplates(["stats", "charts", "assets"].map(p => `${TEMPLATE_ROOT}/${p}.hbs`)));
    // GMs can download reports that players send.
    document.addEventListener("click", event => {
        const button = event.target.closest?.("[data-azpm-download]");
        if (!button) return;
        const message = game.messages.get(button.closest("[data-message-id]")?.dataset.messageId);
        const report = message?.getFlag(MODULE_ID, "perfReport");
        if (report) downloadReport(report);
    });
}
