// Run with: deno test --allow-read tests/
// Every context loads scripts/sharedObjects.js itself, so constants exist
// before any message is exchanged
import { assert, assertEquals } from "jsr:@std/assert@1";
import { read } from "./harness.js";

const scriptSrcs = (html) => [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);

Deno.test("the content script loads the shared constants first", async () => {
    const manifest = JSON.parse(await read("manifest.json"));
    assertEquals(manifest.content_scripts[0].js, ["scripts/sharedObjects.js", "scripts/content.js"]);
});

Deno.test("the worker loads the shared constants with importScripts", async () => {
    const manifest = JSON.parse(await read("manifest.json"));
    assertEquals(manifest.background.type, undefined);
    assert((await read("scripts/worker.js")).startsWith('importScripts("sharedObjects.js");'));
});

for (const page of ["popup/popup.html", "options/options.html"]) {
    Deno.test(`${page} loads the shared constants before its scripts`, async () => {
        const srcs = scriptSrcs(await read(page));
        assertEquals(srcs[0], "../scripts/sharedObjects.js");
    });
}

Deno.test("no context waits for constants from the worker", async () => {
    for (const file of ["scripts/content.js", "ui/settings.js"]) {
        const src = await read(file);
        assert(!/const (KEYS|COMMANDS|MESSAGES) = \{\}/.test(src), `${file} still fills constants from a message`);
    }
});
