// Shared test setup: loads worker.js and content.js against a fake chrome API
// and a fake YouTube DOM, wired together.

const root = new URL("../", import.meta.url);
export const read = (p) => Deno.readTextFile(new URL(p, root));
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };

// Turn a manifest match pattern like "https://www.youtube.com/watch*" into a RegExp
export function matchPatternToRegExp(pattern) {
    return new RegExp("^" + pattern.replace(/[.?+^$()[\]{}|\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
}

// A fake YouTube page. The player is optional, since youtube.com/ has none
// until a video is opened.
function fakeYouTubePage() {
    const observers = [];
    const page = {
        player: null, video: null, duration: null, injected: null, injectCount: 0,
        location: { search: "?v=abc" },
    };

    function makeVideo() {
        const listeners = {};
        let playbackRate = 1;
        return {
            // Like Chrome: 0 is allowed (it stalls the video), other rates
            // outside 0.0625-16 throw
            get playbackRate() { return playbackRate; },
            set playbackRate(rate) {
                if (rate !== 0 && (rate < 0.0625 || rate > 16)) {
                    throw new DOMException(`The provided playback rate (${rate}) is not in the supported playback range.`, "NotSupportedError");
                }
                playbackRate = rate;
            },
            duration: 600, currentTime: 0, muted: false, isConnected: true,
            addEventListener: (type, f) => (listeners[type] ??= []).push(f),
            dispatch: (type) => (listeners[type] ?? []).forEach((f) => f()),
        };
    }

    const document = {
        body: {},
        documentElement: {},
        querySelector: (selector) => ({
            "#movie_player": page.player,
            "#movie_player video": page.video,
            "#movie_player .ytp-time-duration": page.duration,
        })[selector] ?? null,
        getElementsByTagName: (tag) => (tag === "video" && page.video ? [page.video] : []),
        getElementsByClassName: (c) => (c === "ytp-time-duration" && page.duration ? [page.duration] : []),
        getElementById: (id) => (id === "new-time-ytpbs" ? page.injected : null),
        createElement: (tagName) => ({ tagName: tagName.toUpperCase(), style: {}, innerHTML: "", isConnected: false }),
    };

    class MutationObserver {
        constructor(callback) { this.callback = callback; }
        observe() { observers.push(this.callback); }
        disconnect() { observers.splice(observers.indexOf(this.callback), 1); }
    }

    const notify = () => [...observers].forEach((f) => f([]));

    // What YouTube does when a video is opened: build the player in place
    function openVideo() {
        page.player = { classList: new Set(), isConnected: true };
        page.player.classList.contains = page.player.classList.has;
        page.video = makeVideo();
        page.duration = {
            insertAdjacentElement: (position, element) => {
                page.injectCount++;
                page.injected = Object.assign(element, { isConnected: true, position });
            },
        };
        notify();
    }

    // Ads play in the same <video>, with "ad-showing" on #movie_player
    function startAd() {
        page.player.classList.add("ad-showing");
        notify();
    }
    function endAd() {
        page.player.classList.delete("ad-showing");
        notify();
    }

    return { page, document, MutationObserver, openVideo, startAd, endAd };
}

export async function setup(storedSettings, { startOnWatchPage = true, startInAd = false, duration } = {}) {
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
            sendMessage: (id, msg) => {
                tabListeners.forEach((l) => l(structuredClone(msg), {}, () => {}));
                return Promise.resolve();
            },
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
    if (duration !== undefined) yt.page.video.duration = duration;
    if (startInAd) yt.startAd();
    const contentChrome = {
        runtime: {
            onMessage: { addListener: (f) => tabListeners.push(f) },
            sendMessage: (msg) => new Promise((resolve) =>
                workerMsgListeners.forEach((l) => l(msg, { tab }, (r) => resolve(structuredClone(r))))),
            getURL: (p) => p,
        },
    };
    const fetches = [];
    const fetch = async (url) => {
        fetches.push(url);
        return { text: async () => "" };
    };
    const errors = [];
    const onError = (e) => { e.preventDefault(); errors.push(e.reason); };
    globalThis.addEventListener("unhandledrejection", onError);
    try {
        new Function("chrome", "document", "fetch", "MutationObserver", "location", await read("scripts/content.js"))(
            contentChrome, yt.document, fetch, yt.MutationObserver, yt.page.location);
    } catch (e) {
        errors.push(e);
    }
    await settle();

    const fireCommand = async (c) => { await Promise.all(commandListeners.map((f) => f(c))); await settle(); };
    const openVideo = async () => { yt.openVideo(); await settle(); };
    const startAd = async () => { yt.startAd(); await settle(); };
    const endAd = async () => { yt.endAd(); await settle(); };
    const cleanup = () => globalThis.removeEventListener("unhandledrejection", onError);
    // Send a message to the content script the way the popup does, returning its response
    const send = (message) => {
        let response;
        tabListeners.forEach((l) => l(message, {}, (r) => { response = r; }));
        return response;
    };
    // What YouTube does when it opens another video without a page load
    const loadVideo = (id, duration) => {
        yt.page.location.search = `?v=${id}`;
        yt.page.video.duration = duration;
        yt.page.video.dispatch("loadedmetadata");
    };
    return {
        page: yt.page, fireCommand, openVideo, startAd, endAd,
        errors, fetches, cleanup, send, loadVideo, tabListeners, commandListeners,
    };
}

export const SETTINGS = (speed, increment, extra = {}) =>
    ({ playback_speed: speed, increment, cutoff_in_seconds: 0, enabled_for_livestream: false, skip_ads: true, ...extra });
