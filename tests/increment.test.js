// Run with: deno test --allow-read tests/
// Loads worker.js and content.js against a fake chrome API wired together,
// then fires the increment-speed command.
import { assertEquals } from "jsr:@std/assert@1";

const root = new URL("../", import.meta.url);
const read = (p) => Deno.readTextFile(new URL(p, root));
const tick = () => new Promise((r) => setTimeout(r, 0));

async function setup(storedSettings) {
    const tabListeners = [];
    const workerMsgListeners = [];
    const commandListeners = [];
    const tab = { id: 1, url: "https://www.youtube.com/watch?v=abc" };

    const chrome = {
        storage: { sync: {
            get: async () => (storedSettings ? { settings: storedSettings } : {}),
            set: async () => {},
        }},
        tabs: {
            query: (q, cb) => { const r = [tab]; return cb ? cb(r) : Promise.resolve(r); },
            sendMessage: (id, msg) => tabListeners.forEach((l) => l(structuredClone(msg), {}, () => {})),
        },
        commands: { onCommand: { addListener: (f) => commandListeners.push(f) } },
        runtime: {
            onMessage: { addListener: (f) => workerMsgListeners.push(f) },
            getURL: (p) => p,
        },
    };

    // Worker: rewrite the ES import to read from a global so it can run in a Function.
    const shared = await import(new URL("scripts/sharedObjects.js", root));
    const workerSrc = (await read("scripts/worker.js")).replace(/^import .*$/m, "");
    new Function("chrome", "KEYS", "DEFAULT_SETTINGS", "COMMANDS", "MESSAGES", workerSrc)(
        chrome, shared.KEYS, shared.DEFAULT_SETTINGS, shared.COMMANDS, shared.MESSAGES);

    // Content script gets its own chrome object, as in the browser.
    const video = { playbackRate: 1, duration: 600, currentTime: 0, addEventListener() {} };
    const contentChrome = {
        runtime: {
            onMessage: { addListener: (f) => tabListeners.push(f) },
            sendMessage: (msg) => new Promise((resolve) =>
                workerMsgListeners.forEach((l) => l(msg, { tab }, (r) => resolve(structuredClone(r))))),
            getURL: (p) => p,
        },
    };
    const document = {
        getElementsByTagName: () => [video],
        getElementsByClassName: () => [{ insertAdjacentHTML() {} }],
        getElementById: () => ({ innerHTML: "" }),
    };
    const fetch = async () => ({ text: async () => "<span></span>" });
    new Function("chrome", "document", "fetch", await read("scripts/content.js"))(
        contentChrome, document, fetch);

    for (let i = 0; i < 5; i++) await tick();
    const fireCommand = async (c) => { await Promise.all(commandListeners.map((f) => f(c))); await tick(); };
    return { video, fireCommand, tabListeners, commandListeners };
}

Deno.test("increment hotkey raises speed by exactly one increment", async () => {
    const { video, fireCommand, tabListeners, commandListeners } = await setup({
        playback_speed: 1, increment: 0.25, cutoff_in_seconds: 0, enabled_for_livestream: false,
    });
    assertEquals(commandListeners.length, 1);
    assertEquals(tabListeners.length, 1);
    assertEquals(video.playbackRate, 1);
    await fireCommand("increment-speed");
    assertEquals(video.playbackRate, 1.25);
    await fireCommand("increment-speed");
    assertEquals(video.playbackRate, 1.5);
});

Deno.test("decrement hotkey lowers speed by exactly one increment", async () => {
    const { video, fireCommand } = await setup({
        playback_speed: 2, increment: 0.25, cutoff_in_seconds: 0, enabled_for_livestream: false,
    });
    await fireCommand("decrement-speed");
    assertEquals(video.playbackRate, 1.75);
});

// YouTube can change the video's rate itself (its own speed menu or Shift+</>,
// or resetting the rate when it loads the next video without a page reload).
// The hotkey must step from the rate the video is actually playing at.
Deno.test("increment steps from the video's current rate after YouTube changes it", async () => {
    const { video, fireCommand } = await setup({
        playback_speed: 2, increment: 1, cutoff_in_seconds: 0, enabled_for_livestream: false,
    });
    assertEquals(video.playbackRate, 2);
    video.playbackRate = 1; // YouTube resets the rate
    await fireCommand("increment-speed");
    assertEquals(video.playbackRate, 2);
});

Deno.test("decrement steps from the video's current rate after YouTube changes it", async () => {
    const { video, fireCommand } = await setup({
        playback_speed: 2, increment: 0.5, cutoff_in_seconds: 0, enabled_for_livestream: false,
    });
    video.playbackRate = 1.5;
    await fireCommand("decrement-speed");
    assertEquals(video.playbackRate, 1);
});
