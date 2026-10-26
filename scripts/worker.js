import {KEYS, DEFAULT_SETTINGS, COMMANDS, MESSAGES} from "./sharedObjects.js"

const settingsCache = structuredClone(DEFAULT_SETTINGS);
chrome.storage.sync.get(["settings"])
.then(result => {
    if (result.settings) {
        console.log("settings updates");
        Object.assign(settingsCache, result.settings);
        sendMessageToAllTabs({action: MESSAGES.REFRESH_SETTINGS, settings: settingsCache});
    }
});

// FUNCTIONS

// Update the settings chache if needed and return the most up to date settings
function getSettings() {
    console.log("sending settings");
    console.log(settingsCache);
    return settingsCache;
}

// Tabs opened before the extension was (re)loaded have no content script until
// refreshed, and sending to them rejects. Nothing is listening, so ignore it.
function sendMessageToTab(tabId, message) {
    chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

function sendMessageToAllTabs(message) {
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
            if (tab.url.match('https:\/\/www.youtube.com\/.*')) {
                sendMessageToTab(tab.id, message);
            }
        });
    });
}

// newSettings may hold only the settings that changed
function updateSettings(newSettings) {
    Object.assign(settingsCache, newSettings);
    chrome.storage.sync.set({settings: settingsCache});
    sendMessageToAllTabs({action: MESSAGES.REFRESH_SETTINGS, settings: settingsCache});
}


// EVENT LISTENERS

chrome.commands.onCommand.addListener(async (command) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    sendMessageToTab(tab.id, {
        action: command, 
        speed: (command === COMMANDS.SET_SPEED_DEFAULT) ? settingsCache[KEYS.DEFAULT_SPEED] : 1
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch(message.action) {
        case MESSAGES.GET_ALL_CONFIGS:
            sendResponse({
                keys: KEYS,
                settings: getSettings(),
                commands: COMMANDS,
                messages: MESSAGES
            });
            break;
        case MESSAGES.UPDATE_SETTINGS:
            updateSettings(message.settings);
            break;
    }
});