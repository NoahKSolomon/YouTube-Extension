// This sript is to collect the custom default settings from the background,
// inject the custom HTML elements, and set the playback speed of the youtube
// video if applicable

// Set once the watch page player exists, which may be after this script loads
let player = null;
let video = null;

// Chrome's maximum playbackRate
const AD_SPEED = 16;
// Whether an ad is currently being sped through, and whether the extension
// muted it (so a video the user muted stays muted afterwards)
let skippingAd = false;
let mutedForAd = false;

const KEYS = {};
const SETTINGS = {};
const COMMANDS = {};
const MESSAGES = {};
const ELEMENTS = {};
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

// Update the actual page elements with the settings
function updatePageSettings() {
    if (video) {
        video.playbackRate = isSkippingAd() ? AD_SPEED : SETTINGS[KEYS.DEFAULT_SPEED];
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
            video.playbackRate = AD_SPEED;
        }
    } else if (skippingAd) {
        if (mutedForAd) {
            video.muted = false;
        }
        updatePageSettings();
    }
    skippingAd = adShowing;
}

async function retrieveHTMLToInject() {
    return fetch(chrome.runtime.getURL("html/time_ui.html"))
    .then(response => response.text())
    .then(timeElement => {
        Object.assign(ELEMENTS, {TIME: timeElement});
    });
}

function injectSettingsHTML(defaultDurationElem) {
    // Time html
    defaultDurationElem.insertAdjacentHTML('afterend', ELEMENTS.TIME);
    Object.assign(INJECTED_ELEMENTS, {TIME: document.getElementById("new-time-ytpbs")});
}

function refreshSettingsHTML() {
    if (!video || !INJECTED_ELEMENTS.TIME) {
        return;
    }
    // Time html
    const formattedTrueDuration = getFormattedTrueTime(video.duration, video.playbackRate);
    const formattedTrueCurrentTime = getFormattedTrueTime(video.currentTime, video.playbackRate);
    const playbackRate = video.playbackRate.toString().substring(0,4);
    INJECTED_ELEMENTS.TIME.innerHTML = `(${formattedTrueCurrentTime}/${formattedTrueDuration}) ${playbackRate}x`;
}

function attachEventListeners() {
    video.addEventListener("timeupdate", refreshSettingsHTML);
    video.addEventListener("loadedmetadata", updatePageSettings);
    video.addEventListener("loadedmetadata", refreshSettingsHTML);
    // YouTube unmutes when the next ad in a break loads
    video.addEventListener("volumechange", handleAds);
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
    // During an ad the video is at AD_SPEED, so step from the stored speed
    const currentSpeed = video && !isSkippingAd() ? video.playbackRate : SETTINGS[KEYS.DEFAULT_SPEED];
    switch(message.action) {
        case MESSAGES.REFRESH_SETTINGS:
            Object.assign(SETTINGS, message.settings);
            break;
        // Step from the video's actual rate, since YouTube can change it
        // without the extension knowing
        case COMMANDS.INCREMENT:
            SETTINGS[KEYS.DEFAULT_SPEED] = currentSpeed + SETTINGS[KEYS.INCREMENT];
            break;
        case COMMANDS.DECREMENT:
            SETTINGS[KEYS.DEFAULT_SPEED] = currentSpeed - SETTINGS[KEYS.INCREMENT];
            break;
        case COMMANDS.SET_SPEED_1:
        case COMMANDS.SET_SPEED_DEFAULT:
            SETTINGS[KEYS.DEFAULT_SPEED] = message.speed;
            break;

    }
    updatePageSettings();
    handleAds();
    refreshSettingsHTML();
});


// SCRIPT

chrome.runtime.sendMessage({action: "getAllConfigs"})
.then((configs) => {
    Object.assign(KEYS, configs.keys);
    Object.assign(SETTINGS, configs.settings);
    Object.assign(COMMANDS, configs.commands);
    Object.assign(MESSAGES, configs.messages);
    retrieveHTMLToInject()
    .then(() => {
        attachToPlayer();
        new MutationObserver(attachToPlayer).observe(document.body, {childList: true, subtree: true});
    });
})
