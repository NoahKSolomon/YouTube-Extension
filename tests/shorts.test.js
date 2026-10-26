// Run with: deno test --allow-read tests/
// Recorded in Chrome: Shorts play in #shorts-player, which reuses one <video>
// for every Short as you swipe, with the id in the path (/shorts/<id>).
// YouTube's hidden watch player (#movie_player) can exist alongside it.
import { assertEquals } from "jsr:@std/assert@1";
import { setup, SETTINGS } from "./harness.js";

const SHORTS_ON = SETTINGS(2, 0.25, { enabled_for_shorts: true });

Deno.test("Shorts are left alone while the Shorts setting is off", async () => {
    const t = await setup(SETTINGS(2, 0.25), { startOnShort: true });
    assertEquals(t.page.shortsVideo.playbackRate, 1);
    assertEquals(t.send({ action: "getTabState" }).hasVideo, false);
    t.cleanup();
});

Deno.test("with Shorts on, a Short plays at the default speed", async () => {
    const t = await setup(SHORTS_ON, { startOnShort: true });
    assertEquals(t.page.shortsVideo.playbackRate, 2);
    assertEquals(t.badge(), "2x");
    t.cleanup();
});

Deno.test("swiping to the next Short keeps the speed", async () => {
    const t = await setup(SHORTS_ON, { startOnShort: true });
    await t.fireCommand("increment-speed");
    t.swipeToShort("short2", 30);
    assertEquals(t.page.shortsVideo.playbackRate, 2.25);
    t.cleanup();
});

Deno.test("on a Short, hotkeys change the Short and not the hidden watch player", async () => {
    const t = await setup(SHORTS_ON);
    await t.openShort("short1");
    await t.fireCommand("increment-speed");
    assertEquals(t.page.shortsVideo.playbackRate, 2.25);
    assertEquals(t.page.video.playbackRate, 2);
    t.cleanup();
});

Deno.test("going back to a regular video applies the speed there again", async () => {
    const t = await setup(SHORTS_ON);
    await t.openShort("short1");
    await t.goToWatchPage("def");
    await t.fireCommand("increment-speed");
    assertEquals(t.page.video.playbackRate, 2.25);
    assertEquals(t.page.injectCount, 1);
    t.page.video.dispatch("timeupdate");
    assertEquals(t.page.injected.textContent, "(0:00/4:26) 2.25x");
    t.cleanup();
});

Deno.test("the cutoff applies to each Short", async () => {
    const t = await setup(SETTINGS(2, 0.25, { enabled_for_shorts: true, cutoff_in_seconds: 60 }), { startOnShort: true });
    assertEquals(t.page.shortsVideo.playbackRate, 1);
    await t.fireCommand("increment-speed");
    assertEquals(t.page.shortsVideo.playbackRate, 1.25);
    t.swipeToShort("short2", 30);
    assertEquals(t.page.shortsVideo.playbackRate, 1);
    t.cleanup();
});

Deno.test("turning Shorts on applies to the open Short right away", async () => {
    const t = await setup(SETTINGS(2, 0.25), { startOnShort: true });
    t.tabListeners.forEach((l) => l({ action: "refreshSettings", settings: SHORTS_ON }, {}, () => {}));
    assertEquals(t.page.shortsVideo.playbackRate, 2);
    t.cleanup();
});
