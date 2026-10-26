// Run with: deno test --allow-read tests/
// ui/settings.js, shared by the popup and the settings page
import { assertEquals } from "jsr:@std/assert@1";
import { setupSettingsUI, SETTINGS } from "./harness.js";

const INPUTS = [
    { id: "defaultSpeed", setting: "DEFAULT_SPEED", kind: "speed" },
    { id: "cutoff", setting: "CUTOFF", kind: "duration" },
    { id: "skipAds", setting: "SKIP_ADS" },
];
const saved = (ui) => ui.sent.filter((m) => m.action === "updateSettings").map((m) => m.settings);

Deno.test("inputs show the saved settings", async () => {
    const ui = await setupSettingsUI(SETTINGS(2, 0.25, { cutoff_in_seconds: 90, skip_ads: false }), INPUTS);
    assertEquals(ui.elements.defaultSpeed.value, "2");
    assertEquals(ui.elements.cutoff.value, "1:30");
    assertEquals(ui.elements.skipAds.checked, false);
});

Deno.test("a valid change saves only that setting", async () => {
    const ui = await setupSettingsUI(SETTINGS(2, 0.25), INPUTS);
    ui.elements.cutoff.value = "2:05";
    ui.elements.cutoff.dispatch("change");
    assertEquals(saved(ui), [{ cutoff_in_seconds: 125 }]);
});

Deno.test("an invalid change shows an error and is not saved", async () => {
    const ui = await setupSettingsUI(SETTINGS(2, 0.25), INPUTS);
    ui.elements.defaultSpeed.value = "20";
    ui.elements.defaultSpeed.dispatch("change");
    assertEquals(saved(ui), []);
    assertEquals(ui.elements["defaultSpeed-error"].textContent, "Enter a speed from 0.0625 to 16");
});

Deno.test("changes saved elsewhere show up without reopening", async () => {
    const ui = await setupSettingsUI(SETTINGS(2, 0.25), INPUTS);
    ui.storageChanged(SETTINGS(1.5, 0.25, { cutoff_in_seconds: 60, skip_ads: false }));
    assertEquals(ui.elements.defaultSpeed.value, "1.5");
    assertEquals(ui.elements.cutoff.value, "1:00");
    assertEquals(ui.elements.skipAds.checked, false);
});

Deno.test("changes saved elsewhere don't overwrite the field being edited", async () => {
    const ui = await setupSettingsUI(SETTINGS(2, 0.25), INPUTS);
    ui.document.activeElement = ui.elements.defaultSpeed;
    ui.elements.defaultSpeed.value = "1.2";
    ui.storageChanged(SETTINGS(3, 0.25));
    assertEquals(ui.elements.defaultSpeed.value, "1.2");
});
