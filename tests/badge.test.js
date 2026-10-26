// Run with: deno test --allow-read tests/
// The toolbar icon shows the current tab's video speed
import { assertEquals } from "jsr:@std/assert@1";
import { setup, SETTINGS } from "./harness.js";

Deno.test("the badge shows the tab's speed", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    assertEquals(t.badge(), "2x");
    t.cleanup();
});

Deno.test("the badge follows hotkey changes, dropping the x when it won't fit", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    await t.fireCommand("increment-speed");
    assertEquals(t.badge(), "2.25");
    await t.fireCommand("decrement-speed");
    assertEquals(t.badge(), "2x");
    t.cleanup();
});

Deno.test("the badge shows the video's speed during an ad, not 16x", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    await t.startAd();
    assertEquals(t.badge(), "2x");
    t.cleanup();
});

Deno.test("the badge shows 1x for a video kept at normal speed", async () => {
    const t = await setup(SETTINGS(2, 0.25, { cutoff_in_seconds: 60 }), { duration: 30 });
    assertEquals(t.badge(), "1x");
    t.cleanup();
});

Deno.test("the badge follows a speed picked in YouTube's menu", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    await t.pickYouTubeSpeed(1.5);
    assertEquals(t.badge(), "1.5x");
    t.cleanup();
});

Deno.test("the badge is empty on a page with no video", async () => {
    const t = await setup(SETTINGS(2, 0.25), { startOnWatchPage: false });
    assertEquals(t.badge(), undefined);
    t.cleanup();
});
