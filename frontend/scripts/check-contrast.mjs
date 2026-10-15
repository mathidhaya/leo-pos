import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.resolve(here, "../src/index.css"), "utf8");

const tokens = { white: "#ffffff" };
for (const match of css.matchAll(/--color-leo-(\d+):\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens[`leo-${match[1]}`] = match[2];

for (const name of ["leo-50", "leo-100", "leo-600", "leo-700"]) {
  if (!tokens[name]) {
    console.error(`Could not find --color-${name} in src/index.css.`);
    process.exit(1);
  }
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const linear = (channel) => {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const ratio = (a, b) => {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
};
const blend = (fg, bg, alpha) => fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)));

const c = (name) => rgb(tokens[name]);
const pairs = [
  ["White text on buttons, selected tabs, the active menu item (bg-leo-600)", c("white"), c("leo-600"), 4.5],
  ["White text on a hovered button (bg-leo-700)", c("white"), c("leo-700"), 4.5],
  ["Green text on white cards (text-leo-700)", c("leo-700"), c("white"), 4.5],
  ["Green links and hover text (text-leo-600)", c("leo-600"), c("white"), 4.5],
  ["Green text on a pale green box (leo-700 on leo-50)", c("leo-700"), c("leo-50"), 4.5],
  ["Green text on badges (leo-700 on leo-100)", c("leo-700"), c("leo-100"), 4.5],
  ["Light text on the dark green login panel (leo-100 on leo-700)", c("leo-100"), c("leo-700"), 4.5],
  ["Faded text on the login panel (leo-100 at 80% on leo-700)", blend(c("leo-100"), c("leo-700"), 0.8), c("leo-700"), 4.5],
  ["Green focus rings and borders on white (needs 3:1)", c("leo-600"), c("white"), 3],
];

let failed = 0;
for (const [label, fg, bg, minimum] of pairs) {
  const value = ratio(fg, bg);
  const ok = value >= minimum;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${value.toFixed(2).padStart(5)}:1 (needs ${minimum})  ${label}`);
}

console.log(
  failed === 0
    ? "\nAll green pairings pass. Greys, reds and ambers come from Tailwind's own palette: check them with Lighthouse (see docs/UI-CHECKLIST.md)."
    : `\n${failed} pairing${failed === 1 ? "" : "s"} below the WCAG minimum.`
);
process.exit(failed === 0 ? 0 : 1);
