import { test } from "node:test";
import assert from "node:assert/strict";

import { clampColumns, computeLayout, frameWindow, moveDivider } from "../scripts/mission-dashboard/layout.js";

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

// Rects measured from the local Foundry 13.351 UI at 1920x1080 with the sidebar expanded.
const desktop = {
    width: 1920,
    height: 1080,
    controls: rect(16, 16, 72, 929),
    navActive: rect(104, 16, 170, 32),
    navExpand: rect(280, 20, 24, 24),
    players: rect(16, 961, 72, 103),
    destiny: rect(0, 978, 200, 102),
    hotbar: rect(578, 1004, 764, 60),
    sidebar: rect(1572, 0, 348, 1080)
};

test("desktop layout clears the core UI and is not compact", () => {
    const { compact, values } = computeLayout(desktop, { framed: false });

    assert.equal(compact, false);
    assert.equal(values["--azd-left"], "100px");
    assert.equal(values["--azd-top"], "56px");
    assert.equal(values["--azd-rail-bottom"], "127px");
    assert.equal(values["--azd-right"], "360px");
    assert.equal(values["--azd-bottom"], "84px");
    // Hidden-mode restore button: top of the screen, right of the scene navigation.
    assert.equal(values["--azd-toggle-left"], "316px");
    assert.equal(values["--azd-toggle-top"], "16px");
});

test("laptop size with sidebar open switches to compact", () => {
    const laptop = { ...desktop, width: 1366, height: 768, sidebar: rect(1018, 0, 348, 768), hotbar: rect(301, 692, 764, 60) };
    const { compact, values } = computeLayout(laptop);

    assert.equal(compact, true);
    assert.equal(values["--azd-rail-width"], "280px");
});

test("preferences override automatic compact mode and collapse the drawer", () => {
    assert.equal(computeLayout(desktop, { compactPreference: "always" }).compact, true);
    const laptop = { ...desktop, width: 1366, height: 768 };
    assert.equal(computeLayout(laptop, { compactPreference: "never" }).compact, false);
    assert.equal(computeLayout(desktop, { missionCollapsed: true }).values["--azd-mission-height"], "34px");
});

test("a destiny tracker moved away from the bottom does not shrink the rail", () => {
    const { values } = computeLayout({ ...desktop, destiny: rect(0, 300, 200, 102) }, { framed: false });
    assert.equal(values["--azd-rail-bottom"], "127px");
});

test("missing UI elements fall back to small margins", () => {
    const { values } = computeLayout({ width: 1600, height: 900 });
    assert.equal(values["--azd-left"], "12px");
    assert.equal(values["--azd-right"], "12px");
});

test("the frame window is the map area between the rail, bottom bar and sidebar", () => {
    const view = frameWindow(desktop);
    // rail 100 + 420 + gap 12; sidebar starts at 1572; bottom bar = hotbar inset 84 + panels 220 + gap 12
    assert.deepEqual(view, { left: 532, top: 0, right: 1572, bottom: 764 });
});

test("framed: the squad column ends where the mission tabs begin", () => {
    const { values } = computeLayout(desktop);
    // hotbar inset 84 + mission panels 220 = 304 from the bottom, the top edge of the tabs
    assert.equal(values["--azd-rail-bottom"], "304px");
    assert.equal(computeLayout(desktop, { missionCollapsed: true }).values["--azd-rail-bottom"], "127px");
});

const near = (actual, expected) => actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 0.5, `${actual} vs ${expected}`));

test("mission tabs default to equal widths and keep a minimum width", () => {
    near(clampColumns(undefined, 900), [300, 300, 300]);
    near(clampColumns([0.8, 0.1, 0.1], 900), [540, 180, 180]);
    // Too narrow for the minimum: equal split rather than overflow.
    near(clampColumns([0.8, 0.1, 0.1], 450), [150, 150, 150]);
});

test("dragging a divider only trades width between its neighbours, within limits", () => {
    const total = 900;
    near(moveDivider(undefined, 0, 400, total).map(f => f * total), [400, 200, 300]);
    near(moveDivider(undefined, 0, 50, total).map(f => f * total), [180, 420, 300]);
    near(moveDivider(undefined, 1, 450, total).map(f => f * total), [300, 180, 420]);
    near(moveDivider(undefined, 1, 890, total).map(f => f * total), [300, 420, 180]);
});

test("the mission bar spans from the frame to the sidebar and is split by the columns", () => {
    const { values, bar } = computeLayout(desktop, { columns: [0.5, 0.25, 0.25] });
    // rail 100 + 420 + gap 12 + frame padding 12 = 544; sidebar 1572 - 12 = 1560
    assert.deepEqual(bar, { left: 544, width: 1016 });
    assert.equal(values["--azd-col-1"], "508px");
    assert.equal(values["--azd-col-2"], "254px");
    assert.equal(values["--azd-col-3"], "254px");
});
