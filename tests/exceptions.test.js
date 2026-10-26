// Run with: deno test --allow-read tests/
import { assertEquals } from "jsr:@std/assert@1";
import { setup, SETTINGS } from "./harness.js";

const CUTOFF_60 = SETTINGS(2, 0.25, { cutoff_in_seconds: 60 });

Deno.test("videos at or under the cutoff stay at 1x", async () => {
    const t = await setup(CUTOFF_60, { duration: 60 });
    assertEquals(t.page.video.playbackRate, 1);
    t.cleanup();
});

Deno.test("videos over the cutoff get the default speed", async () => {
    const t = await setup(CUTOFF_60, { duration: 61 });
    assertEquals(t.page.video.playbackRate, 2);
    t.cleanup();
});

Deno.test("a cutoff of 0 applies the default speed to every video", async () => {
    const t = await setup(SETTINGS(2, 0.25, { cutoff_in_seconds: 0 }), { duration: 5 });
    assertEquals(t.page.video.playbackRate, 2);
    t.cleanup();
});

Deno.test("the cutoff applies when YouTube opens a short video in place", async () => {
    const t = await setup(CUTOFF_60, { duration: 600 });
    assertEquals(t.page.video.playbackRate, 2);
    t.loadVideo("short", 30);
    assertEquals(t.page.video.playbackRate, 1);
    t.loadVideo("long", 600);
    assertEquals(t.page.video.playbackRate, 2);
    t.cleanup();
});

Deno.test("livestreams stay at 1x unless enabled", async () => {
    const t = await setup(SETTINGS(2, 0.25, { enabled_for_livestream: false }), { duration: Infinity });
    assertEquals(t.page.video.playbackRate, 1);
    t.cleanup();
});

Deno.test("livestreams get the default speed when enabled", async () => {
    const t = await setup(SETTINGS(2, 0.25, { enabled_for_livestream: true }), { duration: Infinity });
    assertEquals(t.page.video.playbackRate, 2);
    t.cleanup();
});

Deno.test("hotkeys still change the speed of a short video", async () => {
    const t = await setup(CUTOFF_60, { duration: 30 });
    await t.fireCommand("increment-speed");
    assertEquals(t.page.video.playbackRate, 1.25);
    t.page.video.dispatch("loadedmetadata"); // same video reloading its data
    assertEquals(t.page.video.playbackRate, 1.25);
    t.cleanup();
});

Deno.test("a speed change on one short video does not carry over to the next short video", async () => {
    const t = await setup(CUTOFF_60, { duration: 30 });
    await t.fireCommand("increment-speed");
    t.loadVideo("another-short", 20);
    assertEquals(t.page.video.playbackRate, 1);
    t.cleanup();
});

Deno.test("a short video goes back to 1x after an ad", async () => {
    const t = await setup(CUTOFF_60, { duration: 30 });
    await t.startAd();
    assertEquals(t.page.video.playbackRate, 16);
    await t.endAd();
    assertEquals(t.page.video.playbackRate, 1);
    t.cleanup();
});

// Recorded in Chrome: a stream that is live now reports a finite duration
// (its rewind window, e.g. 50390s); YouTube's player data has isLive: true
Deno.test("a live stream with a finite duration stays at 1x", async () => {
    const t = await setup(SETTINGS(2, 0.25), {
        duration: 50390,
        videoInfo: { channelId: "UCnews", channelName: "News", category: "News & Politics", isLive: true },
    });
    assertEquals(t.page.video.playbackRate, 1);
    assertEquals(t.send({ action: "getTabState" }).reason, "livestream");
    t.cleanup();
});

Deno.test("a finished stream plays at the default speed", async () => {
    const t = await setup(SETTINGS(2, 0.25), {
        duration: 7200,
        videoInfo: { channelId: "UCnews", channelName: "News", category: "News & Politics", isLive: false },
    });
    assertEquals(t.page.video.playbackRate, 2);
    t.cleanup();
});
