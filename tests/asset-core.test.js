import { test } from "node:test";
import assert from "node:assert/strict";

import {
    collectAssetPaths,
    extractAssetPaths,
    isConvertible,
    isInside,
    isUnusedCandidate,
    mentionsPath,
    movedPath,
    optimizedPath,
    replacePathDeep,
    replacePathInString
} from "../scripts/admin/asset-core.js";

const OLD = "worlds/test/Mass Effect/Maps/Big Map.png";
const NEW = "worlds/test/Mass Effect/Maps/Big Map.optimized.webp";

test("extractAssetPaths finds plain, encoded and HTML paths", () => {
    assert.deepEqual(extractAssetPaths("worlds/x/a.png"), ["worlds/x/a.png"]);
    assert.deepEqual(extractAssetPaths('<p><img src="worlds/x/Mass%20Effect/b.JPG" width="10"></p>'), ["worlds/x/Mass Effect/b.JPG"]);
    assert.deepEqual(extractAssetPaths("no assets here, just text."), []);
    assert.deepEqual(extractAssetPaths("/sounds/a.ogg?v=1"), ["sounds/a.ogg"]);
    // Folder names with spaces, as a whole value or quoted in HTML.
    assert.deepEqual(extractAssetPaths("worlds/x/Mass Effect/Party/A b.png"), ["worlds/x/Mass Effect/Party/A b.png"]);
    assert.ok(extractAssetPaths(`<img src='worlds/x/Mass Effect/c.png'>`).includes("worlds/x/Mass Effect/c.png"));
});

test("replacePathInString replaces whole paths in plain and encoded form", () => {
    assert.equal(replacePathInString(OLD, OLD, NEW), NEW);
    assert.equal(replacePathInString(`<img src="${encodeURI(OLD)}">`, OLD, NEW), `<img src="${encodeURI(NEW)}">`);
    assert.equal(replacePathInString(`/${OLD}`, OLD, NEW), `/${NEW}`);
    assert.equal(replacePathInString("worlds/test/Mass Effect/Maps/Big Map.png.bak", OLD, NEW), "worlds/test/Mass Effect/Maps/Big Map.png.bak");
    assert.equal(replacePathInString("worlds/test/Mass Effect/Maps/Big Map.pngx", OLD, NEW), "worlds/test/Mass Effect/Maps/Big Map.pngx");
    assert.equal(replacePathInString("other/worlds/test/Mass Effect/Maps/Big Map.png", OLD, NEW), "other/worlds/test/Mass Effect/Maps/Big Map.png");
    assert.equal(replacePathInString(42, OLD, NEW), 42);
});

test("replacePathDeep changes nested data and reports the keys", () => {
    const data = { img: OLD, prototypeToken: { texture: { src: OLD } }, system: { description: `<img src="${encodeURI(OLD)}">`, n: 3 }, list: ["x", OLD] };
    const { data: result, changed } = replacePathDeep(data, OLD, NEW);
    assert.equal(result.img, NEW);
    assert.equal(result.prototypeToken.texture.src, NEW);
    assert.equal(result.system.description, `<img src="${encodeURI(NEW)}">`);
    assert.equal(result.system.n, 3);
    assert.deepEqual(result.list, ["x", NEW]);
    assert.deepEqual(changed, ["img", "prototypeToken.texture.src", "system.description", "list.1"]);
    assert.equal(data.img, OLD, "input untouched");
});

test("mentionsPath, naming and folders", () => {
    assert.ok(mentionsPath(`{"img":"${encodeURI(OLD)}"}`, OLD));
    assert.ok(!mentionsPath('{"img":"other.png"}', OLD));
    assert.deepEqual(optimizedPath(OLD), { directory: "worlds/test/Mass Effect/Maps", name: "Big Map.optimized.webp", path: NEW });
    assert.equal(movedPath(OLD, "worlds/test/archive/"), "worlds/test/archive/Big Map.png");
    assert.ok(isInside(OLD, "worlds/test"));
    assert.ok(!isInside("modules/x/a.png", "worlds/test"));
    assert.ok(isConvertible("a.PNG") && isConvertible("b.jpeg"));
    assert.ok(!isConvertible("c.webp") && !isConvertible("d.svg") && !isConvertible("e.gif"));
});

test("collectAssetPaths finds paths the unused-file scan must not miss", () => {
    const setting = { key: "some-module.art", value: JSON.stringify({ banner: "worlds/w/banner.png", list: ["/worlds/w/a%20b.jpg"] }) };
    const doc = {
        img: "worlds/w/token.webp?v=3",
        spaced: "worlds/w/Mass Effect/spaced.png",
        html: "<p>Intro\n<img src='worlds/w/single.png'> <div style=\"background: url(worlds/w/bg.jpg)\"></div></p>",
        abs: "http://localhost:30000/worlds/w/abs.png#x",
        registry: { "worlds/w/key.png": { thumb: "worlds/w/key.thumb.webp" } },
        setting
    };
    assert.deepEqual([...collectAssetPaths(doc)].sort(), [
        "worlds/w/Mass Effect/spaced.png", "worlds/w/a b.jpg", "worlds/w/abs.png", "worlds/w/banner.png", "worlds/w/bg.jpg", "worlds/w/key.png", "worlds/w/key.thumb.webp",
        "worlds/w/single.png", "worlds/w/token.webp"
    ]);
});

test("replacePathInString leaves a folder named like the file alone", () => {
    assert.equal(replacePathInString("worlds/w/a.png/other.png", "worlds/w/a.png", "worlds/w/b.webp"), "worlds/w/a.png/other.png");
    assert.equal(replacePathInString("worlds/w/a.png", "worlds/w/a.png", "worlds/w/b.webp"), "worlds/w/b.webp");
});

test("optimizedPath can keep the extension (Name.png next to Name.jpg)", () => {
    assert.equal(optimizedPath("worlds/w/portrait.png", { withExtension: true }).path, "worlds/w/portrait.png.optimized.webp");
});

test("isUnusedCandidate never offers world data or packs for deleting", () => {
    assert.equal(isUnusedCandidate("worlds/test/Mass Effect/a b.png"), true);
    assert.equal(isUnusedCandidate("worlds/test/music/theme.ogg"), true);
    assert.equal(isUnusedCandidate("worlds/test/world.json"), false);
    assert.equal(isUnusedCandidate("worlds/test/data/actors/000221.ldb"), false);
    assert.equal(isUnusedCandidate("worlds/test/data/actors/cover.png"), false);
    assert.equal(isUnusedCandidate("worlds/test/packs/npcs/000005.ldb"), false);
    assert.equal(isUnusedCandidate("modules/x/packs/art/a.png"), false);
});

test("relink finds and writes Foundry's URL form of names with apostrophes, &, # and spaces", () => {
    const old = "worlds/w/Tali's A&B #1.png";
    const stored = "worlds/w/Tali%27s%20A%26B%20%231.png";
    assert.equal(mentionsPath(`<img src="${stored}">`, old), true);
    assert.equal(replacePathInString(stored, old, "worlds/w/Tali's A&B #1.optimized.webp"), "worlds/w/Tali%27s%20A%26B%20%231.optimized.webp");
    assert.equal(replacePathInString("worlds/w/Tali's A&B #1.png", old, "worlds/w/new one.webp"), "worlds/w/new one.webp");
});
