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
