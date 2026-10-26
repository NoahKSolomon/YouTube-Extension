// Run with: deno test --allow-read tests/
// The popup reads and sets the current tab's speed through the content script
import { assertEquals } from "jsr:@std/assert@1";
import { setup, SETTINGS } from "./harness.js";

Deno.test("the popup can read this tab's speed", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    assertEquals(t.send({ action: "getTabState" }), { hasVideo: true, speed: 2, reason: null });
    t.cleanup();
});

Deno.test("during an ad the popup sees the video's speed, not the ad's", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    await t.startAd();
    assertEquals(t.send({ action: "getTabState" }), { hasVideo: true, speed: 2, reason: null });
    t.cleanup();
});

Deno.test("the popup is told when the tab has no video", async () => {
    const t = await setup(SETTINGS(2, 0.25), { startOnWatchPage: false });
    assertEquals(t.send({ action: "getTabState" }).hasVideo, false);
    t.cleanup();
});

Deno.test("the popup can set this tab's speed", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    t.send({ action: "setTabSpeed", speed: 1.5 });
    assertEquals(t.page.video.playbackRate, 1.5);
    t.loadVideo("next", 600);
    assertEquals(t.page.video.playbackRate, 1.5);
    t.cleanup();
});

Deno.test("setting this tab's speed overrides the cutoff for that video", async () => {
    const t = await setup(SETTINGS(2, 0.25, { cutoff_in_seconds: 60 }), { duration: 30 });
    t.send({ action: "setTabSpeed", speed: 1.5 });
    assertEquals(t.page.video.playbackRate, 1.5);
    t.cleanup();
});

// The worker sends every setting when one changes, including the default speed
const refresh = (t, settings) =>
    t.tabListeners.forEach((l) => l({ action: "refreshSettings", settings }, {}, () => {}));

Deno.test("changing a setting keeps this tab's hotkey speed", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    await t.fireCommand("increment-speed");
    refresh(t, SETTINGS(2, 0.25, { skip_ads: false }));
    assertEquals(t.page.video.playbackRate, 2.25);
    t.loadVideo("next", 600);
    assertEquals(t.page.video.playbackRate, 2.25);
    t.cleanup();
});

Deno.test("a new default speed applies to a tab whose speed was not changed", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    refresh(t, SETTINGS(1.5, 0.25));
    assertEquals(t.page.video.playbackRate, 1.5);
    t.cleanup();
});

// The popup explains why a video is at 1x
Deno.test("the popup is told a short video is kept at 1x", async () => {
    const t = await setup(SETTINGS(2, 0.25, { cutoff_in_seconds: 60 }), { duration: 30 });
    assertEquals(t.send({ action: "getTabState" }), { hasVideo: true, speed: 1, reason: "short" });
    t.cleanup();
});

Deno.test("the popup is told a livestream is kept at 1x", async () => {
    const t = await setup(SETTINGS(2, 0.25), { duration: Infinity });
    assertEquals(t.send({ action: "getTabState" }), { hasVideo: true, speed: 1, reason: "livestream" });
    t.cleanup();
});

Deno.test("no reason is given once the user changes that video's speed", async () => {
    const t = await setup(SETTINGS(2, 0.25, { cutoff_in_seconds: 60 }), { duration: 30 });
    t.send({ action: "setTabSpeed", speed: 1.5 });
    assertEquals(t.send({ action: "getTabState" }).reason, null);
    t.cleanup();
});
