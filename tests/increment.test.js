// Run with: deno test --allow-read tests/
import { assert, assertEquals } from "jsr:@std/assert@1";
import { matchPatternToRegExp, read, setup, SETTINGS } from "./harness.js";

Deno.test("increment hotkey raises speed by exactly one increment", async () => {
    const t = await setup(SETTINGS(1, 0.25));
    assertEquals(t.commandListeners.length, 1);
    assertEquals(t.tabListeners.length, 1);
    assertEquals(t.page.video.playbackRate, 1);
    await t.fireCommand("increment-speed");
    assertEquals(t.page.video.playbackRate, 1.25);
    await t.fireCommand("increment-speed");
    assertEquals(t.page.video.playbackRate, 1.5);
    t.cleanup();
});

Deno.test("decrement hotkey lowers speed by exactly one increment", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    await t.fireCommand("decrement-speed");
    assertEquals(t.page.video.playbackRate, 1.75);
    t.cleanup();
});

// YouTube can change the video's rate itself (its own speed menu or Shift+</>,
// or resetting the rate when it loads the next video without a page reload).
// The hotkey must step from the rate the video is actually playing at.
Deno.test("increment steps from the video's current rate after YouTube changes it", async () => {
    const t = await setup(SETTINGS(2, 1));
    assertEquals(t.page.video.playbackRate, 2);
    t.page.video.playbackRate = 1; // YouTube resets the rate
    await t.fireCommand("increment-speed");
    assertEquals(t.page.video.playbackRate, 2);
    t.cleanup();
});

Deno.test("decrement steps from the video's current rate after YouTube changes it", async () => {
    const t = await setup(SETTINGS(2, 0.5));
    t.page.video.playbackRate = 1.5;
    await t.fireCommand("decrement-speed");
    assertEquals(t.page.video.playbackRate, 1);
    t.cleanup();
});

// YouTube is a single page app: opening a video from the home page changes
// the URL with history.pushState, so Chrome never injects a content script
// that only matches /watch. It has to already be running on the home page.
Deno.test("content script is injected on the YouTube home page", async () => {
    const manifest = JSON.parse(await read("manifest.json"));
    const patterns = manifest.content_scripts.flatMap((cs) => cs.matches).map(matchPatternToRegExp);
    for (const url of ["https://www.youtube.com/", "https://www.youtube.com/watch?v=abc"]) {
        assert(patterns.some((p) => p.test(url)), `content script does not match ${url}`);
    }
});

Deno.test("loading on a page with no player does not throw", async () => {
    const t = await setup(SETTINGS(2, 0.25), { startOnWatchPage: false });
    assertEquals(t.errors, []);
    t.cleanup();
});

Deno.test("opening a video after loading on the home page applies speed and indicator", async () => {
    const t = await setup(SETTINGS(2, 0.25), { startOnWatchPage: false });
    await t.openVideo();
    assertEquals(t.page.video.playbackRate, 2);
    assertEquals(t.page.injectCount, 1);
    t.page.video.dispatch("timeupdate");
    assertEquals(t.page.injected.textContent, "(0:00/5:00) 2x");
    await t.fireCommand("increment-speed");
    assertEquals(t.page.video.playbackRate, 2.25);
    t.cleanup();
});

Deno.test("hotkeys before a video is opened do not throw", async () => {
    const t = await setup(SETTINGS(2, 0.25), { startOnWatchPage: false });
    await t.fireCommand("increment-speed");
    assertEquals(t.errors, []);
    t.cleanup();
});

Deno.test("settings broadcasts reach YouTube tabs that are not on /watch", async () => {
    const worker = await read("scripts/worker.js");
    const [, pattern] = worker.match(/tab\.url\.match\('([^']+)'\)/);
    assert(new RegExp(pattern).test("https://www.youtube.com/"), `worker skips tabs on youtube.com/`);
});

// Chrome plays from 0.0625x to 16x; 0 stalls the video and anything else
// outside that throws
Deno.test("decrementing stops at the slowest speed instead of 0", async () => {
    const t = await setup(SETTINGS(1, 1));
    await t.fireCommand("decrement-speed");
    assertEquals(t.page.video.playbackRate, 0.0625);
    await t.fireCommand("decrement-speed");
    assertEquals(t.page.video.playbackRate, 0.0625);
    assertEquals(t.errors, []);
    t.cleanup();
});

Deno.test("incrementing stops at the fastest speed", async () => {
    const t = await setup(SETTINGS(15.5, 1));
    await t.fireCommand("increment-speed");
    assertEquals(t.page.video.playbackRate, 16);
    t.loadVideo("next", 600);
    assertEquals(t.page.video.playbackRate, 16);
    t.cleanup();
});

Deno.test("small steps do not build up floating point error", async () => {
    const t = await setup(SETTINGS(1, 0.1));
    for (let i = 0; i < 3; i++) await t.fireCommand("increment-speed");
    assertEquals(t.page.video.playbackRate, 1.3);
    t.cleanup();
});
