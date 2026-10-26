// Run with: deno test --allow-read tests/
// Loads worker.js and content.js against a fake chrome API and a fake
// YouTube DOM, wired together.
import { assert, assertEquals } from "jsr:@std/assert@1";

const root = new URL("../", import.meta.url);
const read = (p) => Deno.readTextFile(new URL(p, root));
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };

// Turn a manifest match pattern like "https://www.youtube.com/watch*" into a RegExp
function matchPatternToRegExp(pattern) {
    return new RegExp("^" + pattern.replace(/[.?+^$()[\]{}|\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
}

// A fake YouTube page. The player is optional, since youtube.com/ has none
// until a video is opened.
function fakeYouTubePage() {
    const observers = [];
    const page = { video: null, duration: null, injected: null, injectCount: 0 };

    function makeVideo() {
        const listeners = {};
        return {
            playbackRate: 1, duration: 600, currentTime: 0, isConnected: true,
            addEventListener: (type, f) => (listeners[type] ??= []).push(f),
            dispatch: (type) => (listeners[type] ?? []).forEach((f) => f()),
        };
    }

    const document = {
        body: {},
        documentElement: {},
        querySelector(selector) {
            if (/video/.test(selector)) return page.video;
            if (/ytp-time-duration/.test(selector)) return page.duration;
            return null;
        },
        getElementsByTagName: (tag) => (tag === "video" && page.video ? [page.video] : []),
        getElementsByClassName: (c) => (c === "ytp-time-duration" && page.duration ? [page.duration] : []),
        getElementById: (id) => (id === "new-time-ytpbs" ? page.injected : null),
    };

    class MutationObserver {
        constructor(callback) { this.callback = callback; }
        observe() { observers.push(this.callback); }
        disconnect() { observers.splice(observers.indexOf(this.callback), 1); }
    }

    // What YouTube does when a video is opened: build the player in place
    function openVideo() {
        page.video = makeVideo();
        page.duration = {
            insertAdjacentHTML: () => {
                page.injectCount++;
                page.injected = { innerHTML: "", isConnected: true };
            },
        };
        [...observers].forEach((f) => f([]));
    }

    return { page, document, MutationObserver, openVideo };
}

async function setup(storedSettings, { startOnWatchPage = true } = {}) {
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
    const yt = fakeYouTubePage();
    if (startOnWatchPage) yt.openVideo();
    const contentChrome = {
        runtime: {
            onMessage: { addListener: (f) => tabListeners.push(f) },
            sendMessage: (msg) => new Promise((resolve) =>
                workerMsgListeners.forEach((l) => l(msg, { tab }, (r) => resolve(structuredClone(r))))),
            getURL: (p) => p,
        },
    };
    const fetch = async () => ({ text: async () => "<span></span>" });
    const errors = [];
    const onError = (e) => { e.preventDefault(); errors.push(e.reason); };
    globalThis.addEventListener("unhandledrejection", onError);
    try {
        new Function("chrome", "document", "fetch", "MutationObserver", await read("scripts/content.js"))(
            contentChrome, yt.document, fetch, yt.MutationObserver);
    } catch (e) {
        errors.push(e);
    }
    await settle();

    const fireCommand = async (c) => { await Promise.all(commandListeners.map((f) => f(c))); await settle(); };
    const openVideo = async () => { yt.openVideo(); await settle(); };
    const cleanup = () => globalThis.removeEventListener("unhandledrejection", onError);
    return { page: yt.page, fireCommand, openVideo, errors, cleanup, tabListeners, commandListeners };
}

const SETTINGS = (speed, increment) =>
    ({ playback_speed: speed, increment, cutoff_in_seconds: 0, enabled_for_livestream: false });

Deno.test("increment hotkey raises speed by exactly one increment", async () => {
    const t = await setup(SETTINGS(1, 0.25));
    assertEquals(t.commandListeners.length, 1);
    assertEquals(t.tabListeners.length, 1);
    assertEquals(t.page.video.playbackRate, 1);
    await t.fireCommand("increment-speed");
    assertEquals(t.page.video.playbackRate, 1.25);
    await t.fireCommand("increment-speed");
    assertEquals(t.page.video.playbackRate, 1.5);
    t.cleanup();
});

Deno.test("decrement hotkey lowers speed by exactly one increment", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    await t.fireCommand("decrement-speed");
    assertEquals(t.page.video.playbackRate, 1.75);
    t.cleanup();
});

// YouTube can change the video's rate itself (its own speed menu or Shift+</>,
// or resetting the rate when it loads the next video without a page reload).
// The hotkey must step from the rate the video is actually playing at.
Deno.test("increment steps from the video's current rate after YouTube changes it", async () => {
    const t = await setup(SETTINGS(2, 1));
    assertEquals(t.page.video.playbackRate, 2);
    t.page.video.playbackRate = 1; // YouTube resets the rate
    await t.fireCommand("increment-speed");
    assertEquals(t.page.video.playbackRate, 2);
    t.cleanup();
});

Deno.test("decrement steps from the video's current rate after YouTube changes it", async () => {
    const t = await setup(SETTINGS(2, 0.5));
    t.page.video.playbackRate = 1.5;
    await t.fireCommand("decrement-speed");
    assertEquals(t.page.video.playbackRate, 1);
    t.cleanup();
});

// YouTube is a single page app: opening a video from the home page changes
// the URL with history.pushState, so Chrome never injects a content script
// that only matches /watch. It has to already be running on the home page.
Deno.test("content script is injected on the YouTube home page", async () => {
    const manifest = JSON.parse(await read("manifest.json"));
    const patterns = manifest.content_scripts.flatMap((cs) => cs.matches).map(matchPatternToRegExp);
    for (const url of ["https://www.youtube.com/", "https://www.youtube.com/watch?v=abc"]) {
        assert(patterns.some((p) => p.test(url)), `content script does not match ${url}`);
    }
});

Deno.test("loading on a page with no player does not throw", async () => {
    const t = await setup(SETTINGS(2, 0.25), { startOnWatchPage: false });
    assertEquals(t.errors, []);
    t.cleanup();
});

Deno.test("opening a video after loading on the home page applies speed and indicator", async () => {
    const t = await setup(SETTINGS(2, 0.25), { startOnWatchPage: false });
    await t.openVideo();
    assertEquals(t.page.video.playbackRate, 2);
    assertEquals(t.page.injectCount, 1);
    t.page.video.dispatch("timeupdate");
    assertEquals(t.page.injected.innerHTML, "(0:00/5:00) 2x");
    await t.fireCommand("increment-speed");
    assertEquals(t.page.video.playbackRate, 2.25);
    t.cleanup();
});

Deno.test("hotkeys before a video is opened do not throw", async () => {
    const t = await setup(SETTINGS(2, 0.25), { startOnWatchPage: false });
    await t.fireCommand("increment-speed");
    assertEquals(t.errors, []);
    t.cleanup();
});

Deno.test("settings broadcasts reach YouTube tabs that are not on /watch", async () => {
    const worker = await read("scripts/worker.js");
    const [, pattern] = worker.match(/tab\.url\.match\('([^']+)'\)/);
    assert(new RegExp(pattern).test("https://www.youtube.com/"), `worker skips tabs on youtube.com/`);
});
