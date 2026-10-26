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
