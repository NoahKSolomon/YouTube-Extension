// This sript is to collect the custom default settings from the background,
// inject the custom HTML elements, and set the playback speed of the youtube
// video if applicable

const [ video ] = document.getElementsByTagName("video");

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

// Update the actual page elements with the settings
function updatePageSettings() {
    video.playbackRate = SETTINGS[KEYS.DEFAULT_SPEED];
}

async function retrieveHTMLToInject() {
    return fetch(chrome.runtime.getURL("html/time_ui.html"))
    .then(response => response.text())
    .then(timeElement => {
        Object.assign(ELEMENTS, {TIME: timeElement});
    });
}

function injectSettingsHTML() {
    // Time html
    let [ defaultDurationElem ] = document.getElementsByClassName("ytp-time-duration");
    defaultDurationElem.insertAdjacentHTML('afterend', ELEMENTS.TIME);
    Object.assign(INJECTED_ELEMENTS, {TIME: document.getElementById("new-time-ytpbs")});
}

function refreshSettingsHTML() {
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
}


// EVENT LISTENERS
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch(message.action) {
        case MESSAGES.REFRESH_SETTINGS:
            Object.assign(SETTINGS, message.settings);
            break;
        case COMMANDS.INCREMENT:
            SETTINGS[KEYS.DEFAULT_SPEED] += SETTINGS[KEYS.INCREMENT];
            break;
        case COMMANDS.DECREMENT:
            SETTINGS[KEYS.DEFAULT_SPEED] -= SETTINGS[KEYS.INCREMENT];
            break;
        case COMMANDS.SET_SPEED_1:
        case COMMANDS.SET_SPEED_DEFAULT:
            SETTINGS[KEYS.DEFAULT_SPEED] = message.speed;
            break;
        
    }
    updatePageSettings();
    refreshSettingsHTML();
});


// SCRIPT

chrome.runtime.sendMessage({action: "getAllConfigs"})
.then((configs) => {
    Object.assign(KEYS, configs.keys);
    Object.assign(SETTINGS, configs.settings);
    Object.assign(COMMANDS, configs.commands);
    Object.assign(MESSAGES, configs.messages);
    updatePageSettings();
    retrieveHTMLToInject()
    .then(() => {
        injectSettingsHTML();
        refreshSettingsHTML();
        attachEventListeners();
    });
})
