/**
 * Performance monitor for Foundry + modules (per-client setting, off by default).
 *
 * When on, it measures from the start of the session:
 * - frame timing (fps, slow frames, freezes) and the canvas renderer's fps;
 * - slow frames attributed to the script that caused them, by module/system (Chromium's
 *   Long Animation Frames API; Firefox has no equivalent, so there only frame timing applies);
 * - how long every application render (sheets, dashboard, dialogs...) and every hook takes;
 * - the heaviest images/scripts loaded, memory, DOM size and running CSS animations;
 * - the machine and setup (browser, GPU, screen, Foundry/system/module versions).
 * "Lag now!" snapshots what happened in the last seconds; "Send to GM" posts a readable summary
 * to the GMs with the full report attached. When off, nothing is patched or observed.
 */

import { FrameStats, TimingTable, formatBytes, largest, round, scriptOwner } from "./perf-core.js";

const MODULE_ID = "ffg-azecraft-addon";
const SETTING = "perfMonitor";
const LOG_WINDOW_MS = 10000;

const frames = new FrameStats();
const renders = new TimingTable();
const hooks = new TimingTable();
const scriptTime = new TimingTable();
const scripts = new TimingTable();
const resources = new Map();
const marks = [];
let log = [];
let longTasks = 0;
let longTaskMs = 0;
let startedAt = 0;
let canvasFps = [];

function now() {
    return performance.now();
}

function remember(type, name, ms, detail = "") {
    const t = now();
    log.push({ t, type, name, ms: round(ms), detail });
    while (log.length && t - log[0].t > LOG_WINDOW_MS) log.shift();
}

/* -------------------------------------------- */
/*  Instrumentation                             */
/* -------------------------------------------- */

function patchHooks() {
    for (const method of ["call", "callAll"]) {
        const original = Hooks[method];
        Hooks[method] = function (hook, ...args) {
            const start = now();
            try {
                return original.call(this, hook, ...args);
            } finally {
                const ms = now() - start;
                hooks.add(hook, ms);
                if (ms >= 4) remember("hook", hook, ms);
            }
        };
    }
}

function appName(app) {
    const cls = app?.constructor?.name ?? "Application";
    return app?.options?.id && !/-[A-Za-z0-9]{16}/.test(app.options.id) ? `${cls} #${app.options.id}` : cls;
}

function timeRender(proto, method) {
    const original = proto?.[method];
    if (typeof original !== "function") return;
    proto[method] = async function (...args) {
        const start = now();
        try {
            return await original.apply(this, args);
        } finally {
            const ms = now() - start;
            const name = appName(this);
            renders.add(name, ms);
            if (ms >= 8) remember("render", name, ms, this.title ?? "");
        }
    };
}

function patchApplications() {
    timeRender(foundry.applications.api.ApplicationV2.prototype, "render");
    timeRender(foundry.appv1?.api?.Application?.prototype, "_render");
}

function observe(type, handler) {
    try {
        if (!PerformanceObserver.supportedEntryTypes?.includes(type)) return false;
        new PerformanceObserver(list => list.getEntries().forEach(handler)).observe({ type, buffered: true });
        return true;
    } catch {
        return false;
    }
}

const support = {};

function startObservers() {
    support.longAnimationFrames = observe("long-animation-frame", entry => {
        for (const script of entry.scripts ?? []) {
            const owner = scriptOwner(script.sourceURL);
            scriptTime.add(owner, script.duration);
            const where = `${owner} · ${script.sourceFunctionName || "(anonymous)"} · ${script.invoker || script.invokerType || ""}`;
            scripts.add(where, script.duration);
        }
        if (entry.duration >= 100) {
            const top = [...(entry.scripts ?? [])].sort((a, b) => b.duration - a.duration)[0];
            remember("slow-frame", top ? scriptOwner(top.sourceURL) : "rendering/layout", entry.duration,
                top ? `${top.sourceFunctionName || "(anonymous)"} via ${top.invoker || top.invokerType}` : `style/layout ${round(entry.styleAndLayoutStart ? entry.startTime + entry.duration - entry.styleAndLayoutStart : 0)} ms`);
        }
    });
    support.longTasks = observe("longtask", entry => {
        longTasks += 1;
        longTaskMs += entry.duration;
    });
    support.resources = observe("resource", entry => {
        const name = entry.name.replace(window.location.origin, "");
        const kind = entry.initiatorType;
        if (!["img", "css", "script", "fetch", "xmlhttprequest", "link", "other"].includes(kind)) return;
        const previous = resources.get(name);
        const size = entry.decodedBodySize || entry.encodedBodySize || entry.transferSize || 0;
        if (previous && previous.size >= size) return;
        resources.set(name, { name, kind, size, transfer: entry.transferSize, ms: round(entry.duration) });
    });
}

function frameLoop() {
    let last = now();
    const tick = t => {
        frames.add(t - last);
        if (t - last > 100) remember("freeze", "frame", t - last);
        last = t;
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    setInterval(() => {
        const fps = globalThis.canvas?.app?.ticker?.FPS;
        if (fps) canvasFps.push(fps);
        if (canvasFps.length > 60) canvasFps.shift();
    }, 1000);
}

/* -------------------------------------------- */
/*  Report                                      */
/* -------------------------------------------- */

function gpuName() {
    try {
        const gl = globalThis.canvas?.app?.renderer?.gl;
        const info = gl?.getExtension("WEBGL_debug_renderer_info");
        return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown";
    } catch {
        return "unknown";
    }
}

function coreSetting(key) {
    try {
        return game.settings.get("core", key);
    } catch {
        return undefined;
    }
}

function environment() {
    return {
        user: `${game.user.name}${game.user.isGM ? " (GM)" : ""}`,
        browser: navigator.userAgent,
        cpuThreads: navigator.hardwareConcurrency,
        deviceMemoryGB: navigator.deviceMemory,
        screen: `${screen.width}×${screen.height} @${window.devicePixelRatio}x, window ${window.innerWidth}×${window.innerHeight}`,
        gpu: gpuName(),
        foundry: game.release?.version ?? game.version,
        system: `${game.system.id} ${game.system.version}`,
        modules: game.modules.filter(m => m.active).map(m => `${m.id} ${m.version}`),
        canvas: {
            performanceMode: coreSetting("performanceMode"),
            maxFPS: coreSetting("maxFPS"),
            scene: canvas?.scene ? `${canvas.scene.name} ${canvas.scene.width}×${canvas.scene.height}` : "none",
            tokens: canvas?.tokens?.placeables?.length ?? 0,
            lights: canvas?.lighting?.placeables?.length ?? 0
        }
    };
}

/** A report of everything measured so far (plain data, suitable for JSON). */
export function buildReport() {
    const fps = canvasFps.length ? round(canvasFps.reduce((s, v) => s + v, 0) / canvasFps.length) : null;
    const heap = performance.memory ? { usedMB: round(performance.memory.usedJSHeapSize / 1048576), limitMB: round(performance.memory.jsHeapSizeLimit / 1048576) } : null;
    const images = [...resources.values()].filter(r => r.kind === "img" || /\.(png|jpe?g|webp|gif|svg|avif)(\?|$)/i.test(r.name));
    return {
        version: game.modules.get(MODULE_ID)?.version,
        createdAt: new Date().toISOString(),
        minutesMeasured: round((now() - startedAt) / 60000),
        environment: environment(),
        support: { ...support },
        frames: { ...frames.summary(), canvasFps: fps },
        longTasks: { count: longTasks, totalMs: round(longTaskMs) },
        memory: heap,
        page: { elements: document.getElementsByTagName("*").length, runningAnimations: document.getAnimations?.().filter(a => a.playState === "running").length ?? null },
        slowScriptsByOwner: scriptTime.top(10),
        slowScripts: scripts.top(15),
        renders: renders.top(15),
        hooks: hooks.top(15),
        heaviestImages: largest(images, "size", 12).map(r => ({ ...r, size: formatBytes(r.size), transfer: formatBytes(r.transfer) })),
        slowestResources: largest([...resources.values()], "ms", 8).map(r => ({ ...r, size: formatBytes(r.size) })),
        lagMarks: marks.slice(-10)
    };
}

/** Short readable summary (chat card and the report window). */
export function summarize(report) {
    const esc = foundry.utils.escapeHTML;
    const f = report.frames;
    const list = (rows, fmt) => rows.length ? `<ul>${rows.map(r => `<li>${fmt(r)}</li>`).join("")}</ul>` : "<p><em>none</em></p>";
    return `<div class="azpm-summary">
        <p><strong>${esc(report.environment.user)}</strong>, ${report.minutesMeasured} min measured.
        ${esc(report.environment.gpu)} · ${report.environment.cpuThreads ?? "?"} threads · ${report.environment.deviceMemoryGB ?? "?"} GB · ${esc(report.environment.screen)}</p>
        <p>UI ${f.avgFps} fps (now ${f.recentFps}), canvas ${f.canvasFps ?? "?"} fps · slow frames ${f.slowFrames} (${f.slowShare}%) · freezes ${f.freezes} · worst ${f.worstFrame} ms
        ${report.memory ? ` · heap ${report.memory.usedMB} MB` : ""} · ${report.page.elements} elements, ${report.page.runningAnimations ?? "?"} animations</p>
        <p><strong>Slow-frame time by code</strong>${report.support.longAnimationFrames ? "" : " (not available in this browser)"}</p>
        ${list(report.slowScriptsByOwner.slice(0, 6), r => `${esc(r.name)}: ${r.total} ms (${r.count}×)`)}
        <p><strong>Slowest renders</strong></p>
        ${list(report.renders.slice(0, 6), r => `${esc(r.name)}: avg ${r.avg} ms, max ${r.max} ms (${r.count}×)`)}
        <p><strong>Slowest hooks</strong></p>
        ${list(report.hooks.slice(0, 6), r => `${esc(r.name)}: ${r.total} ms total, max ${r.max} ms (${r.count}×)`)}
        <p><strong>Heaviest images</strong></p>
        ${list(report.heaviestImages.slice(0, 5), r => `${esc(decodeURIComponent(r.name).split("/").pop())}: ${r.size}`)}
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

/* -------------------------------------------- */
/*  Panel                                       */
/* -------------------------------------------- */

function markLag() {
    const t = now();
    marks.push({ at: new Date().toISOString(), lastSeconds: log.filter(e => t - e.t <= 5000).map(({ t: time, ...rest }) => ({ ...rest, secondsAgo: round((t - time) / 1000) })) });
    ui.notifications.info("Lag marked: the last 5 seconds are saved in the report.");
}

async function openReport() {
    const report = buildReport();
    const choice = await foundry.applications.api.DialogV2.wait({
        window: { title: "Performance report", icon: "fa-solid fa-gauge-high" },
        position: { width: 620 },
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

function reset() {
    frames.clear();
    renders.clear();
    hooks.clear();
    scriptTime.clear();
    scripts.clear();
    marks.length = 0;
    log = [];
    longTasks = longTaskMs = 0;
    startedAt = now();
    ui.notifications.info("Performance counters reset.");
}

function mountPanel() {
    const panel = document.createElement("section");
    panel.id = "azecraft-perf-monitor";
    panel.innerHTML = `
        <div class="azpm-row"><i class="fa-solid fa-gauge-high" inert></i>
            <span data-azpm="fps">– fps</span><span data-azpm="canvas"></span><span data-azpm="slow"></span><span data-azpm="heap"></span></div>
        <div class="azpm-row azpm-buttons">
            <button type="button" data-azpm-action="lag" data-tooltip="Press when you feel a stutter: saves what happened in the last 5 seconds">Lag now!</button>
            <button type="button" data-azpm-action="report" data-tooltip="See the report, send it to the GM or download it">Report</button>
            <button type="button" data-azpm-action="reset" data-tooltip="Start measuring again">Reset</button>
        </div>`;
    document.body.append(panel);
    panel.addEventListener("click", event => {
        const action = event.target.closest("[data-azpm-action]")?.dataset.azpmAction;
        if (action === "lag") markLag();
        else if (action === "report") openReport();
        else if (action === "reset") reset();
    });
    const set = (key, text) => { panel.querySelector(`[data-azpm="${key}"]`).textContent = text; };
    setInterval(() => {
        const f = frames.summary();
        set("fps", `${f.recentFps} fps`);
        set("canvas", canvasFps.length ? `canvas ${round(canvasFps.at(-1))}` : "");
        set("slow", `slow ${f.slowShare}% · freezes ${f.freezes}`);
        set("heap", performance.memory ? `${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB` : "");
        panel.classList.toggle("azpm--bad", f.recentFps < 30);
    }, 1000);
}

/* -------------------------------------------- */

export function initPerfMonitor() {
    game.settings.register(MODULE_ID, SETTING, {
        name: "Performance monitor",
        hint: "Measure this browser's performance (frame rate, slow scripts by module, render and hook times, heavy images) and show a small panel with a Report button to send the results to the GM. Off costs nothing; turn on only while investigating lag.",
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
        requiresReload: true
    });

    // GMs can download reports that players send.
    document.addEventListener("click", event => {
        const button = event.target.closest?.("[data-azpm-download]");
        if (!button) return;
        const message = game.messages.get(button.closest("[data-message-id]")?.dataset.messageId);
        const report = message?.getFlag(MODULE_ID, "perfReport");
        if (report) downloadReport(report);
    });

    if (!game.settings.get(MODULE_ID, SETTING)) return;
    startedAt = now();
    patchHooks();
    patchApplications();
    startObservers();
    frameLoop();
    Hooks.once("ready", mountPanel);
    globalThis.azecraftPerf = { buildReport, markLag, reset };
    console.log("Azecraft | Performance monitor on");
}
