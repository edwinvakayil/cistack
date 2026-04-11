import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DICTIONARY_DIR = path.join(__dirname, "../dictionaries");
const SOURCE = "en.json";

function keyPaths(value, prefix = "") {
  if (value === null || typeof value !== "object") {
    return [prefix || "(root)"];
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return [prefix + "[]"];
    return value.flatMap((item, i) => keyPaths(item, `${prefix}[${i}]`));
  }
  const keys = Object.keys(value).sort();
  if (keys.length === 0) return [prefix || "(empty)"];
  return keys.flatMap((k) => keyPaths(value[k], prefix ? `${prefix}.${k}` : k));
}

const sourceRaw = fs.readFileSync(path.join(DICTIONARY_DIR, SOURCE), "utf8");
const en = JSON.parse(sourceRaw);
const enPaths = new Set(keyPaths(en).sort());

let failed = false;
for (const file of fs.readdirSync(DICTIONARY_DIR)) {
  if (!file.endsWith(".json") || file === SOURCE) continue;
  const data = JSON.parse(fs.readFileSync(path.join(DICTIONARY_DIR, file), "utf8"));
  const paths = new Set(keyPaths(data).sort());
  const missing = [...enPaths].filter((p) => !paths.has(p));
  const extra = [...paths].filter((p) => !enPaths.has(p));
  if (missing.length || extra.length) {
    console.error(`\n${file}:`);
    if (missing.length) console.error("  missing:", missing.slice(0, 8).join(", "), missing.length > 8 ? `… +${missing.length - 8}` : "");
    if (extra.length) console.error("  extra:", extra.slice(0, 8).join(", "), extra.length > 8 ? `… +${extra.length - 8}` : "");
    failed = true;
  }
}

if (failed) {
  console.error("\nvalidate-i18n: locale key paths must match en.json\n");
  process.exit(1);
}
console.log("validate-i18n: all locales match en.json key paths");
