// Run with: deno test --allow-read tests/
import { assertEquals } from "jsr:@std/assert@1";
import { loadWorker } from "./harness.js";

// After the extension reloads, tabs that were already open have no content
// script until refreshed, so messages to them reject with "Could not establish
// connection. Receiving end does not exist."
async function loadWorkerWithNoReceivers() {
    const commandListeners = [];
    const chrome = {
        storage: { sync: {
            get: async () => ({ settings: { playback_speed: 2 } }),
            set: async () => {},
        }},
        tabs: {
            query: (q, cb) => {
                const tabs = [{ id: 1, url: "https://www.youtube.com/watch?v=abc" }];
                return cb ? cb(tabs) : Promise.resolve(tabs);
            },
            sendMessage: () => Promise.reject(new Error("Could not establish connection. Receiving end does not exist.")),
        },
        commands: { onCommand: { addListener: (f) => commandListeners.push(f) } },
        runtime: { onMessage: { addListener() {} } },
        action: { setBadgeBackgroundColor: async () => {}, setBadgeTextColor: async () => {} },
    };
    const errors = [];
    const onError = (e) => { e.preventDefault(); errors.push(e.reason.message); };
    globalThis.addEventListener("unhandledrejection", onError);

    await loadWorker(chrome);

    const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
    await settle();
    return { errors, commandListeners, settle, cleanup: () => globalThis.removeEventListener("unhandledrejection", onError) };
}

Deno.test("startup broadcast to tabs without a content script does not throw", async () => {
    const w = await loadWorkerWithNoReceivers();
    assertEquals(w.errors, []);
    w.cleanup();
});

Deno.test("a hotkey on a tab without a content script does not throw", async () => {
    const w = await loadWorkerWithNoReceivers();
    await Promise.all(w.commandListeners.map((f) => f("increment-speed")));
    await w.settle();
    assertEquals(w.errors, []);
    w.cleanup();
});

// The popup and the settings page can both be open, so each sends only the
// setting that changed
Deno.test("saving one setting keeps the others", async () => {
    let stored = { playback_speed: 2, increment: 0.5, cutoff_in_seconds: 60, enabled_for_livestream: true, skip_ads: false, save_speed_changes: false, enabled_for_shorts: false };
    const messageListeners = [];
    const chrome = {
        storage: { sync: {
            get: async () => ({ settings: stored }),
            set: async (items) => { stored = structuredClone(items.settings); },
        }},
        tabs: { query: (q, cb) => cb([]), sendMessage: () => Promise.resolve() },
        commands: { onCommand: { addListener() {} } },
        runtime: { onMessage: { addListener: (f) => messageListeners.push(f) } },
        action: { setBadgeBackgroundColor: async () => {}, setBadgeTextColor: async () => {} },
    };
    await loadWorker(chrome);
    await new Promise((r) => setTimeout(r, 0));

    messageListeners.forEach((l) => l({ action: "updateSettings", settings: { playback_speed: 3 } }, {}, () => {}));
    await new Promise((r) => setTimeout(r, 0));
    assertEquals(stored, { playback_speed: 3, increment: 0.5, cutoff_in_seconds: 60, enabled_for_livestream: true, skip_ads: false, save_speed_changes: false, enabled_for_shorts: false });
});

// Chrome stops the worker when idle; on restart, reading storage takes a
// moment, and pages asking in the meantime must still get the saved settings
Deno.test("a page asking right after the worker wakes gets the saved settings", async () => {
    const stored = { playback_speed: 2.5, increment: 0.5, cutoff_in_seconds: 0, enabled_for_livestream: false, skip_ads: false, save_speed_changes: false, enabled_for_shorts: false };
    const messageListeners = [];
    const chrome = {
        storage: { sync: {
            get: () => new Promise((r) => setTimeout(() => r({ settings: stored }), 20)),
            set: async () => {},
        }},
        tabs: { query: (q, cb) => cb([]), sendMessage: () => Promise.resolve() },
        commands: { onCommand: { addListener() {} } },
        runtime: { onMessage: { addListener: (f) => messageListeners.push(f) } },
        action: { setBadgeBackgroundColor: async () => {}, setBadgeTextColor: async () => {} },
    };
    await loadWorker(chrome);

    const response = new Promise((resolve) =>
        messageListeners.forEach((l) => l({ action: "getSettings" }, {}, resolve)));
    assertEquals(await response, stored);
});
