// Run with: deno test --allow-read tests/
// Speeds picked in YouTube's own menu (or with Shift+< / Shift+>) are kept
// like a hotkey change. Recorded in Chrome: the user's change fires
// ratechange with the video loaded (readyState 4); YouTube swapping videos
// or ads fires ratechange right after emptying the video (readyState 0).
import { assertEquals } from "jsr:@std/assert@1";
import { setup, SETTINGS } from "./harness.js";

Deno.test("a speed picked in YouTube's menu is kept for the next video", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    await t.pickYouTubeSpeed(1.25);
    t.loadVideo("next", 600, { youtubeResetsSpeedTo: 1 });
    assertEquals(t.page.video.playbackRate, 1.25);
    t.cleanup();
});

Deno.test("YouTube resetting the speed while loading a video is ignored", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    t.loadVideo("next", 600, { youtubeResetsSpeedTo: 1 });
    assertEquals(t.page.video.playbackRate, 2);
    t.cleanup();
});

Deno.test("a speed picked in YouTube's menu applies to a short video", async () => {
    const t = await setup(SETTINGS(2, 0.25, { cutoff_in_seconds: 60 }), { duration: 30 });
    await t.pickYouTubeSpeed(1.5);
    t.page.video.dispatch("loadedmetadata");
    assertEquals(t.page.video.playbackRate, 1.5);
    t.cleanup();
});

Deno.test("speed changes during an ad are not adopted", async () => {
    const t = await setup(SETTINGS(2, 0.25, { skip_ads: false }));
    await t.startAd();
    await t.pickYouTubeSpeed(1); // YouTube plays ads at 1x
    await t.endAd();
    t.loadVideo("next", 600);
    assertEquals(t.page.video.playbackRate, 2);
    t.cleanup();
});

Deno.test("the popup shows a speed picked in YouTube's menu", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    await t.pickYouTubeSpeed(1.75);
    assertEquals(t.send({ action: "getTabState" }), { hasVideo: true, speed: 1.75 });
    t.cleanup();
});
