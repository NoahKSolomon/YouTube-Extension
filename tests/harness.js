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
        shortsPlayer: null, shortsVideo: null,
        location: { pathname: "/watch", search: "?v=abc" },
        // What each player's getPlayerResponse() describes, by player id
        videoInfo: {},
        // The speed YouTube's own menu shows, by player id
        youtubeSpeed: {},
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

    // Events between the content script and page.js go through the document
    const events = new EventTarget();
    const document = {
        body: {},
        documentElement: {},
        addEventListener: events.addEventListener.bind(events),
        removeEventListener: events.removeEventListener.bind(events),
        dispatchEvent: events.dispatchEvent.bind(events),
        querySelector: (selector) => ({
            "#movie_player": page.player,
            "#shorts-player": page.shortsPlayer,
        })[selector] ?? null,
        getElementsByTagName: (tag) => (tag === "video" && page.video ? [page.video] : []),
        getElementsByClassName: (c) => (c === "ytp-time-duration" && page.duration ? [page.duration] : []),
        getElementById: (id) => ({
            "new-time-ytpbs": page.injected,
            "movie_player": page.player,
            "shorts-player": page.shortsPlayer,
        })[id] ?? null,
        createElement: (tagName) => ({ tagName: tagName.toUpperCase(), style: {}, textContent: "", isConnected: false }),
    };

    class MutationObserver {
        constructor(callback) { this.callback = callback; }
        observe() { observers.push(this.callback); }
        disconnect() { observers.splice(observers.indexOf(this.callback), 1); }
    }

    const notify = () => [...observers].forEach((f) => f([]));

    // A YouTube player element: ads add "ad-showing" to its classes
    function makePlayer(id, contents) {
        const classList = new Set();
        classList.contains = classList.has;
        return {
            id, classList, isConnected: true,
            querySelector: (selector) => contents()[selector] ?? null,
            // Like YouTube's: caps to 0.25-2x, sets the video and its menu
            setPlaybackRate: (rate) => {
                const capped = Math.min(2, Math.max(0.25, rate));
                page.youtubeSpeed[id] = capped;
                contents()["video"].playbackRate = capped;
            },
            // YouTube's player data, as read by page.js
            getPlayerResponse: () => {
                const info = page.videoInfo[id];
                return info && {
                    videoDetails: { videoId: info.videoId, channelId: info.channelId, author: info.channelName, isLive: info.isLive },
                    microformat: { playerMicroformatRenderer: {
                        category: info.category,
                        ownerProfileUrl: info.handle && `http://www.youtube.com/${info.handle}`,
                    } },
                };
            },
        };
    }

    // What YouTube does when a video is opened: build the player in place
    function openVideo() {
        page.player = makePlayer("movie_player", () => ({ "video": page.video, ".ytp-time-duration": page.duration }));
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

    // Shorts have their own player, which plays every Short in one <video>
    function openShort(id) {
        page.location.pathname = `/shorts/${id}`;
        page.location.search = "";
        page.shortsVideo ??= makeVideo();
        page.shortsVideo.duration = 45;
        page.shortsPlayer ??= makePlayer("shorts-player", () => ({ "video": page.shortsVideo }));
        notify();
    }

    // Back to a regular video, without a page load
    function goToWatchPage(id) {
        page.location.pathname = "/watch";
        page.location.search = `?v=${id}`;
        notify();
    }

    return { page, document, MutationObserver, openVideo, startAd, endAd, openShort, goToWatchPage, notify };
}

export async function setup(storedSettings, { startOnWatchPage = true, startOnShort = false, startInAd = false, duration, videoInfo } = {}) {
    const tabListeners = [];
    const workerMsgListeners = [];
    const commandListeners = [];
    const tab = { id: 1, url: "https://www.youtube.com/watch?v=abc" };
    const badges = {};
    let savedSettings;

    const chrome = {
        storage: { sync: {
            get: async () => (storedSettings ? { settings: storedSettings } : {}),
            set: async (items) => { savedSettings = structuredClone(items.settings); },
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
        action: {
            setBadgeText: ({ tabId, text }) => { badges[tabId] = text; return Promise.resolve(); },
            setBadgeBackgroundColor: () => Promise.resolve(),
            setBadgeTextColor: () => Promise.resolve(),
        },
    };

    await loadWorker(chrome);

    // Content script gets its own chrome object, as in the browser.
    const yt = fakeYouTubePage();
    if (startOnShort) yt.openShort("short1");
    else if (startOnWatchPage) yt.openVideo();
    if (duration !== undefined) yt.page.video.duration = duration;
    if (startInAd) yt.startAd();
    if (videoInfo) yt.page.videoInfo.movie_player = { videoId: "abc", ...videoInfo };
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
        // page.js runs in the page's own world, without the shared constants
        new Function("document", await read("scripts/page.js"))(yt.document);
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
    const loadVideo = (id, duration, { youtubeResetsSpeedTo, videoInfo } = {}) => {
        const video = yt.page.video;
        yt.page.location.search = `?v=${id}`;
        yt.page.videoInfo.movie_player = videoInfo && { videoId: id, ...videoInfo };
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
    const openShort = async (id) => { yt.openShort(id); await settle(); };
    const goToWatchPage = async (id) => { yt.goToWatchPage(id); await settle(); };
    // Swiping to the next Short: same <video>, new id and duration
    const swipeToShort = (id, duration, videoInfo) => {
        const video = yt.page.shortsVideo;
        yt.page.location.pathname = `/shorts/${id}`;
        yt.page.videoInfo["shorts-player"] = videoInfo && { videoId: id, ...videoInfo };
        video.readyState = 0;
        video.dispatch("ratechange");
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
        page: yt.page, badge: () => badges[tab.id], saved: () => savedSettings, settle, fireCommand, openVideo, startAd, endAd,
        errors, fetches, cleanup, send, loadVideo, pickYouTubeSpeed, openShort, goToWatchPage, swipeToShort,
        tabListeners, commandListeners,
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
    const api = new Function("chrome", "document", "setTimeout", "clearTimeout",
        `${await withShared("ui/settings.js")}
return { onSettingsRendered };`)(
        chrome, document, setTimeout, clearTimeout);
    await settle();
    return {
        elements, document, sent, onSettingsRendered: api.onSettingsRendered,
        // Another page (or the worker) saving settings
        storageChanged: (settings) => storageListeners.forEach((f) =>
            f({ settings: { newValue: structuredClone(settings) } }, "sync")),
    };
}

export const SETTINGS = (speed, increment, extra = {}) =>
    ({ playback_speed: speed, increment, cutoff_in_seconds: 0, enabled_for_livestream: false, skip_ads: true, enabled_for_shorts: false, ...extra });
