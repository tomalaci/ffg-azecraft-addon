import { test } from "node:test";
import assert from "node:assert/strict";

import {
    extractAssetPaths,
    isConvertible,
    isInside,
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
