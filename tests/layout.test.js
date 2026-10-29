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

test("a chosen rail level overrides automatic compact mode; collapse shrinks the drawer", () => {
    assert.equal(computeLayout(desktop, { railLevel: 2 }).compact, true);
    const laptop = { ...desktop, width: 1366, height: 768 };
    assert.equal(computeLayout(laptop, { railLevel: 3 }).compact, false);
    assert.equal(computeLayout(laptop).railLevel, 2, "auto is compact on a laptop");
    assert.equal(computeLayout(desktop).railLevel, 3, "auto is normal on a desktop");
    assert.equal(computeLayout(desktop, { missionCollapsed: true }).values["--azd-mission-height"], "34px");
});

test("rail levels: 1 is two thirds of compact, 4 keeps the normal column and spans a strip", () => {
    assert.equal(computeLayout(desktop, { railLevel: 1 }).values["--azd-rail-width"], "187px");
    assert.equal(computeLayout(desktop, { railLevel: 1 }).compact, true);
    const strip = computeLayout(desktop, { railLevel: 4 });
    assert.equal(strip.compact, false);
    assert.equal(strip.values["--azd-rail-width"], "420px");
    // left 100 to sidebar 1572 - 12; bottom: hotbar inset 84 + panels 220 + gap 12
    assert.equal(strip.values["--azd-strip-width"], "1460px");
    assert.equal(strip.values["--azd-strip-bottom"], "316px");
});

test("panel levels: half the screen, then up to the top bar; never with the horizontal rail", () => {
    assert.equal(computeLayout(desktop, { ledgerLevel: 2 }).values["--azd-mission-height"], "456px");
    // 1080 - hotbar inset 84 - top 56; with the toolbar (bottom 50): below it, 1080 - 84 - 64
    assert.equal(computeLayout(desktop, { ledgerLevel: 3 }).values["--azd-mission-height"], "940px");
    assert.equal(computeLayout({ ...desktop, toolbar: rect(544, 16, 900, 34) }, { ledgerLevel: 3 }).values["--azd-mission-height"], "932px");
    const both = computeLayout(desktop, { railLevel: 4, ledgerLevel: 3 });
    assert.equal(both.ledgerLevel, 1);
    assert.equal(both.values["--azd-mission-height"], "220px");
});

test("toolbar windows use the normal layout's space whatever the levels", () => {
    const normal = computeLayout(desktop).values;
    for (const options of [{ railLevel: 4 }, { ledgerLevel: 3 }, { ledgerLevel: 2 }]) {
        const values = computeLayout(desktop, options).values;
        assert.equal(values["--azd-space-left"], normal["--azd-space-left"]);
        assert.equal(values["--azd-space-bottom"], normal["--azd-space-bottom"]);
    }
    assert.equal(normal["--azd-space-left"], "532px");
    assert.equal(normal["--azd-space-bottom"], "316px");
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

test("framed: the squad column runs down to the story point bar in the corner", () => {
    // The bar (destiny rect) tops out at 978; the player list above it is hidden in practice.
    const { values } = computeLayout({ ...desktop, players: null });
    assert.equal(values["--azd-rail-bottom"], "110px");
    // Nothing docked bottom-left: hotbar inset 84 + mission panels 220 = 304, the top of the tabs.
    assert.equal(computeLayout({ ...desktop, players: null, destiny: null }).values["--azd-rail-bottom"], "304px");
    assert.equal(computeLayout({ ...desktop, players: null, destiny: null }, { missionCollapsed: true }).values["--azd-rail-bottom"], "118px");
});

const near = (actual, expected) => actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 0.5, `${actual} vs ${expected}`));

test("mission tabs default to equal widths and keep a minimum width", () => {
    near(clampColumns(undefined, 900), [450, 450]);
    near(clampColumns([0.9, 0.1], 900), [720, 180]);
    // Too narrow for the minimum: equal split rather than overflow.
    near(clampColumns([0.9, 0.1], 300), [150, 150]);
    // Saved widths of the earlier three tabs: equal widths.
    near(clampColumns([0.5, 0.25, 0.25], 900), [450, 450]);
});

test("dragging the divider trades width between the two tabs, within limits", () => {
    const total = 900;
    near(moveDivider(undefined, 400, total).map(f => f * total), [400, 500]);
    near(moveDivider(undefined, 50, total).map(f => f * total), [180, 720]);
    near(moveDivider(undefined, 890, total).map(f => f * total), [720, 180]);
});

test("the mission bar spans from the frame to the sidebar and is split by the columns", () => {
    const { values, bar } = computeLayout(desktop, { columns: [0.75, 0.25] });
    // rail 100 + 420 + gap 12 + frame padding 12 = 544; sidebar 1572 - 12 = 1560
    assert.deepEqual(bar, { left: 544, width: 1016 });
    assert.equal(values["--azd-col-1"], "762px");
    assert.equal(values["--azd-col-2"], "254px");
});
