import { test } from "node:test";
import assert from "node:assert/strict";

import {
    MAX_SAMPLE_MS, MIN_SAMPLE_GAP_MS, MIN_SAMPLE_MS, SAMPLE_BUFFER, StrokeSampler,
    averageSpeed, imageFileName, pixelToColor, samplingInterval, softenFullChannels, uploadFolder
} from "../scripts/precise-drawing/drawing-core.js";

test("sampling interval gives two points per target distance, within bounds", () => {
    // 1 px/ms with a 50 px target: a point every 25 ms.
    assert.equal(samplingInterval(1, 50), 25);
    assert.equal(samplingInterval(0.5, 50), 50);
    // Very slow (or still): Foundry's own slowest rate.
    assert.equal(samplingInterval(0.01, 50), MAX_SAMPLE_MS);
    assert.equal(samplingInterval(0, 50), MAX_SAMPLE_MS);
    assert.equal(samplingInterval(Number.NaN, 50), MAX_SAMPLE_MS);
    // Very fast: never more often than the minimum.
    assert.equal(samplingInterval(100, 50), MIN_SAMPLE_MS);
    assert.equal(samplingInterval(Infinity, 50), MIN_SAMPLE_MS);
});

test("average speed skips samples with no time between them", () => {
    assert.equal(averageSpeed([]), 0);
    assert.equal(averageSpeed([{ x: 0, y: 0, t: 0 }]), 0);
    assert.equal(averageSpeed([{ x: 0, y: 0, t: 0 }, { x: 3, y: 4, t: 5 }]), 1);
    assert.equal(averageSpeed([{ x: 0, y: 0, t: 0 }, { x: 3, y: 4, t: 5 }, { x: 9, y: 4, t: 5 }, { x: 9, y: 24, t: 15 }]), 1.5);
});

test("a stroke starts at the fastest sampling, then follows the speed", () => {
    const sampler = new StrokeSampler();
    assert.equal(sampler.interval(50), MIN_SAMPLE_MS);
    assert.equal(sampler.add(0, 0, 0, 50), MIN_SAMPLE_MS);
    // 20 px in 20 ms = 1 px/ms -> 25 ms.
    assert.equal(sampler.add(20, 0, 20, 50), 25);
    // Too soon after the last sample: not recorded.
    sampler.add(1000, 0, 20 + MIN_SAMPLE_GAP_MS - 1, 50);
    assert.equal(sampler.samples.length, 2);
    sampler.reset();
    assert.equal(sampler.samples.length, 0);
});

test("the sampler keeps positions and times together when it trims old samples", () => {
    const sampler = new StrokeSampler();
    // A slow start (0.1 px/ms), then a long fast part (2 px/ms): only the recent speed counts.
    for (let i = 0; i < 5; i++) sampler.add(i, 0, i * 10, 50);
    for (let i = 1; i <= SAMPLE_BUFFER * 2; i++) sampler.add(4 + i * 20, 0, 40 + i * 10, 50);
    assert.equal(sampler.samples.length, SAMPLE_BUFFER);
    assert.equal(averageSpeed(sampler.samples), 2);
    assert.equal(sampler.interval(50), 12.5);
});

test("pixels become a drawing colour and alpha", () => {
    assert.deepEqual(pixelToColor([255, 0, 16, 255]), { color: "#ff0010", alpha: 1 });
    assert.deepEqual(pixelToColor([1, 2, 3, 0]), { color: "#010203", alpha: 0 });
    assert.deepEqual(pixelToColor([0, 0, 0, 128]), { color: "#000000", alpha: 0.5 });
    assert.deepEqual(pixelToColor([10, 20, 30]), { color: "#0a141e", alpha: 1 });
});

test("full channels of half-transparent colours are lowered one step", () => {
    assert.equal(softenFullChannels(0xff00ff, 0.5), 0xfe00fe);
    assert.equal(softenFullChannels(0xffffff, 0.2), 0xfefefe);
    assert.equal(softenFullChannels(0x12fe34, 0.5), 0x12fe34);
    // Opaque or invisible: unchanged.
    assert.equal(softenFullChannels(0xff00ff, 1), 0xff00ff);
    assert.equal(softenFullChannels(0xff00ff, 0), 0xff00ff);
});

test("image file names are safe and end in .webp", () => {
    assert.equal(imageFileName("  Cave map  "), "Cave map.webp");
    assert.equal(imageFileName("cave.webp"), "cave.webp");
    assert.equal(imageFileName("../secret/map"), "_secret_map.webp");
    assert.equal(imageFileName("Tårn: øst?"), "Tårn_ øst_.webp");
    assert.equal(imageFileName("   "), "");
    assert.equal(imageFileName(".."), "");
    assert.equal(imageFileName(undefined), "");
});

test("converted drawings go into the world's folder", () => {
    assert.equal(uploadFolder("my-world"), "worlds/my-world/converted-drawings");
});
