// Copies tldraw's fonts, icons and translations from @bigbluebutton/assets
// into public/, served as /assets/tldraw/… (see src/App.tsx).
// getAssetUrlsByImport does not work with Vite: it imports the translations
// as JSON, so Vite hands it objects instead of URLs.
import { cpSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const source = dirname(require.resolve("@bigbluebutton/assets/package.json"));
const target = new URL("../public/assets/tldraw", import.meta.url).pathname;

rmSync(target, { recursive: true, force: true });
for (const dir of ["fonts", "icons", "translations", "embed-icons"]) {
  cpSync(join(source, dir), join(target, dir), { recursive: true });
}
console.log(`assets copied to ${target}`);
