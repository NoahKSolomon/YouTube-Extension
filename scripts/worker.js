importScripts("sharedObjects.js");

const settingsCache = structuredClone(DEFAULT_SETTINGS);
// Chrome stops this worker when idle and restarts it on the next event, so
// everything that reads or changes settings waits for storage to be read
// first. Otherwise it would hand out (or save over) the defaults.
const settingsLoaded = chrome.storage.sync.get(["settings"])
.then(result => {
    Object.assign(settingsCache, result.settings);
});

// FUNCTIONS

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
    await settingsLoaded;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    sendMessageToTab(tab.id, {
        action: command, 
        speed: (command === COMMANDS.SET_SPEED_DEFAULT) ? settingsCache[KEYS.DEFAULT_SPEED] : 1
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch(message.action) {
        case MESSAGES.GET_SETTINGS:
            settingsLoaded.then(() => sendResponse(settingsCache));
            // Keeps the message channel open for the response above
            return true;
        case MESSAGES.UPDATE_SETTINGS:
            settingsLoaded.then(() => updateSettings(message.settings));
            break;
    }
});