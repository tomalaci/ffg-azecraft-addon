import { test } from "node:test";
import assert from "node:assert/strict";

import { plainPath, urlPath, withoutQuery } from "../scripts/paths.js";

test("urlPath encodes once, whatever form it gets", () => {
    assert.equal(urlPath("worlds/x/Mass Effect/a.png"), "worlds/x/Mass%20Effect/a.png");
    assert.equal(urlPath("worlds/x/Mass%20Effect/a.png"), "worlds/x/Mass%20Effect/a.png");
    assert.equal(urlPath(urlPath("worlds/x/Mass Effect/a.png")), "worlds/x/Mass%20Effect/a.png");
});

test("urlPath keeps # and ? in file names inside the path", () => {
    assert.equal(urlPath("worlds/x/Map #2 (v?).png"), "worlds/x/Map%20%232%20(v%3F).png");
    assert.equal(plainPath(urlPath("worlds/x/Map #2 (v?).png")), "worlds/x/Map #2 (v?).png");
});

test("urlPath matches Foundry's encodeURL (per segment, apostrophes too)", () => {
    assert.equal(urlPath("worlds/x/Tali's A&B, c+d.png"), "worlds/x/Tali%27s%20A%26B%2C%20c%2Bd.png");
});

test("a literal % survives", () => {
    assert.equal(plainPath("worlds/x/100% done.png"), "worlds/x/100% done.png");
    assert.equal(urlPath("worlds/x/100% done.png"), "worlds/x/100%25%20done.png");
    assert.equal(urlPath("worlds/x/100%25%20done.png"), "worlds/x/100%25%20done.png");
});

test("withoutQuery drops a real query or hash but keeps # and ? in file names (safe twice)", () => {
    assert.equal(withoutQuery("worlds/x/a.png?v=2"), "worlds/x/a.png");
    assert.equal(withoutQuery("worlds/x/a.png?1712345#top"), "worlds/x/a.png");
    assert.equal(withoutQuery("worlds/x/Map #1.png"), "worlds/x/Map #1.png");
    assert.equal(withoutQuery("worlds/x/Why?.png"), "worlds/x/Why?.png");
    assert.equal(withoutQuery(withoutQuery("worlds/x/Map #1.png?v=3")), "worlds/x/Map #1.png");
});
