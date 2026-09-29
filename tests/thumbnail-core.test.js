import { test } from "node:test";
import assert from "node:assert/strict";

import { copyPath, copySize, hash, isCandidatePath, lookup, normalizeSrc, worthCopying } from "../scripts/thumbnails/thumbnail-core.js";

test("normalizeSrc makes encoded, absolute and plain paths match", () => {
    const plain = "worlds/test/Mass Effect/Party/Moyra_New.png";
    assert.equal(normalizeSrc(plain), plain);
    assert.equal(normalizeSrc("worlds/test/Mass%20Effect/Party/Moyra_New.png"), plain);
    assert.equal(normalizeSrc("/worlds/test/Mass Effect/Party/Moyra_New.png?v=2"), plain);
    assert.equal(normalizeSrc("https://foundry.example/worlds/test/Mass%20Effect/Party/Moyra_New.png", "https://foundry.example/"), plain);
    assert.equal(normalizeSrc("https://elsewhere.example/a.png", "https://foundry.example/"), "");
    assert.equal(normalizeSrc("data:image/png;base64,AAA"), "");
    assert.equal(normalizeSrc(null), "");
});

test("candidates exclude vector, animated and already-copied images", () => {
    assert.ok(isCandidatePath("worlds/x/a.png"));
    assert.ok(isCandidatePath("worlds/x/a.JPG"));
    assert.ok(!isCandidatePath("icons/svg/mystery-man.svg"));
    assert.ok(!isCandidatePath("worlds/x/a.webm"));
    assert.ok(!isCandidatePath("worlds/x/azecraft-thumbs/abc-a.webp"));
});

test("worthCopying: large files or large images", () => {
    assert.ok(worthCopying({ bytes: 76 * 1024 * 1024 }));
    assert.ok(worthCopying({ width: 3000, height: 2000 }));
    assert.ok(!worthCopying({ bytes: 135 * 1024, width: 865, height: 1080 }));
    assert.ok(!worthCopying({}));
});

test("copySize keeps the aspect ratio and never enlarges", () => {
    assert.deepEqual(copySize(5122, 7242, 1400), { width: 990, height: 1400 });
    assert.deepEqual(copySize(3000, 2000, 1400), { width: 1400, height: 933 });
    assert.deepEqual(copySize(800, 600, 1400), { width: 800, height: 600 });
    assert.deepEqual(copySize(0, 0), { width: 0, height: 0 });
});

test("copy paths are stable per source and readable", () => {
    const a = copyPath("test", "worlds/test/Mass Effect/Party/Moyra_New.png");
    assert.equal(a.directory, "worlds/test/azecraft-thumbs");
    assert.match(a.name, /^[0-9a-f]{8}-Moyra_New\.webp$/);
    assert.deepEqual(copyPath("test", "worlds/test/Mass%20Effect/Party/Moyra_New.png"), a, "encoded path gives the same copy");
    assert.notEqual(copyPath("test", "worlds/test/Other/Moyra_New.png").name, a.name);
    assert.equal(hash("abc"), hash("abc"));
});

test("lookup finds a copy by any form of the source path", () => {
    const registry = { "worlds/test/Mass Effect/a.png": { thumb: "worlds/test/azecraft-thumbs/1-a.webp" } };
    assert.equal(lookup(registry, "worlds/test/Mass%20Effect/a.png"), "worlds/test/azecraft-thumbs/1-a.webp");
    assert.equal(lookup(registry, "worlds/test/other.png"), null);
    assert.equal(lookup(null, "x"), null);
});
