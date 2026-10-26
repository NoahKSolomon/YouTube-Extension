// Run with: deno test --allow-read tests/
// ui/rules.js: adding, changing and removing speed rules
import { assertEquals } from "jsr:@std/assert@1";
import { read } from "./harness.js";

const { setRule, removeRule } = new Function(`${await read("ui/rules.js")}\nreturn { setRule, removeRule };`)();
const MUSIC = { type: "category", value: "Music", speed: 1 };
const ALAN = { type: "channel", value: "UCalan", label: "Alan Walker", speed: 1.5 };

Deno.test("setRule adds a rule", () => {
    assertEquals(setRule([MUSIC], ALAN), [MUSIC, ALAN]);
});

Deno.test("setRule replaces the rule for the same channel or category", () => {
    assertEquals(setRule([MUSIC, ALAN], { ...ALAN, speed: 2 }), [MUSIC, { ...ALAN, speed: 2 }]);
});

Deno.test("removeRule removes only that rule", () => {
    assertEquals(removeRule([MUSIC, ALAN], "channel", "UCalan"), [MUSIC]);
});

Deno.test("rules are not changed in place", () => {
    const rules = [MUSIC];
    setRule(rules, ALAN);
    removeRule(rules, "category", "Music");
    assertEquals(rules, [MUSIC]);
});
