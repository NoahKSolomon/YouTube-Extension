// Run with: deno test --allow-read tests/
// Speed rules by channel or category. Recorded in Chrome: the category meta
// tag goes stale when YouTube opens a video in place, and the channel link
// under the video is still stale at loadedmetadata, but the player's
// getPlayerResponse() is current by then, for both players. scripts/page.js
// reads it from the page's world.
import { assertEquals, assertObjectMatch } from "jsr:@std/assert@1";
import { read, setup, SETTINGS } from "./harness.js";

const ALAN = { channelId: "UCalan", channelName: "Alan Walker", category: "Music", handle: "@Alanwalkermusic" };
const CHESS = { channelId: "UCchess", channelName: "Chess Guy", category: "Gaming" };
const withRules = (rules, extra = {}) => SETTINGS(2, 0.25, { speed_rules: rules, ...extra });
const MUSIC_1X = { type: "category", value: "Music", speed: 1 };
const ALAN_1_5X = { type: "channel", value: "UCalan", label: "Alan Walker", speed: 1.5 };

Deno.test("a category rule sets the speed for videos in that category", async () => {
    const t = await setup(withRules([MUSIC_1X]), { videoInfo: ALAN });
    assertEquals(t.page.video.playbackRate, 1);
    t.cleanup();
});

Deno.test("videos without a matching rule get the default speed", async () => {
    const t = await setup(withRules([MUSIC_1X]), { videoInfo: CHESS });
    assertEquals(t.page.video.playbackRate, 2);
    t.cleanup();
});

Deno.test("a channel rule beats a category rule", async () => {
    const t = await setup(withRules([MUSIC_1X, ALAN_1_5X]), { videoInfo: ALAN });
    assertEquals(t.page.video.playbackRate, 1.5);
    t.cleanup();
});

Deno.test("rules apply when YouTube opens the next video in place", async () => {
    const t = await setup(withRules([MUSIC_1X]), { videoInfo: CHESS });
    t.loadVideo("song", 200, { videoInfo: ALAN });
    assertEquals(t.page.video.playbackRate, 1);
    t.loadVideo("chess2", 600, { videoInfo: CHESS });
    assertEquals(t.page.video.playbackRate, 2);
    t.cleanup();
});

Deno.test("a rule beats the short-video cutoff", async () => {
    const t = await setup(withRules([ALAN_1_5X], { cutoff_in_seconds: 900 }), { videoInfo: ALAN });
    assertEquals(t.page.video.playbackRate, 1.5);
    t.cleanup();
});

Deno.test("player data for a different video is not used", async () => {
    const t = await setup(withRules([MUSIC_1X]), { videoInfo: { ...ALAN, videoId: "previous" } });
    assertEquals(t.page.video.playbackRate, 2);
    t.cleanup();
});

Deno.test("a hotkey on a rule's video sticks for that video only", async () => {
    const t = await setup(withRules([MUSIC_1X]), { videoInfo: ALAN });
    await t.fireCommand("increment-speed");
    assertEquals(t.page.video.playbackRate, 1.25);
    t.loadVideo("song2", 200, { videoInfo: ALAN });
    assertEquals(t.page.video.playbackRate, 1);
    t.loadVideo("chess2", 600, { videoInfo: CHESS });
    assertEquals(t.page.video.playbackRate, 1.25);
    t.cleanup();
});

Deno.test("rules apply to Shorts too", async () => {
    const t = await setup(withRules([MUSIC_1X], { enabled_for_shorts: true }), { startOnShort: true });
    t.swipeToShort("short2", 30, ALAN);
    assertEquals(t.page.shortsVideo.playbackRate, 1);
    t.cleanup();
});

Deno.test("the popup gets the video's channel, category and the rule in effect", async () => {
    const t = await setup(withRules([ALAN_1_5X]), { videoInfo: ALAN });
    assertObjectMatch(t.send({ action: "getTabState" }), {
        speed: 1.5, reason: "channel", reasonDetail: "Alan Walker",
        channel: { id: "UCalan", name: "Alan Walker" }, category: "Music",
    });
    t.cleanup();
});

Deno.test("a new rule applies to the open video right away", async () => {
    const t = await setup(SETTINGS(2, 0.25), { videoInfo: ALAN });
    t.tabListeners.forEach((l) => l({ action: "refreshSettings", settings: withRules([ALAN_1_5X]) }, {}, () => {}));
    assertEquals(t.page.video.playbackRate, 1.5);
    t.cleanup();
});

Deno.test("page.js answers with nothing when the player has no data", async () => {
    const events = new EventTarget();
    const document = {
        addEventListener: events.addEventListener.bind(events),
        dispatchEvent: events.dispatchEvent.bind(events),
        getElementById: () => null,
    };
    new Function("document", await read("scripts/page.js"))(document);
    let answer;
    events.addEventListener("ytpbs-video-info", (e) => { answer = e.detail; });
    events.dispatchEvent(new CustomEvent("ytpbs-get-video-info", { detail: "movie_player" }));
    assertEquals(answer, "null");
});

// Channel rules added on the settings page use the channel's @handle, which
// the player data has in ownerProfileUrl (recorded in Chrome for videos and
// Shorts). YouTube treats handles case-insensitively.
Deno.test("a channel rule by @handle matches, ignoring case", async () => {
    const rule = { type: "channel", value: "@alanwalkermusic", label: "@alanwalkermusic", speed: 1.25 };
    const t = await setup(withRules([MUSIC_1X, rule]), { videoInfo: ALAN });
    assertEquals(t.page.video.playbackRate, 1.25);
    t.cleanup();
});

Deno.test("page.js reports the channel's handle", async () => {
    const t = await setup(SETTINGS(2, 0.25), { videoInfo: ALAN });
    assertObjectMatch(t.send({ action: "getTabState" }), { channel: { id: "UCalan", name: "Alan Walker", handle: "@Alanwalkermusic" } });
    t.cleanup();
});
