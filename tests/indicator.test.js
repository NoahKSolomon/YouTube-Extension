// Run with: deno test --allow-read tests/
import { assertEquals } from "jsr:@std/assert@1";
import { read, setup, SETTINGS } from "./harness.js";

// Loading html/time_ui.html from the extension logged "Unsafe attempt to load
// URL chrome-extension://.../html/time_ui.html" around extension reloads, and
// exposing it as a web accessible resource let any site detect the extension
Deno.test("the content script does not load anything from the extension", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    assertEquals(t.fetches, []);
    t.cleanup();
});

Deno.test("the extension exposes no files to web pages", async () => {
    const manifest = JSON.parse(await read("manifest.json"));
    assertEquals(manifest.web_accessible_resources, undefined);
});

Deno.test("the indicator is inserted right after YouTube's duration", async () => {
    const t = await setup(SETTINGS(2, 0.25));
    const indicator = t.page.injected;
    assertEquals(t.page.injectCount, 1);
    assertEquals(indicator.position, "afterend");
    assertEquals(indicator.tagName, "SPAN");
    assertEquals(indicator.id, "new-time-ytpbs");
    assertEquals(indicator.className, "ytp-time-duration");
    assertEquals(indicator.style.marginLeft, "5px");
    t.page.video.dispatch("timeupdate");
    assertEquals(indicator.innerHTML, "(0:00/5:00) 2x");
    t.cleanup();
});
