// Run with: deno test --allow-read tests/
import { assertEquals } from "jsr:@std/assert@1";
import { read } from "./harness.js";

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
    };
    const errors = [];
    const onError = (e) => { e.preventDefault(); errors.push(e.reason.message); };
    globalThis.addEventListener("unhandledrejection", onError);

    const shared = await import(new URL("../scripts/sharedObjects.js", import.meta.url));
    const workerSrc = (await read("scripts/worker.js")).replace(/^import .*$/m, "");
    new Function("chrome", "KEYS", "DEFAULT_SETTINGS", "COMMANDS", "MESSAGES", workerSrc)(
        chrome, shared.KEYS, shared.DEFAULT_SETTINGS, shared.COMMANDS, shared.MESSAGES);

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
