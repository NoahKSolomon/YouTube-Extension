// Settings page: every setting is bound and saved by ui/settings.js. This adds
// the hotkey list, which comes from the manifest's commands. Chrome only lets
// users change hotkeys on its own shortcuts page.

const hotkeyRows = document.getElementById("hotkeyRows");

function hotkeyRow(command) {
    const row = document.createElement("tr");
    const description = document.createElement("td");
    description.textContent = command.description;
    const shortcutCell = document.createElement("td");
    const shortcut = document.createElement("kbd");
    shortcut.className = command.shortcut ? "shortcut" : "shortcut unset";
    shortcut.textContent = command.shortcut || "Not set";
    shortcutCell.append(shortcut);
    row.append(description, shortcutCell);
    return row;
}

chrome.commands.getAll().then((commands) => {
    hotkeyRows.replaceChildren(...commands.filter((command) => command.description).map(hotkeyRow));
});

document.getElementById("changeHotkeys").addEventListener("click", () => {
    chrome.tabs.create({url: "chrome://extensions/shortcuts"});
});


// SPEED RULES

const ruleRows = document.getElementById("ruleRows");
const noRules = document.getElementById("noRules");
const newCategory = document.getElementById("newCategory");
const newCategorySpeed = document.getElementById("newCategorySpeed");
const addCategoryRule = document.getElementById("addCategoryRule");

const rules = () => SETTINGS[KEYS.RULES] ?? [];

function ruleName(rule) {
    return rule.label ?? rule.value;
}

function removeIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "currentColor");
    path.setAttribute("d", "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z");
    svg.append(path);
    return svg;
}

function ruleRow(rule, index) {
    const row = document.createElement("div");
    row.className = "row";

    const labels = document.createElement("span");
    labels.className = "label-group";
    const name = document.createElement("span");
    name.className = "label";
    name.textContent = ruleName(rule);
    const type = document.createElement("span");
    type.className = "hint";
    type.textContent = rule.type === "channel" ? "Channel" : "Category";
    labels.append(name, type);

    const field = document.createElement("span");
    field.className = "field";
    const speed = document.createElement("input");
    Object.assign(speed, {id: `rule-${index}`, className: "text-input", type: "number", min: "0.1", max: "16", step: "0.1"});
    speed.value = String(rule.speed);
    speed.setAttribute("aria-label", `Speed for ${ruleName(rule)}`);
    speed.setAttribute("aria-describedby", `rule-${index}-error`);
    speed.addEventListener("change", () => {
        const value = SETTING_KINDS.speed.parse(speed.value);
        showError(speed, value === undefined ? SETTING_KINDS.speed.error : "");
        if (value !== undefined) {
            saveSetting(KEYS.RULES, setRule(rules(), {...rule, speed: value}));
        }
    });
    const suffix = document.createElement("span");
    suffix.className = "suffix";
    suffix.textContent = "x";
    const remove = document.createElement("button");
    Object.assign(remove, {className: "icon-button", type: "button", title: "Remove rule"});
    remove.setAttribute("aria-label", `Remove rule for ${ruleName(rule)}`);
    remove.append(removeIcon());
    remove.addEventListener("click", () => {
        saveSetting(KEYS.RULES, removeRule(rules(), rule.type, rule.value));
        renderRules();
    });
    field.append(speed, suffix, remove);

    row.append(labels, field);
    const error = document.createElement("p");
    Object.assign(error, {id: `rule-${index}-error`, className: "error"});
    error.setAttribute("role", "alert");
    return [row, error];
}

// Channel rules first, each group by name
function renderRules() {
    const channelFirst = (rule) => (rule.type === "channel" ? 0 : 1);
    const sorted = [...rules()].sort((a, b) =>
        channelFirst(a) - channelFirst(b) || ruleName(a).localeCompare(ruleName(b)));
    ruleRows.replaceChildren(...sorted.flatMap(ruleRow));
    noRules.hidden = sorted.length > 0;

    const taken = new Set(rules().filter((r) => r.type === "category").map((r) => r.value));
    const available = CATEGORIES.filter((category) => !taken.has(category));
    newCategory.replaceChildren(...available.map((category) => new Option(category, category)));
    newCategory.disabled = addCategoryRule.disabled = available.length === 0;
}

addCategoryRule.addEventListener("click", () => {
    const speed = SETTING_KINDS.speed.parse(newCategorySpeed.value);
    showError(newCategorySpeed, speed === undefined ? SETTING_KINDS.speed.error : "");
    if (speed !== undefined && newCategory.value) {
        saveSetting(KEYS.RULES, setRule(rules(), {type: "category", value: newCategory.value, speed}));
        renderRules();
    }
});

onSettingsRendered(renderRules);
