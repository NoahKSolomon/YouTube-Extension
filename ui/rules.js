// Speed rule list changes, used by the popup and the settings page. Each
// returns a new list, leaving the saved one untouched until it's saved.

// Adds the rule, or replaces the rule for the same channel or category
function setRule(rules, rule) {
    const index = rules.findIndex((r) => r.type === rule.type && r.value === rule.value);
    return index === -1 ? [...rules, rule] : rules.map((r, i) => (i === index ? rule : r));
}

function removeRule(rules, type, value) {
    return rules.filter((r) => !(r.type === type && r.value === value));
}

// A channel typed on the settings page: an @handle or a link to one, or a
// channel id (UC plus 22 characters) or a /channel/ link to one. undefined
// for anything else.
function parseChannel(text) {
    const trimmed = text.trim();
    const handle = trimmed.match(/^(?:(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/)?(@[^/?#\s]+)(?:[/?#].*)?$/i);
    if (handle) {
        return {value: handle[1], label: handle[1]};
    }
    const id = trimmed.match(/^(?:(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/channel\/)?(UC[\w-]{22})(?:[/?#].*)?$/i);
    return id ? {value: id[1], label: id[1]} : undefined;
}
