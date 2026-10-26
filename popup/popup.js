// Popup: shows and sets the current tab's speed. The default speed and ad
// toggle are bound and saved by ui/settings.js.

const tabSpeed = document.getElementById("tabSpeed");
const noVideo = document.getElementById("noVideo");
const speedReason = document.getElementById("speedReason");
const speedChips = [...document.querySelectorAll("[data-speed]")];

let activeTabId = null;

function formatSpeed(speed) {
    return `${Number(speed.toFixed(2))}x`;
}

// Why the content script left this video at 1x
function reasonText(reason) {
    switch (reason) {
        case "short":
            return `Kept at 1x: this video is ${formatDuration(SETTINGS[KEYS.CUTOFF])} or shorter.`;
        case "livestream":
            return "Kept at 1x: speed changes are off for livestreams.";
        default:
            return "";
    }
}

function showTabState(state) {
    const hasVideo = Boolean(state?.hasVideo);
    noVideo.hidden = hasVideo;
    speedReason.textContent = hasVideo ? reasonText(state.reason) : "";
    speedReason.hidden = !speedReason.textContent;
    tabSpeed.textContent = hasVideo ? formatSpeed(state.speed) : "–";
    speedChips.forEach((chip) => {
        chip.disabled = !hasVideo;
        chip.setAttribute("aria-pressed", String(hasVideo && Number(chip.dataset.speed) === state.speed));
    });
}

// Fails when the tab is not YouTube, or was open before the extension loaded
async function sendToActiveTab(message) {
    try {
        return await chrome.tabs.sendMessage(activeTabId, message);
    } catch {
        return null;
    }
}

async function refreshTabState() {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    activeTabId = tab?.id;
    showTabState(await sendToActiveTab({action: MESSAGES.GET_TAB_STATE}));
}

speedChips.forEach((chip) => {
    chip.addEventListener("click", async () => {
        await sendToActiveTab({action: MESSAGES.SET_TAB_SPEED, speed: Number(chip.dataset.speed)});
        refreshTabState();
    });
});

document.getElementById("openSettings").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
});

settingsReady.then(refreshTabState);
