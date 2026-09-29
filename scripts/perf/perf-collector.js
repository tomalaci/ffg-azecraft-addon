/**
 * Performance data for the UI Performance window (always on, lightweight).
 *
 * From the start of the session it records:
 * - frame timing (fps, slow frames, freezes) and the canvas renderer's fps;
 * - slow frames attributed to the script that caused them, by module/system (Chromium's
 *   Long Animation Frames API; Firefox has no equivalent, so there only frame timing applies);
 * - how long every application render and every hook takes;
 * - periodic snapshots (every N seconds, per-client setting) for the graphs;
 * - loaded assets: resource timing, images on the page and canvas textures, with sizes.
 * The cost is one requestAnimationFrame callback, a timestamp per hook call and render, and a
 * snapshot every few seconds.
 */

import { urlPath } from "../paths.js";
import { FrameStats, SLOW_FRAME_MS, TimingTable, assetKind, formatBytes, largest, round, scriptOwner } from "./perf-core.js";

const MODULE_ID = "ffg-azecraft-addon";
export const SNAPSHOT_SETTING = "perfSnapshotSeconds";
const LOG_WINDOW_MS = 10000;
const MAX_SNAPSHOTS = 360;

const frames = new FrameStats();
const renders = new TimingTable();
const hooks = new TimingTable();
const scriptTime = new TimingTable();
const scripts = new TimingTable();
const resources = new Map();
export const snapshots = [];
const marks = [];
let log = [];
let longTasks = 0;
let longTaskMs = 0;
let startedAt = 0;
let canvasFps = [];
let snapshotTimer = null;
const listeners = new Set();
/** Counters since the last snapshot. */
const interval = { frames: 0, slow: 0, freezes: 0, longTaskMs: 0, worst: 0 };

export const support = {};

function now() {
    return performance.now();
}

function remember(type, name, ms, detail = "") {
    const t = now();
    log.push({ t, type, name, ms: round(ms), detail });
    while (log.length && t - log[0].t > LOG_WINDOW_MS) log.shift();
}

/** Call `fn` after each snapshot (the window re-renders its stats and graphs). */
export function onSnapshot(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
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

function observe(type, handler) {
    try {
        if (!PerformanceObserver.supportedEntryTypes?.includes(type)) return false;
        new PerformanceObserver(list => list.getEntries().forEach(handler)).observe({ type, buffered: true });
        return true;
    } catch {
        return false;
    }
}

function recordResource(entry) {
    const name = entry.name.replace(window.location.origin, "").replace(/^\//, "");
    const size = entry.encodedBodySize || entry.transferSize || entry.decodedBodySize || 0;
    const previous = resources.get(name);
    resources.set(name, {
        name,
        kind: assetKind(name),
        size: Math.max(size, previous?.size ?? 0),
        decoded: Math.max(entry.decodedBodySize || 0, previous?.decoded ?? 0),
        ms: round(Math.max(entry.duration, previous?.ms ?? 0)),
        source: "network",
        gpu: previous?.gpu ?? 0,
        pixels: previous?.pixels ?? ""
    });
}

function startObservers() {
    // Foundry loads more than the default 250 resource entries; keep them all from now on.
    try {
        performance.setResourceTimingBufferSize(5000);
    } catch {
        // Not supported.
    }
    support.longAnimationFrames = observe("long-animation-frame", entry => {
        for (const script of entry.scripts ?? []) {
            const owner = scriptOwner(script.sourceURL);
            scriptTime.add(owner, script.duration);
            scripts.add(`${owner} · ${script.sourceFunctionName || "(anonymous)"} · ${script.invoker || script.invokerType || ""}`, script.duration);
        }
        if (entry.duration >= 100) {
            const top = [...(entry.scripts ?? [])].sort((a, b) => b.duration - a.duration)[0];
            remember("slow-frame", top ? scriptOwner(top.sourceURL) : "rendering/layout", entry.duration,
                top ? `${top.sourceFunctionName || "(anonymous)"} via ${top.invoker || top.invokerType}` : "style/layout");
        }
    });
    support.longTasks = observe("longtask", entry => {
        longTasks += 1;
        longTaskMs += entry.duration;
        interval.longTaskMs += entry.duration;
    });
    support.resources = observe("resource", recordResource);
    support.memory = Boolean(performance.memory);
}

function frameLoop() {
    let last = now();
    const tick = t => {
        const ms = t - last;
        frames.add(ms);
        interval.frames += 1;
        if (ms > SLOW_FRAME_MS) interval.slow += 1;
        if (ms > 100) {
            interval.freezes += 1;
            remember("freeze", "frame", ms);
        }
        interval.worst = Math.max(interval.worst, ms);
        last = t;
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    setInterval(() => {
        const fps = globalThis.canvas?.app?.ticker?.FPS;
        if (fps) canvasFps.push(fps);
        if (canvasFps.length > 10) canvasFps.shift();
    }, 1000);
}

/* -------------------------------------------- */
/*  Snapshots                                   */
/* -------------------------------------------- */

function takeSnapshot(seconds) {
    const heap = performance.memory ? round(performance.memory.usedJSHeapSize / 1048576) : null;
    snapshots.push({
        at: Date.now(),
        fps: interval.frames ? round(interval.frames / seconds) : 0,
        canvasFps: canvasFps.length ? round(canvasFps.reduce((s, v) => s + v, 0) / canvasFps.length) : null,
        slowShare: interval.frames ? round(100 * interval.slow / interval.frames) : 0,
        freezes: interval.freezes,
        worstFrame: round(interval.worst),
        longTaskMs: support.longTasks ? round(interval.longTaskMs) : null,
        heapMB: heap,
        elements: document.getElementsByTagName("*").length,
        animations: document.getAnimations?.().filter(a => a.playState === "running").length ?? null
    });
    if (snapshots.length > MAX_SNAPSHOTS) snapshots.shift();
    Object.assign(interval, { frames: 0, slow: 0, freezes: 0, longTaskMs: 0, worst: 0 });
    for (const fn of listeners) fn();
}

/** (Re)start snapshots at the per-client interval; 0 pauses them. */
export function scheduleSnapshots() {
    clearInterval(snapshotTimer);
    const seconds = Number(game.settings.get(MODULE_ID, SNAPSHOT_SETTING)) || 0;
    if (seconds > 0) snapshotTimer = setInterval(() => takeSnapshot(seconds), seconds * 1000);
}

/* -------------------------------------------- */
/*  Assets                                      */
/* -------------------------------------------- */

async function headSize(url) {
    try {
        const response = await fetch(url, { method: "HEAD" });
        return Number(response.headers.get("content-length")) || 0;
    } catch {
        return 0;
    }
}

/**
 * Loaded assets: network requests (resource timing), images on the page and canvas textures (with
 * GPU memory), sizes filled in with HEAD requests where the browser did not report one.
 * @returns {Promise<object[]>} sorted by size, largest first
 */
export async function scanAssets({ fillSizes = true } = {}) {
    for (const entry of performance.getEntriesByType("resource")) recordResource(entry);

    const add = (url, extra) => {
        const name = String(url ?? "").replace(window.location.origin, "").replace(/^\//, "");
        if (!name || name.startsWith("data:") || name.startsWith("blob:") || name.startsWith("pixiid_")) return;
        const key = (() => {
            try {
                return decodeURIComponent(name);
            } catch {
                return name;
            }
        })();
        const existing = resources.get(name) ?? resources.get(key) ?? { name, kind: assetKind(name), size: 0, decoded: 0, ms: 0, source: extra.source, gpu: 0, pixels: "" };
        resources.set(existing.name, { ...existing, ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v)) });
    };

    for (const img of document.images) {
        if (img.naturalWidth) add(img.currentSrc || img.src, { source: "page", pixels: `${img.naturalWidth}×${img.naturalHeight}` });
    }
    const textures = globalThis.PIXI?.utils?.BaseTextureCache ?? {};
    for (const [key, base] of Object.entries(textures)) {
        if (!/^(https?:|[a-z])/i.test(key) || !base?.realWidth || key.startsWith("http") && Object.hasOwn(textures, key.replace(window.location.origin + "/", ""))) continue;
        add(key, { source: "canvas", pixels: `${base.realWidth}×${base.realHeight}`, gpu: base.realWidth * base.realHeight * 4 });
    }

    if (fillSizes) {
        const missing = [...resources.values()].filter(r => !r.size && ["image", "video", "audio"].includes(r.kind));
        for (let i = 0; i < missing.length; i += 6) {
            await Promise.all(missing.slice(i, i + 6).map(async row => {
                // Other sites' URLs as they are; this server's paths in URL form (encoded once).
                row.size = await headSize(/^[a-z]+:\/\//i.test(row.name) ? row.name : urlPath(row.name));
            }));
        }
    }
    return [...resources.values()].sort((a, b) => b.size - a.size);
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

export function environment() {
    return {
        user: `${game.user.name}${game.user.isGM ? " (GM)" : ""}`,
        browser: navigator.userAgent,
        cpuThreads: navigator.hardwareConcurrency,
        deviceMemoryGB: navigator.deviceMemory ?? null,
        screen: `${screen.width}×${screen.height} @${Math.round(window.devicePixelRatio * 100) / 100}x, window ${window.innerWidth}×${window.innerHeight}`,
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

/** Current totals since the start (or the last reset). */
export function currentStats() {
    const f = frames.summary();
    return {
        ...f,
        minutes: round((now() - startedAt) / 60000),
        canvasFps: canvasFps.length ? round(canvasFps.at(-1)) : null,
        longTasks: support.longTasks ? { count: longTasks, totalMs: round(longTaskMs) } : null,
        heapMB: performance.memory ? round(performance.memory.usedJSHeapSize / 1048576) : null,
        elements: document.getElementsByTagName("*").length,
        animations: document.getAnimations?.().filter(a => a.playState === "running").length ?? null
    };
}

/** Everything measured, as plain data (JSON report). */
export async function buildReport({ assets = null } = {}) {
    const list = assets ?? await scanAssets({ fillSizes: false });
    const images = list.filter(r => r.kind === "image");
    return {
        version: game.modules.get(MODULE_ID)?.version,
        createdAt: new Date().toISOString(),
        environment: environment(),
        support: { ...support },
        stats: currentStats(),
        slowScriptsByOwner: scriptTime.top(10),
        slowScripts: scripts.top(20),
        renders: renders.top(20),
        hooks: hooks.top(20),
        snapshots: snapshots.slice(-120),
        assets: {
            count: list.length,
            totalSize: formatBytes(list.reduce((s, r) => s + (r.size || 0), 0)),
            canvasGpu: formatBytes(list.reduce((s, r) => s + (r.gpu || 0), 0)),
            largest: largest(list, "size", 40).map(r => ({ ...r, size: formatBytes(r.size), gpu: r.gpu ? formatBytes(r.gpu) : "" })),
            largestImages: largest(images, "size", 15).map(r => ({ name: r.name, size: formatBytes(r.size), pixels: r.pixels }))
        },
        lagMarks: marks.slice(-10)
    };
}

export function topTables(limit = 8) {
    return { byOwner: scriptTime.top(limit), scripts: scripts.top(limit), renders: renders.top(limit), hooks: hooks.top(limit) };
}

export function markLag() {
    const t = now();
    marks.push({ at: new Date().toISOString(), lastSeconds: log.filter(e => t - e.t <= 5000).map(({ t: time, ...rest }) => ({ ...rest, secondsAgo: round((t - time) / 1000) })) });
    return marks.length;
}

export function lagMarks() {
    return marks;
}

export function reset() {
    frames.clear();
    renders.clear();
    hooks.clear();
    scriptTime.clear();
    scripts.clear();
    marks.length = 0;
    snapshots.length = 0;
    log = [];
    longTasks = longTaskMs = 0;
    startedAt = now();
}

/* -------------------------------------------- */

export function initPerfCollector() {
    game.settings.register(MODULE_ID, SNAPSHOT_SETTING, {
        scope: "client",
        config: false,
        type: Number,
        default: 10,
        onChange: scheduleSnapshots
    });
    startedAt = now();
    patchHooks();
    timeRender(foundry.applications.api.ApplicationV2.prototype, "render");
    timeRender(foundry.appv1?.api?.Application?.prototype, "_render");
    startObservers();
    frameLoop();
    Hooks.once("ready", scheduleSnapshots);
    globalThis.azecraftPerf = { buildReport, markLag, reset, scanAssets, currentStats };
}
