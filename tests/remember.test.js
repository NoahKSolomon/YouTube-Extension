// Run with: deno test --allow-read tests/
// "Remember speed changes": speeds picked for a video become the default
import { assertEquals } from "jsr:@std/assert@1";
import { setup, SETTINGS } from "./harness.js";

const REMEMBER = SETTINGS(2, 0.25, { save_speed_changes: true });

Deno.test("with remembering on, a hotkey change becomes the default", async () => {
    const t = await setup(REMEMBER);
    await t.fireCommand("increment-speed");
    assertEquals(t.saved()?.playback_speed, 2.25);
    t.cleanup();
});

Deno.test("with remembering on, a popup speed becomes the default", async () => {
    const t = await setup(REMEMBER);
    t.send({ action: "setTabSpeed", speed: 1.5 });
    await t.settle();
    assertEquals(t.saved()?.playback_speed, 1.5);
    t.cleanup();
});

Deno.test("with remembering on, a speed picked in YouTube's menu becomes the default", async () => {
    const t = await setup(REMEMBER);
    await t.pickYouTubeSpeed(1.75);
    assertEquals(t.saved()?.playback_speed, 1.75);
    t.cleanup();
});

Deno.test("remembering is off by default", async () => {
    const t = await setup(null);
    await t.fireCommand("increment-speed");
    assertEquals(t.saved(), undefined);
    t.cleanup();
});

Deno.test("with remembering off, speed changes stay in the tab", async () => {
    const t = await setup(SETTINGS(2, 0.25, { save_speed_changes: false }));
    await t.fireCommand("increment-speed");
    await t.pickYouTubeSpeed(1.5);
    assertEquals(t.saved(), undefined);
    t.cleanup();
});
