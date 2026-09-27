import { test } from "node:test";
import assert from "node:assert/strict";

import { computeLayout } from "../scripts/mission-dashboard/layout.js";

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
    const { compact, values } = computeLayout(desktop);

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
    assert.equal(values["--azd-rail-width"], "260px");
});

test("preferences override automatic compact mode and collapse the drawer", () => {
    assert.equal(computeLayout(desktop, { compactPreference: "always" }).compact, true);
    const laptop = { ...desktop, width: 1366, height: 768 };
    assert.equal(computeLayout(laptop, { compactPreference: "never" }).compact, false);
    assert.equal(computeLayout(desktop, { missionCollapsed: true }).values["--azd-mission-height"], "34px");
});

test("a destiny tracker moved away from the bottom does not shrink the rail", () => {
    const { values } = computeLayout({ ...desktop, destiny: rect(0, 300, 200, 102) });
    assert.equal(values["--azd-rail-bottom"], "127px");
});

test("missing UI elements fall back to small margins", () => {
    const { values } = computeLayout({ width: 1600, height: 900 });
    assert.equal(values["--azd-left"], "12px");
    assert.equal(values["--azd-right"], "12px");
});
