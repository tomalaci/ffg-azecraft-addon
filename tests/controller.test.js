/**
 * Controller lifecycle with stubbed Foundry globals: stale async mission renders from a previous
 * Scene must never be rendered after switching Scenes.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

import { makePage } from "./fixtures.js";

const renders = [];
const pending = [];
let viewed = null;
let DashboardController;

function makeScene(id, pageUuid) {
    return {
        id,
        name: id,
        navName: "",
        flags: { "ffg-azecraft-addon": { dashboard: { enabled: true, party: [], mission: { summaryPageUuid: pageUuid } } } }
    };
}

before(async () => {
    const pages = new Map();
    for (const scene of ["A", "B"]) {
        const page = makePage({ name: `Summary ${scene}` });
        page.uuid = `JournalEntry.${scene}.JournalEntryPage.p`;
        page.text = { content: `<p>${scene}</p>` };
        page.isOwner = false;
        page.canUserModify = () => false;
        pages.set(page.uuid, page);
    }

    class FakeApp {
        constructor(controller) { this.controller = controller; this.rendered = false; }
        async render(options) {
            this.rendered = true;
            renders.push({ options, summary: this.controller.view?.mission?.summary?.html });
        }
        async close() { this.rendered = false; }
        applyPreferences() {}
    }

    globalThis.DOMParser = class {
        parseFromString(html) { return { body: { textContent: html.replace(/<[^>]*>/g, "") } }; }
    };
    globalThis.game = {
        user: { id: "p", isGM: false },
        users: [],
        scenes: { get viewed() { return viewed; } },
        settings: { get: (_m, key) => (key === "dashboardCompact" ? "auto" : key === "campaignLedgerUuid" ? "" : false) },
        journal: []
    };
    globalThis.Hooks = { on() {}, off() {} };
    globalThis.foundry = {
        utils: {
            fromUuidSync: uuid => pages.get(uuid) ?? null,
            escapeHTML: s => s,
            hasProperty: () => false
        },
        applications: {
            api: {
                ApplicationV2: class {},
                HandlebarsApplicationMixin: Base => class extends Base {},
                DialogV2: class {}
            },
            ux: {
                TextEditor: {
                    implementation: {
                        // Enrichment resolves only when the test says so.
                        enrichHTML: content => new Promise(resolve => pending.push(() => resolve(content)))
                    }
                }
            }
        }
    };

    const module = await import("../scripts/mission-dashboard/controller.js");
    DashboardController = module.DashboardController;
    const appModule = await import("../scripts/mission-dashboard/dashboard-app.js");
    // Swap the real app for the fake one.
    Object.setPrototypeOf(appModule.MissionDashboardApp.prototype, FakeApp.prototype);
    appModule.MissionDashboardApp.prototype.render = FakeApp.prototype.render;
    appModule.MissionDashboardApp.prototype.close = FakeApp.prototype.close;
    appModule.MissionDashboardApp.prototype.applyPreferences = FakeApp.prototype.applyPreferences;
});

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test("a slow render for Scene A is dropped after switching to Scene B", async () => {
    const controller = new DashboardController();

    viewed = makeScene("A", "JournalEntry.A.JournalEntryPage.p");
    controller.sync();
    await tick();

    viewed = makeScene("B", "JournalEntry.B.JournalEntryPage.p");
    controller.sync();
    await tick();

    // One enrichment per Scene is waiting. Resolve B first, then the stale A enrichment.
    assert.equal(pending.length, 2);
    const [resolveA, resolveB] = pending.splice(0);
    resolveB();
    await tick();
    resolveA();
    await tick();

    const summaries = renders.map(r => r.summary).filter(Boolean);
    assert.ok(summaries.length > 0, "Scene B rendered");
    assert.ok(summaries.every(html => html === "<p>B</p>"), `only Scene B content rendered, got ${JSON.stringify(summaries)}`);
    assert.equal(controller.view.mission.summary.html, "<p>B</p>");
});

test("disabling the dashboard unmounts it", async () => {
    const controller = new DashboardController();
    viewed = makeScene("A", null);
    controller.sync();
    await tick();
    for (const resolve of pending.splice(0)) resolve();
    await tick();
    assert.ok(controller.app);

    viewed = { ...viewed, flags: { "ffg-azecraft-addon": { dashboard: { enabled: false } } } };
    controller.sync();
    assert.equal(controller.app, null);
    assert.equal(controller.view, null);
});

test("a mission refresh queued during enrichment drops the in-flight result (e.g. access revoked)", async () => {
    renders.length = 0;
    pending.length = 0;
    const controller = new DashboardController();
    viewed = makeScene("A", "JournalEntry.A.JournalEntryPage.p");
    controller.sync();
    await tick();
    for (const resolve of pending.splice(0)) resolve();
    await tick();

    // A second, slow build starts; while it is pending, a permission change queues a refresh.
    controller.refresh("mission");
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(pending.length, 1);
    const stale = pending.shift();
    const rendersBefore = renders.length;
    controller.refresh("mission");
    stale();
    await tick();
    assert.equal(renders.length, rendersBefore, "stale enrichment was not rendered");
    controller.unmount();
});

test("unmount while enrichment is pending never remounts the HUD", async () => {
    pending.length = 0;
    const controller = new DashboardController();
    viewed = makeScene("A", "JournalEntry.A.JournalEntryPage.p");
    controller.sync();
    await tick();
    controller.unmount();
    for (const resolve of pending.splice(0)) resolve();
    await tick();
    await tick();

    assert.equal(controller.app, null);
    assert.equal(controller.view, null);
});
