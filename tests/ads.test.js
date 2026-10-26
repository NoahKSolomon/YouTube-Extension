// Run with: deno test --allow-read tests/
import { assertEquals } from "jsr:@std/assert@1";
import { setup, SETTINGS } from "./harness.js";

Deno.test("an ad plays at maximum speed and muted", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    await t.startAd();
    assertEquals(t.page.video.playbackRate, 16);
    assertEquals(t.page.video.muted, true);
    t.cleanup();
});

Deno.test("speed and sound are restored when the ad ends", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    await t.startAd();
    await t.endAd();
    assertEquals(t.page.video.playbackRate, 2);
    assertEquals(t.page.video.muted, false);
    t.cleanup();
});

Deno.test("a video the user muted stays muted after the ad", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    t.page.video.muted = true;
    await t.startAd();
    await t.endAd();
    assertEquals(t.page.video.muted, true);
    t.cleanup();
});

Deno.test("an ad already playing when the script attaches is sped up", async () => {
    const t = await setup(SETTINGS(2, 0.25), { startInAd: true });
    assertEquals(t.page.video.playbackRate, 16);
    t.cleanup();
});

Deno.test("YouTube resetting the rate mid-ad is overridden", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    await t.startAd();
    t.page.video.playbackRate = 1;
    t.page.video.dispatch("loadedmetadata"); // next ad in the same break
    assertEquals(t.page.video.playbackRate, 16);
    t.cleanup();
});

Deno.test("hotkeys during an ad change the video's speed, not the ad's", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    await t.startAd();
    await t.fireCommand("increment-speed");
    assertEquals(t.page.video.playbackRate, 16);
    await t.endAd();
    assertEquals(t.page.video.playbackRate, 2.25);
    t.cleanup();
});

Deno.test("ads play normally when skipping ads is turned off", async () => {
    const t = await setup(SETTINGS(2, 0.25, { skip_ads: false }));
    await t.startAd();
    assertEquals(t.page.video.playbackRate, 2);
    assertEquals(t.page.video.muted, false);
    t.cleanup();
});

Deno.test("turning skipping off mid-ad restores speed and sound", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    await t.startAd();
    t.tabListeners.forEach((l) => l({ action: "refreshSettings", settings: SETTINGS(2, 0.25, { skip_ads: false }) }, {}, () => {}));
    assertEquals(t.page.video.playbackRate, 2);
    assertEquals(t.page.video.muted, false);
    t.cleanup();
});

Deno.test("skipping ads is on by default", async () => {
    const t = await setup(null);
    await t.startAd();
    assertEquals(t.page.video.playbackRate, 16);
    t.cleanup();
});

// Seen on YouTube: in a break with two ads, the player unmutes when the
// second ad loads
Deno.test("the next ad in a break stays muted after YouTube unmutes it", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    await t.startAd();
    t.page.video.muted = false;
    t.page.video.dispatch("volumechange");
    assertEquals(t.page.video.muted, true);
    await t.endAd();
    assertEquals(t.page.video.muted, false);
    t.cleanup();
});
