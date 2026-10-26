// Run with: deno test --allow-read tests/
// The popup reads and sets the current tab's speed through the content script
import { assertEquals } from "jsr:@std/assert@1";
import { setup, SETTINGS } from "./harness.js";

Deno.test("the popup can read this tab's speed", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    assertEquals(t.send({ action: "getTabState" }), { hasVideo: true, speed: 2 });
    t.cleanup();
});

Deno.test("during an ad the popup sees the video's speed, not the ad's", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    await t.startAd();
    assertEquals(t.send({ action: "getTabState" }), { hasVideo: true, speed: 2 });
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
