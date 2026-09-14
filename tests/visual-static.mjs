#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCase } from '../scripts/render.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const example = JSON.parse(fs.readFileSync(path.join(root, 'examples/synthetic-case.json'), 'utf8'));
const before = JSON.stringify(example);
const result = renderCase(example, { view: 'all', audience: 'clinical' });
assert.equal(result.ok, true);
const html = result.html;
for (const preset of ['sage', 'ocean', 'amber', 'plum', 'high-contrast']) assert.match(html, new RegExp(`value="${preset}"`));
for (const mode of ['system', 'light', 'dark']) assert.match(html, new RegExp(`value="${mode}"`));
assert.match(html, /prefers-reduced-motion/);
assert.match(html, /max-width:600px/);
assert.match(html, /radial-node/);
assert.match(html, /keydown/);
assert.match(html, /guided-pause/);
assert.match(html, /feedback-form/);
assert.equal(/\b(?:https?:)?\/\//i.test(html), false);
assert.equal(JSON.stringify(example), before, 'render no debe mutar el JSON fuente');
assert.doesNotMatch(html, /localStorage\.setItem\([^)]*response/i, 'no se debe guardar texto de feedback en localStorage');
console.log(JSON.stringify({ ok: true, visual_checks: 12 }, null, 2));
