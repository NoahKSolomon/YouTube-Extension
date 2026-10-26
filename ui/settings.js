// Shared by the popup and the settings page. Loads settings from the service
// worker, then binds every input marked with data-setting so each change is
// checked and saved straight away.

const SETTINGS = {};

function formatDuration(seconds) {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// Accepts "m:ss", plain seconds, or nothing (0, which turns the cutoff off)
function parseDuration(text) {
    const trimmed = text.trim();
    if (trimmed === "") {
        return 0;
    }
    const minutesAndSeconds = trimmed.match(/^(\d+):([0-5]\d)$/);
    if (minutesAndSeconds) {
        return Number(minutesAndSeconds[1]) * 60 + Number(minutesAndSeconds[2]);
    }
    return /^\d+$/.test(trimmed) ? Number(trimmed) : undefined;
}

function parseNumberInRange(text, isValid) {
    const value = Number(text);
    return text.trim() !== "" && isValid(value) ? value : undefined;
}

// How each kind of text setting is shown and read back. parse returns
// undefined for input that should not be saved.
const SETTING_KINDS = {
    speed: {
        format: String,
        parse: (text) => parseNumberInRange(text, (v) => v >= MIN_SPEED && v <= MAX_SPEED),
        error: `Enter a speed from ${MIN_SPEED} to ${MAX_SPEED}`,
    },
    step: {
        format: String,
        parse: (text) => parseNumberInRange(text, (v) => v > 0 && v <= MAX_SPEED),
        error: `Enter a step above 0, up to ${MAX_SPEED}`,
    },
    duration: {
        format: (seconds) => (seconds > 0 ? formatDuration(seconds) : ""),
        parse: parseDuration,
        error: "Use minutes:seconds, like 1:30",
    },
};

let toastTimer = null;

function showToast(text) {
    const toast = document.getElementById("toast");
    toast.textContent = text;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 1500);
}

// Only the changed setting is sent, so the popup and the settings page being
// open at once cannot overwrite each other's changes
function saveSetting(key, value) {
    SETTINGS[key] = value;
    chrome.runtime.sendMessage({action: MESSAGES.UPDATE_SETTINGS, settings: {[key]: value}});
    showToast("Saved");
}

function showError(input, message) {
    input.setAttribute("aria-invalid", String(Boolean(message)));
    document.getElementById(`${input.id}-error`).textContent = message;
}

// Show the current settings in every input, except one being edited
function renderSettings() {
    document.querySelectorAll("[data-setting]").forEach((input) => {
        if (input === document.activeElement) {
            return;
        }
        const key = KEYS[input.dataset.setting];
        if (input.type === "checkbox") {
            input.checked = Boolean(SETTINGS[key]);
            return;
        }
        input.value = SETTING_KINDS[input.dataset.kind].format(SETTINGS[key]);
        showError(input, "");
    });
}

function bindSettings() {
    document.querySelectorAll("[data-setting]").forEach((input) => {
        const key = KEYS[input.dataset.setting];
        if (input.type === "checkbox") {
            input.addEventListener("change", () => saveSetting(key, input.checked));
            return;
        }
        const kind = SETTING_KINDS[input.dataset.kind];
        input.addEventListener("change", () => {
            const value = kind.parse(input.value);
            if (value === undefined) {
                showError(input, kind.error);
                return;
            }
            showError(input, "");
            input.value = kind.format(value);
            saveSetting(key, value);
        });
    });
}

const settingsReady = chrome.runtime.sendMessage({action: MESSAGES.GET_SETTINGS})
.then((settings) => {
    Object.assign(SETTINGS, settings);
    bindSettings();
    renderSettings();
});

// Reflect settings saved elsewhere, e.g. in the popup while the settings page
// is open. The worker always saves the full settings object.
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.settings) {
        Object.assign(SETTINGS, changes.settings.newValue);
        renderSettings();
    }
});
