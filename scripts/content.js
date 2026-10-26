// This sript is to collect the custom default settings from the background,
// inject the custom HTML elements, and set the playback speed of the youtube
// video if applicable

// Set once the watch page player exists, which may be after this script loads
let player = null;
let video = null;

const AD_SPEED = MAX_SPEED;
// Whether an ad is currently being sped through, and whether the extension
// muted it (so a video the user muted stays muted afterwards)
let skippingAd = false;
let mutedForAd = false;
// The speed set with a hotkey, the popup or YouTube's menu for this tab, kept
// apart from the saved default so settings changes don't reset it. null
// follows the default.
let tabSpeed = null;
// The video the user last changed the speed of, which then gets that speed
// even if it is short or a livestream
let speedChangedOnVideoId = null;
// The last speed this script set, to tell its own ratechange events apart
// from YouTube's
let appliedSpeed = null;
// The last speed sent to the worker for the toolbar badge
let reportedSpeed = null;

const SETTINGS = {};
const INJECTED_ELEMENTS = {};


// FUNCTIONS

function padZero(number) {
    return number < 10 ? `0${number}` : `${number}`;
}

// Get the hh:mm:ss formatted time which respects the default playback rate in
// settings. the hh portion will be omitted if the adjusted time is not
function getFormattedTrueTime(timeToConvertInSeconds, playbackRate) {
    const timeToUse = isNaN(timeToConvertInSeconds) ? 0 : timeToConvertInSeconds;
    const rateToUse = isNaN(playbackRate) || playbackRate === 0 ? 1 : playbackRate;
    const trueTimeInSeconds = timeToUse / rateToUse;
    const hours = Math.floor(trueTimeInSeconds / 3600);
    const minutes = Math.floor((trueTimeInSeconds % 3600) / 60);
    const remainingSeconds = Math.floor(trueTimeInSeconds % 60);
    let formattedTime = "";
    if (hours > 0) {
        formattedTime += `${hours}:${padZero(minutes)}`;
    } else {
        formattedTime += `${minutes}`;
    }
    formattedTime += `:${padZero(remainingSeconds)}`;
    return formattedTime;
}

// Ads play in the same <video> as the video, and YouTube marks the player
// with "ad-showing" while one is on
function isSkippingAd() {
    return Boolean(SETTINGS[KEYS.SKIP_ADS] && player?.classList.contains("ad-showing"));
}

// Keep a hotkey or popup speed in range, rounded so repeated 0.1 steps give
// 1.3 rather than 1.3000000000000003
function normalizeSpeed(speed) {
    const rounded = Math.round(speed * 10000) / 10000;
    return Math.min(MAX_SPEED, Math.max(MIN_SPEED, rounded));
}

function currentVideoId() {
    return new URLSearchParams(location.search).get("v");
}

// Why this video stays at 1x: "short" (at or under the cutoff) or
// "livestream" (unless enabled), or null. Livestreams have an infinite
// duration. A video whose speed the user changed has no reason.
function exclusionReason() {
    if (speedChangedOnVideoId === currentVideoId()) {
        return null;
    }
    if (video.duration === Infinity) {
        return SETTINGS[KEYS.LIVESTREAM] ? null : "livestream";
    }
    const cutoff = SETTINGS[KEYS.CUTOFF];
    return cutoff > 0 && video.duration <= cutoff ? "short" : null;
}

// The video's own speed, ignoring any ad playing over it
function videoSpeed() {
    if (exclusionReason()) {
        return 1;
    }
    return tabSpeed ?? SETTINGS[KEYS.DEFAULT_SPEED];
}

function targetSpeed() {
    return isSkippingAd() ? AD_SPEED : videoSpeed();
}

// The worker shows it on the toolbar icon. Sending throws once the extension
// has been reloaded and this copy of the script is cut off.
function reportSpeed() {
    const speed = videoSpeed();
    if (speed === reportedSpeed) {
        return;
    }
    reportedSpeed = speed;
    try {
        chrome.runtime.sendMessage({action: MESSAGES.SPEED_CHANGED, speed}).catch(() => {});
    } catch {
        // Cut off from the extension; nothing to update
    }
}

function setVideoSpeed(speed) {
    appliedSpeed = speed;
    video.playbackRate = speed;
}

// The user changed this video's speed with a hotkey, the popup or YouTube's
// menu. It stays for this tab (even on a short video or livestream), and
// becomes the saved default if "Remember speed changes" is on.
function userChangedSpeed(speed) {
    tabSpeed = normalizeSpeed(speed);
    speedChangedOnVideoId = currentVideoId();
    if (SETTINGS[KEYS.SAVE_SPEED_CHANGES]) {
        SETTINGS[KEYS.DEFAULT_SPEED] = tabSpeed;
        try {
            chrome.runtime.sendMessage({action: MESSAGES.UPDATE_SETTINGS, settings: {[KEYS.DEFAULT_SPEED]: tabSpeed}});
        } catch {
            // Cut off from the extension after a reload; nothing to save to
        }
    }
}

// The user picked a speed in YouTube's menu (or with Shift+< / Shift+>), so
// keep it like a hotkey change. YouTube also fires ratechange while swapping
// in the next video or ad, before it has loaded (readyState 0), and those
// aren't the user's choice.
function adoptYouTubeSpeed() {
    if (video.readyState === 0 || video.playbackRate === appliedSpeed
            || player.classList.contains("ad-showing")) {
        return;
    }
    appliedSpeed = video.playbackRate;
    userChangedSpeed(video.playbackRate);
    refreshSettingsHTML();
    reportSpeed();
}

// Update the actual page elements with the settings
function updatePageSettings() {
    if (video) {
        setVideoSpeed(targetSpeed());
        reportSpeed();
    }
}

// Speed through and mute ads, and restore the video's speed and sound once
// the ad is over
function handleAds() {
    if (!video) {
        return;
    }
    const adShowing = isSkippingAd();
    if (adShowing) {
        if (!skippingAd) {
            mutedForAd = !video.muted;
        }
        // YouTube unmutes when the next ad in a break loads
        if (!video.muted) {
            video.muted = true;
        }
        if (video.playbackRate !== AD_SPEED) {
            setVideoSpeed(AD_SPEED);
        }
    } else if (skippingAd) {
        if (mutedForAd) {
            video.muted = false;
        }
        updatePageSettings();
        // Otherwise it shows the ad's 16x until the video's next timeupdate
        refreshSettingsHTML();
    }
    skippingAd = adShowing;
}

function injectSettingsHTML(defaultDurationElem) {
    // Time html, styled like YouTube's duration next to it
    const timeElement = document.createElement("span");
    timeElement.id = "new-time-ytpbs";
    timeElement.className = "ytp-time-duration";
    timeElement.style.marginLeft = "5px";
    defaultDurationElem.insertAdjacentElement('afterend', timeElement);
    Object.assign(INJECTED_ELEMENTS, {TIME: timeElement});
}

function refreshSettingsHTML() {
    if (!video || !INJECTED_ELEMENTS.TIME) {
        return;
    }
    // Time html
    const formattedTrueDuration = getFormattedTrueTime(video.duration, video.playbackRate);
    const formattedTrueCurrentTime = getFormattedTrueTime(video.currentTime, video.playbackRate);
    const playbackRate = video.playbackRate.toString().substring(0,4);
    INJECTED_ELEMENTS.TIME.textContent = `(${formattedTrueCurrentTime}/${formattedTrueDuration}) ${playbackRate}x`;
}

function attachEventListeners() {
    video.addEventListener("timeupdate", refreshSettingsHTML);
    video.addEventListener("loadedmetadata", updatePageSettings);
    video.addEventListener("loadedmetadata", refreshSettingsHTML);
    // YouTube unmutes when the next ad in a break loads
    video.addEventListener("volumechange", handleAds);
    video.addEventListener("ratechange", adoptYouTubeSpeed);
}

// YouTube is a single page app, so the player may not exist when this script
// loads (e.g. on youtube.com/) and is built in place when a video is opened.
// Called on every DOM mutation, so it returns early once attached.
function attachToPlayer() {
    if (video?.isConnected && INJECTED_ELEMENTS.TIME?.isConnected) {
        return;
    }
    const playerVideo = document.querySelector("#movie_player video");
    if (playerVideo && playerVideo !== video) {
        video = playerVideo;
        player = document.querySelector("#movie_player");
        attachEventListeners();
        updatePageSettings();
        // YouTube toggles the player's class when an ad starts and ends
        new MutationObserver(handleAds).observe(player, {
            attributes: true, attributeFilter: ["class"]
        });
        handleAds();
    }
    const defaultDurationElem = document.querySelector("#movie_player .ytp-time-duration");
    if (defaultDurationElem && !INJECTED_ELEMENTS.TIME?.isConnected) {
        injectSettingsHTML(defaultDurationElem);
    }
    refreshSettingsHTML();
}


// EVENT LISTENERS
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // During an ad the video is at AD_SPEED, so use the stored speed
    const currentSpeed = video && !isSkippingAd() ? video.playbackRate : tabSpeed ?? SETTINGS[KEYS.DEFAULT_SPEED];
    if (message.action === MESSAGES.GET_TAB_STATE) {
        sendResponse({hasVideo: Boolean(video), speed: currentSpeed, reason: video ? exclusionReason() : null});
        return;
    }
    switch(message.action) {
        case MESSAGES.REFRESH_SETTINGS:
            Object.assign(SETTINGS, message.settings);
            break;
        // Step from the video's actual rate, since YouTube can change it
        // without the extension knowing
        case COMMANDS.INCREMENT:
            userChangedSpeed(currentSpeed + SETTINGS[KEYS.INCREMENT]);
            break;
        case COMMANDS.DECREMENT:
            userChangedSpeed(currentSpeed - SETTINGS[KEYS.INCREMENT]);
            break;
        case COMMANDS.SET_SPEED_1:
        case COMMANDS.SET_SPEED_DEFAULT:
        case MESSAGES.SET_TAB_SPEED:
            userChangedSpeed(message.speed);
            break;

    }
    updatePageSettings();
    handleAds();
    refreshSettingsHTML();
});


// SCRIPT

chrome.runtime.sendMessage({action: MESSAGES.GET_SETTINGS})
.then((settings) => {
    Object.assign(SETTINGS, settings);
    attachToPlayer();
    new MutationObserver(attachToPlayer).observe(document.body, {childList: true, subtree: true});
})
