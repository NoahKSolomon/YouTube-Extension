
const MINUTE = 60;

const speedInput = document.getElementById("defaultSpeedValue");
const speedDisplay = document.getElementById("defaultSpeedDisplay");
const incrementInput = document.getElementById("incrementValue");
const incrementDisplay = document.getElementById("incrementDisplay");
const cutoffMinutes = document.getElementById("cutoffMinutesInput");
const cutoffSeconds = document.getElementById("cutoffSecondsInput");
const cutoffDisplay = document.getElementById("cutoffDisplay");
const livestreamInput = document.getElementById("enableForLivestreamValue");

const KEYS = {};
const SETTINGS = {};
const MESSAGES = {};

// FUNCTIONS

function padZero(number) {
    return number < 10 ? `0${number}` : `${number}`;
}

function updateSettingsHTML() {
    // Default speed setting
    speedInput.value = SETTINGS[KEYS.DEFAULT_SPEED];
    speedDisplay.innerHTML = `Current default: ${SETTINGS[KEYS.DEFAULT_SPEED]}x`;
    // Increment setting
    incrementInput.value = SETTINGS[KEYS.INCREMENT];
    incrementDisplay.innerHTML = `Current increment: ${SETTINGS[KEYS.INCREMENT]}x`
    // Cutoff setting
    const minutes = Math.floor(SETTINGS[KEYS.CUTOFF] / MINUTE);
    const seconds = SETTINGS[KEYS.CUTOFF] % MINUTE;
    cutoffMinutes.value = minutes;
    cutoffSeconds.value = seconds;
    if (SETTINGS[KEYS.CUTOFF] !== 0) {
        cutoffDisplay.innerHTML = `Current cutoff: ${minutes}:${padZero(seconds)}`;
    }
    // Livestream speed
    livestreamInput.checked = SETTINGS[KEYS.LIVESTREAM];
}

function refreshCurrentTabSpeed(speed) {
    chrome.tabs.query({ active: true, currentWindow: true}, tabs => {
        if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
        }
        const tempSettings = {...SETTINGS};
        tempSettings[KEYS.DEFAULT_SPEED] = speed;
        chrome.tabs.sendMessage(tabs[0].id, {action: MESSAGES.REFRESH_SETTINGS, settings: tempSettings});
    });
}

// EVENT LISTENERS

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === MESSAGES.REFRESH_SETTINGS) {
        Object.assign(SETTINGS, message.settings);
        updateSettingsHTML();
    }
});


// START SCRIPT

chrome.runtime.sendMessage({action: "getAllConfigs"})
.then((response) => {
    Object.assign(KEYS, response.keys);
    Object.assign(SETTINGS, response.settings);
    Object.assign(MESSAGES, response.messages);
    updateSettingsHTML();
}).catch((err) => {
    console.error(err);
});

document.getElementById("setSpeedButton").addEventListener("click", () => {
    SETTINGS[KEYS.DEFAULT_SPEED] = Number(document.getElementById("defaultSpeedValue").value);
    chrome.runtime.sendMessage({action: MESSAGES.UPDATE_SETTINGS, settings: SETTINGS});
    updateSettingsHTML();
});

document.getElementById("setIncrementButton").addEventListener("click", () => {
    SETTINGS[KEYS.INCREMENT] = Number(document.getElementById("incrementValue").value);
    chrome.runtime.sendMessage({action: MESSAGES.UPDATE_SETTINGS, settings: SETTINGS});
    updateSettingsHTML();
});

document.getElementById("cutoffButton").addEventListener("click", () => {
    const minutes = Number(document.getElementById("cutoffMinutesInput").value);
    const seconds = Number(document.getElementById("cutoffSecondsInput").value);
    SETTINGS[KEYS.CUTOFF] = minutes * 60 + seconds;
    chrome.runtime.sendMessage({action: MESSAGES.UPDATE_SETTINGS, settings: SETTINGS});
    updateSettingsHTML();
});

document.getElementById("enableForLivestreamValue").addEventListener("click", () => {
    SETTINGS[KEYS.CUTOFF] = Boolean(document.getElementById("enableForLivestreamValue").value);
    chrome.runtime.sendMessage({action: MESSAGES.UPDATE_SETTINGS, settings: SETTINGS});
});

document.getElementById("halfSpeedButton").addEventListener("click", () => {
    refreshCurrentTabSpeed(0.5);
});

document.getElementById("normalSpeedButton").addEventListener("click", () => {
    refreshCurrentTabSpeed(1);
});

document.getElementById("doubleSpeedButton").addEventListener("click", () => {
    refreshCurrentTabSpeed(2);
});

const links = document.getElementsByTagName("a");
for (let i = 0; i < links.length; i++) {
    links[i].addEventListener("click", function() {
        chrome.tabs.create({ url: this.href });
        return false;
    });
}

chrome.commands.getAll(commands => {
    commands.forEach(command => {
        let tdTag = document.getElementById(`td-${command.name}`);
        if (tdTag) {
            tdTag.textContent = command.shortcut || "Not set";
        }
    })
});

var colls = document.getElementsByClassName("collapsible");
for (let i = 0; i < colls.length; i++) {
  colls[i].addEventListener("click", function() {
    this.classList.toggle("active");
    var content = this.nextElementSibling;
    if (content.style.maxHeight){
      content.style.maxHeight = null;
      content.style.overflow = "hidden";
    } else {
      content.style.maxHeight = content.scrollHeight + "px";
      if(this.parentElement.classList.contains("how-to-use-content")) {
        var par = this.parentElement;
        par_max_h = par.style.maxHeight.substring(0,par.style.maxHeight.length-2);
        par.style.maxHeight = (Number(par_max_h) + Number(content.scrollHeight)) + "px";
      }
    }
  });
}