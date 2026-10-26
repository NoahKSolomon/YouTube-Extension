// Popup: shows and sets the current tab's speed, and adds or removes a speed
// rule for the video's channel. The default speed and ad toggle are bound and
// saved by ui/settings.js.

const tabSpeed = document.getElementById("tabSpeed");
const noVideo = document.getElementById("noVideo");
const speedReason = document.getElementById("speedReason");
const speedChips = [...document.querySelectorAll("[data-speed]")];
const channelRule = document.getElementById("channelRule");
const channelRuleText = document.getElementById("channelRuleText");
const channelRuleButton = document.getElementById("channelRuleButton");
const channelRuleSpeed = document.getElementById("channelRuleSpeed");

let activeTabId = null;
let tabState = null;

function formatSpeed(speed) {
    return `${Number(speed.toFixed(2))}x`;
}

// Why the content script picked this video's speed. A channel rule shows on
// the channel's own line instead.
function reasonText(state) {
    switch (state.reason) {
        case "category":
            return `Category rule: ${state.reasonDetail} plays at ${formatSpeed(state.speed)}.`;
        case "short":
            return `Kept at 1x: this video is ${formatDuration(SETTINGS[KEYS.CUTOFF])} or shorter.`;
        case "livestream":
            return "Kept at 1x: speed changes are off for livestreams.";
        default:
            return "";
    }
}

const rules = () => SETTINGS[KEYS.RULES] ?? [];

function channelRuleFor(channel) {
    return rules().find((rule) => isRuleForChannel(rule, channel));
}

// The speed for the video's channel: "Add rule" with the tab's speed filled
// in, or the rule's speed (edited in place) and "Remove rule"
function showChannelRule() {
    const channel = tabState?.hasVideo ? tabState.channel : null;
    channelRule.hidden = !channel;
    if (!channel) {
        return;
    }
    const rule = channelRuleFor(channel);
    channelRuleText.textContent = rule ? `${channel.name} always plays at` : `Always play ${channel.name} at`;
    channelRuleButton.textContent = rule ? "Remove rule" : "Add rule";
    if (document.activeElement !== channelRuleSpeed) {
        channelRuleSpeed.value = String(rule?.speed ?? Number(tabState.speed.toFixed(2)));
        showError(channelRuleSpeed, "");
    }
}

function readChannelRuleSpeed() {
    const speed = SETTING_KINDS.speed.parse(channelRuleSpeed.value);
    showError(channelRuleSpeed, speed === undefined ? SETTING_KINDS.speed.error : "");
    return speed;
}

function showTabState(state) {
    tabState = state;
    const hasVideo = Boolean(state?.hasVideo);
    noVideo.hidden = hasVideo;
    speedReason.textContent = hasVideo ? reasonText(state) : "";
    speedReason.hidden = !speedReason.textContent;
    tabSpeed.textContent = hasVideo ? formatSpeed(state.speed) : "–";
    speedChips.forEach((chip) => {
        chip.disabled = !hasVideo;
        chip.setAttribute("aria-pressed", String(hasVideo && Number(chip.dataset.speed) === state.speed));
    });
    showChannelRule();
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

channelRuleButton.addEventListener("click", () => {
    const channel = tabState.channel;
    const rule = channelRuleFor(channel);
    if (rule) {
        saveSetting(KEYS.RULES, removeRule(rules(), rule.type, rule.value));
    } else {
        const speed = readChannelRuleSpeed();
        if (speed === undefined) {
            return;
        }
        saveSetting(KEYS.RULES, setRule(rules(), {type: "channel", value: channel.id, label: channel.name, speed}));
    }
    showChannelRule();
});

// Once there is a rule, editing the speed changes it
channelRuleSpeed.addEventListener("change", () => {
    const rule = channelRuleFor(tabState.channel);
    const speed = readChannelRuleSpeed();
    if (rule && speed !== undefined) {
        saveSetting(KEYS.RULES, setRule(rules(), {...rule, speed}));
    }
});

// The tab picks up rule changes from the worker's broadcast, then reports back
onSettingsRendered(() => setTimeout(refreshTabState, 100));

document.getElementById("openSettings").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
});

settingsReady.then(refreshTabState);
