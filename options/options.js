const speedInput = document.getElementById("defaultSpeedValue");
const speedDisplay = document.getElementById("defaultSpeedDisplay");
const setSpeedButton = document.getElementById("setSpeedButton");

const KEYS = {};
const SETTINGS = {};


// FUNCTIONS

function updateSettingsHTML() {
  // Default speed setting
  speedInput.value = SETTINGS[KEYS.DEFAULT_SPEED];
  speedDisplay.innerHTML = `Current default: ${SETTINGS[KEYS.DEFAULT_SPEED]}x`;
}


// START SCRIPT

chrome.runtime.sendMessage({action: "getAllConfigs"})
.then((response) => {
    Object.assign(KEYS, response.keys);
    Object.assign(SETTINGS, response.settings);
    updateSettingsHTML();
}).catch((err) => {
    console.error(err);
});

document.getElementById("setSpeedButton").addEventListener("click", () => {
  SETTINGS[KEYS.DEFAULT_SPEED] = Number(document.getElementById("defaultSpeedValue").value);
  chrome.runtime.sendMessage({action: MESSAGES.UPDATE_SETTINGS, settings: SETTINGS});
  updateSettingsHTML();
});