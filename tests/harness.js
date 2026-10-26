// Shared test setup: loads worker.js and content.js against a fake chrome API
// and a fake YouTube DOM, wired together.

const root = new URL("../", import.meta.url);
export const read = (p) => Deno.readTextFile(new URL(p, root));

// Each context runs scripts/sharedObjects.js before its own code, sharing
// its top-level constants
const withShared = async (path) => `${await read("scripts/sharedObjects.js")}
${await read(path)}`;

// Runs worker.js against a fake chrome API, as Chrome would after importScripts
export async function loadWorker(chrome) {
    new Function("chrome", "importScripts", await withShared("scripts/worker.js"))(chrome, () => {});
}
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
        const video = {
            // Like Chrome: 0 is allowed (it stalls the video), other rates
            // outside 0.0625-16 throw, and a change fires ratechange later
            get playbackRate() { return playbackRate; },
            set playbackRate(rate) {
                if (rate !== 0 && (rate < 0.0625 || rate > 16)) {
                    throw new DOMException(`The provided playback rate (${rate}) is not in the supported playback range.`, "NotSupportedError");
                }
                if (rate !== playbackRate) {
                    playbackRate = rate;
                    queueMicrotask(() => video.dispatch("ratechange"));
                }
            },
            duration: 600, currentTime: 0, muted: false, isConnected: true, readyState: 4,
            addEventListener: (type, f) => (listeners[type] ??= []).push(f),
            dispatch: (type) => (listeners[type] ?? []).forEach((f) => f()),
        };
        return video;
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
        createElement: (tagName) => ({ tagName: tagName.toUpperCase(), style: {}, textContent: "", isConnected: false }),
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

    await loadWorker(chrome);

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
        new Function("chrome", "document", "fetch", "MutationObserver", "location", await withShared("scripts/content.js"))(
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
    // What YouTube does when it opens another video without a page load: it
    // empties the video (readyState 0, firing ratechange, and sometimes
    // resetting the speed to its own), then loads the new one
    const loadVideo = (id, duration, { youtubeResetsSpeedTo } = {}) => {
        const video = yt.page.video;
        yt.page.location.search = `?v=${id}`;
        video.readyState = 0;
        video.dispatch("ratechange");
        if (youtubeResetsSpeedTo !== undefined) {
            video.playbackRate = youtubeResetsSpeedTo;
            video.dispatch("ratechange");
        }
        video.duration = duration;
        video.readyState = 1;
        video.dispatch("loadedmetadata");
        video.readyState = 4;
    };
    // The user picking a speed in YouTube's menu (or Shift+< / Shift+>)
    const pickYouTubeSpeed = async (rate) => {
        yt.page.video.playbackRate = rate;
        await settle();
    };
    return {
        page: yt.page, fireCommand, openVideo, startAd, endAd,
        errors, fetches, cleanup, send, loadVideo, pickYouTubeSpeed, tabListeners, commandListeners,
    };
}

// Loads ui/settings.js (used by the popup and the settings page) against a
// fake page holding the given setting inputs
export async function setupSettingsUI(storedSettings, inputs) {
    const sent = [];
    const storageListeners = [];
    const elements = {};
    const makeElement = (props) => {
        const listeners = {};
        const element = {
            value: "", checked: false, textContent: "", attributes: {}, dataset: {},
            classList: { add() {}, remove() {} },
            setAttribute: (name, value) => { element.attributes[name] = value; },
            addEventListener: (type, f) => (listeners[type] ??= []).push(f),
            dispatch: (type) => (listeners[type] ?? []).forEach((f) => f()),
            ...props,
        };
        elements[element.id] = element;
        return element;
    };
    const settingInputs = inputs.map(({ id, setting, kind, type = kind ? "text" : "checkbox" }) => {
        makeElement({ id: `${id}-error` });
        return makeElement({ id, type, dataset: { setting, ...(kind && { kind }) } });
    });
    makeElement({ id: "toast" });
    const document = {
        activeElement: null,
        querySelectorAll: (selector) => (selector === "[data-setting]" ? settingInputs : []),
        getElementById: (id) => elements[id] ?? null,
    };
    const chrome = {
        runtime: {
            sendMessage: async (message) => {
                sent.push(message);
                return message.action === "getSettings" ? structuredClone(storedSettings) : undefined;
            },
        },
        storage: { onChanged: { addListener: (f) => storageListeners.push(f) } },
    };
    // The "Saved" toast's timer never fires in tests
    const setTimeout = () => 0;
    const clearTimeout = () => {};
    new Function("chrome", "document", "setTimeout", "clearTimeout", await withShared("ui/settings.js"))(
        chrome, document, setTimeout, clearTimeout);
    await settle();
    return {
        elements, document, sent,
        // Another page (or the worker) saving settings
        storageChanged: (settings) => storageListeners.forEach((f) =>
            f({ settings: { newValue: structuredClone(settings) } }, "sync")),
    };
}

export const SETTINGS = (speed, increment, extra = {}) =>
    ({ playback_speed: speed, increment, cutoff_in_seconds: 0, enabled_for_livestream: false, skip_ads: true, ...extra });
