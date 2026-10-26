// Run with: deno test --allow-read tests/
// YouTube's menu shows the extension's speed. Recorded in Chrome: the
// player's setPlaybackRate() updates the menu, accepts any speed from 0.25x
// to 2x (1.1, 1.35 and 1.85 worked), and caps anything else to that range.
// page.js calls it, since only the page's world can.
import { assertEquals } from "jsr:@std/assert@1";
import { setup, SETTINGS } from "./harness.js";

Deno.test("YouTube's menu shows the default speed", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    assertEquals(t.page.video.playbackRate, 2);
    assertEquals(t.page.youtubeSpeed.movie_player, 2);
    t.cleanup();
});

Deno.test("YouTube's menu follows hotkey changes", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    await t.fireCommand("decrement-speed");
    assertEquals(t.page.youtubeSpeed.movie_player, 1.75);
    t.cleanup();
});

Deno.test("speeds above 2x still apply, without capping them through YouTube", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    await t.fireCommand("increment-speed");
    assertEquals(t.page.video.playbackRate, 2.25);
    assertEquals(t.page.youtubeSpeed.movie_player, 2);
    t.cleanup();
});

Deno.test("ads play at 16x, and YouTube's menu returns to the video's speed after", async () => {
    const t = await setup(SETTINGS(1.5, 0.25));
    await t.startAd();
    assertEquals(t.page.video.playbackRate, 16);
    assertEquals(t.page.youtubeSpeed.movie_player, 1.5);
    await t.endAd();
    assertEquals(t.page.video.playbackRate, 1.5);
    assertEquals(t.page.youtubeSpeed.movie_player, 1.5);
    t.cleanup();
});

Deno.test("the speed set through YouTube is not mistaken for the user's choice", async () => {
    const t = await setup(SETTINGS(2, 0.25, { cutoff_in_seconds: 60 }), { duration: 600 });
    await t.settle();
    t.loadVideo("short", 30);
    await t.settle();
    assertEquals(t.page.video.playbackRate, 1);
    t.loadVideo("long", 600);
    await t.settle();
    assertEquals(t.page.video.playbackRate, 2);
    t.cleanup();
});

Deno.test("YouTube's Shorts menu shows the speed too", async () => {
    const t = await setup(SETTINGS(1.5, 0.25, { enabled_for_shorts: true }), { startOnShort: true });
    assertEquals(t.page.youtubeSpeed["shorts-player"], 1.5);
    t.cleanup();
});

Deno.test("the speed still applies if YouTube's player can't be reached", async () => {
    const t = await setup(SETTINGS(2, 0.25), { startOnWatchPage: false });
    await t.openVideo();
    delete t.page.player.setPlaybackRate;
    await t.fireCommand("decrement-speed");
    assertEquals(t.page.video.playbackRate, 1.75);
    t.cleanup();
});
