import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const msPath = path.resolve(__dirname, "../node_modules/milsymbol/src/milsymbol.js");
const ms = (await import(msPath)).default;
ms.setStandard("APP6");

// crude extraction of catalog entries from the TS source
const catSrc = readFileSync(
  path.resolve(__dirname, "../apps/geolibre-desktop/src/lib/milsymbol-catalog.ts"),
  "utf8",
);
const entries = [];
const re = /baseSidc:\s*"(\d{20})",\s*\n\s*name:\s*"([^"]+)"/g;
let m;
while ((m = re.exec(catSrc))) entries.push({ sidc: m[1], name: m[2] });

function postProcess(svg) {
  svg = svg.replace(
    /<path\s[^>]*?d="m\s*94\.8206\s*,\s*78\.1372[^"]*"[^>]*>(?:<\/path>)?/g,
    "",
  );
  svg = svg.replace(
    /<path\s(?:[^>]*?\s)?fill="black"(?:[^>]*?\s)?stroke="none"[^>]*d="[^"]*z[^"]*z[^"]*z[^"]*z[^"]*"[^>]*>(?:<\/path>)?/g,
    "",
  );
  return svg;
}

console.log("name | sidc | valid | #icons | postProcStrips");
for (const e of entries) {
  let valid = false, nIcons = 0, strips = 0;
  try {
    const sym = new ms.Symbol(e.sidc, { size: 40 });
    valid = sym.isValid();
    const svg = sym.asSVG();
    nIcons = (svg.match(/<path/g) || []).length;
    const after = postProcess(svg);
    strips = nIcons - (after.match(/<path/g) || []).length;
  } catch (err) {
    valid = "ERR:" + err.message;
  }
  const flag = strips > 0 ? "  <<< STRIPS" : "";
  console.log(`${e.name} | ${e.sidc} | ${valid} | ${nIcons} | ${strips}${flag}`);
}
