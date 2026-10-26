// Run with: deno test --allow-read tests/
// ui/rules.js: adding, changing and removing speed rules
import { assertEquals } from "jsr:@std/assert@1";
import { read } from "./harness.js";

const { setRule, removeRule, parseChannel } =
    new Function(`${await read("ui/rules.js")}\nreturn { setRule, removeRule, parseChannel };`)();
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

// The settings page's "Add a channel rule" box
Deno.test("parseChannel reads handles, channel links and channel ids", () => {
    const handle = { value: "@Alanwalkermusic", label: "@Alanwalkermusic" };
    assertEquals(parseChannel("@Alanwalkermusic"), handle);
    assertEquals(parseChannel("  https://www.youtube.com/@Alanwalkermusic/videos "), handle);
    assertEquals(parseChannel("youtube.com/@Alanwalkermusic?si=abc"), handle);
    const id = { value: "UCJrOtniJ0-NWz37R30urifQ", label: "UCJrOtniJ0-NWz37R30urifQ" };
    assertEquals(parseChannel("https://www.youtube.com/channel/UCJrOtniJ0-NWz37R30urifQ"), id);
    assertEquals(parseChannel("UCJrOtniJ0-NWz37R30urifQ"), id);
});

Deno.test("parseChannel rejects anything else", () => {
    for (const text of ["", "Alan Walker", "https://www.youtube.com/watch?v=abc", "https://example.com/@someone", "@"]) {
        assertEquals(parseChannel(text), undefined, text);
    }
});
