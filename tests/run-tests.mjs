#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCase } from '../scripts/validate.mjs';
import { renderCase } from '../scripts/render.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const example = JSON.parse(fs.readFileSync(path.join(root, 'examples/synthetic-case.json'), 'utf8'));
const visualSchema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/visual.schema.json'), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));

const valid = validateCase(example, { audience: 'clinical' });
assert.equal(valid.valid, true, 'el ejemplo debe validar');
assert.equal(valid.risk.status, 'no_current_signal');
assert.equal(example.formulation.patterns[0].processes.length > 1, true, 'un patrón debe poder tocar varios procesos');
assert.equal(visualSchema.properties.audience.enum.includes('shareable'), true);
assert.equal(visualSchema.allOf[0].then.properties.confirmed_share.const, true, 'una vista compartible requiere confirmación');

const unknown = clone(example);
delete unknown.formulation.patterns[0].function_hypothesis;
assert.equal(validateCase(unknown).valid, false, 'una hipótesis sin elemento debe fallar con diagnóstico accionable');

const privateValue = clone(example);
privateValue.formulation.values.push({ id: 'private-1', text: 'nota clínica privada secreta', private: true, provenance: 'clinician_observation', epistemic_status: 'fact' });
const patient = validateCase(privateValue, { audience: 'patient' });
assert.equal(patient.valid, true);
assert.equal(JSON.stringify(patient.preview).includes('nota clínica privada secreta'), false, 'la allowlist no debe filtrar notas privadas');
assert.equal(patient.preview_only ?? false, false);

const urgent = clone(example);
urgent.formulation.open_questions.push('La persona tiene intención de hacerse daño ahora y un plan');
const urgentResult = validateCase(urgent);
assert.equal(urgentResult.valid, false);
assert.equal(urgentResult.risk.status, 'urgent_human_review');
assert.equal(urgentResult.errors.some((entry) => entry.code === 'URGENT_HUMAN_REVIEW'), true);

const negated = clone(example);
negated.formulation.open_questions.push('La persona niega ideación suicida');
const negatedResult = validateCase(negated);
assert.equal(negatedResult.risk.status, 'review_required');
assert.equal(negatedResult.valid, true, 'una negación requiere revisión, no una falsa certeza');

const historical = clone(example);
historical.formulation.open_questions.push('Antecedente de autolesión hace años, sin señal actual');
const historicalResult = validateCase(historical);
assert.equal(historicalResult.risk.status, 'review_required');

const render = renderCase(example, { view: 'all', audience: 'clinical' });
assert.equal(render.ok, true);
assert.match(render.html, /Mapa Hexaflex/);
assert.match(render.html, /prefers-reduced-motion/);
assert.match(render.html, /<main>/);
assert.match(render.html, /aria-labelledby="hexaflex-title"/);
assert.match(render.html, /<footer>/);
assert.equal(/\b(?:https?:)?\/\//i.test(render.html), false, 'el HTML debe ser offline');
const patientRender = renderCase(example, { view: 'all', audience: 'patient' });
assert.equal(patientRender.ok, true);
assert.match(patientRender.html, /Previsualización psicoeducativa/);
const shareWithoutConfirm = renderCase(example, { view: 'all', audience: 'shareable' });
assert.equal(shareWithoutConfirm.ok, false);
const share = renderCase(example, { view: 'all', audience: 'shareable', confirmShare: true });
assert.equal(share.ok, true);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hexaflex-tests-'));
fs.writeFileSync(path.join(temp, 'case.json'), JSON.stringify(example));
console.log(JSON.stringify({ ok: true, tests: 14, temp }, null, 2));
