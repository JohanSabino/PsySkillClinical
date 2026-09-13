#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCase } from '../scripts/validate.mjs';
import { renderCase } from '../scripts/render.mjs';
import { ingestDirectory, ingestFiles } from '../scripts/ingest.mjs';
import { destroyMapping, findIdentifiers, receiptCompatibility, transformData, validateAssistedRedactor } from '../scripts/privacy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const example = JSON.parse(fs.readFileSync(path.join(root, 'examples/synthetic-case.json'), 'utf8'));
const visualSchema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/visual.schema.json'), 'utf8'));
const caseSchema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/case.schema.json'), 'utf8'));
const sessionSchema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/session.schema.json'), 'utf8'));
const documentSchema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/document.schema.json'), 'utf8'));
const privacySchema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/privacy.schema.json'), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));

const valid = validateCase(example, { audience: 'clinical' });
assert.equal(valid.valid, true, 'el ejemplo debe validar');
assert.equal(valid.risk.status, 'no_current_signal');
assert.equal(example.formulation.patterns[0].processes.length > 1, true, 'un patrón debe poder tocar varios procesos');
assert.equal(visualSchema.properties.audience.enum.includes('shareable'), true);
assert.equal(visualSchema.allOf[0].then.properties.confirmed_share.const, true, 'una vista compartible requiere confirmación');
assert.equal(caseSchema.properties.session_config.$ref, 'session.schema.json');
assert.equal(caseSchema.properties.documents.items.$ref, 'document.schema.json');
assert.equal(caseSchema.properties.privacy.$ref, 'privacy.schema.json');
assert.equal(sessionSchema.required.includes('source_policy'), true);
assert.equal(documentSchema.properties.legibility.enum.includes('unsupported'), true);
assert.equal(privacySchema.properties.raw_content_included.const, false);

const nonAct = clone(example);
nonAct.session_config.intervention_model = 'CBT';
assert.equal(validateCase(nonAct).valid, true, 'un modelo no ACT debe validar sin activar supuestos Hexaflex');
const unknownAudience = clone(example);
unknownAudience.session_config.audience = 'unknown';
const unknownAudienceShare = validateCase(unknownAudience, { audience: 'shareable', confirmShare: true });
assert.equal(unknownAudienceShare.valid, false, 'una audiencia desconocida bloquea material compartible');
assert.equal(unknownAudienceShare.errors.some((entry) => entry.code === 'AUDIENCE_UNKNOWN_BLOCKED'), true);

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
assert.match(render.html, /Orientación de esta sesión/);
assert.match(render.html, /process-filter/);
assert.match(render.html, /evidence-filter/);
assert.match(render.html, /reset-filters/);
assert.match(render.html, /data-processes/);
assert.match(render.html, /<noscript>/);
assert.equal(/\b(?:https?:)?\/\//i.test(render.html), false, 'el HTML debe ser offline');
const patientRender = renderCase(example, { view: 'all', audience: 'patient' });
assert.equal(patientRender.ok, true);
assert.match(patientRender.html, /Previsualización psicoeducativa/);
const shareWithoutConfirm = renderCase(example, { view: 'all', audience: 'shareable' });
assert.equal(shareWithoutConfirm.ok, false);
const share = renderCase(example, { view: 'all', audience: 'shareable', confirmShare: true });
assert.equal(share.ok, true);

const inputManifest = ingestDirectory(path.join(root, 'examples', 'synthetic-input'));
assert.equal(inputManifest.documents.length, 2, 'debe incluir solo documentos permitidos');
assert.equal(inputManifest.requires_confirmation, true, 'la selección de archivos requiere confirmación explícita');
assert.equal(ingestDirectory(path.join(root, 'examples', 'synthetic-input'), { selectionConfirmed: true }).selection_confirmed, true);
assert.equal(inputManifest.documents.some((document) => document.kind === 'markdown' && document.legibility === 'full'), true);
assert.equal(inputManifest.documents.some((document) => document.kind === 'pdf' && document.legibility === 'unsupported'), true, 'PDF sin extractor debe degradar a unsupported');
assert.equal(inputManifest.warnings.some((warning) => warning.includes('ignored.exe')), true, 'debe explicar exclusiones');
assert.equal(inputManifest.documents.every((document) => /^[a-f0-9]{64}$/.test(document.sha256)), true);
const limitedManifest = ingestDirectory(path.join(root, 'examples', 'synthetic-input'), { limits: { maxFiles: 1 } });
assert.equal(limitedManifest.documents.length, 1, 'el límite de archivos debe detener la selección');
const tooLarge = ingestFiles([path.join(root, 'examples', 'synthetic-input', 'notas-sinteticas.md')], { limits: { maxBytes: 1 } });
assert.equal(tooLarge.documents[0].legibility, 'unreadable', 'el límite de tamaño debe producir un diagnóstico accionable');

const privateData = { meta: { title: 'Caso de prueba', audience: 'clinical' }, note: 'Ana Pérez, ana@example.com, +57 300 1234567, Calle 10 # 20-30' };
const redacted = transformData(privateData, { mode: 'redact', names: ['Ana Pérez'] });
assert.equal(redacted.status, 'ready');
assert.equal(JSON.stringify(redacted.payload).includes('ana@example.com'), false);
assert.equal(JSON.stringify(redacted.payload).includes('300 1234567'), false);
assert.equal(JSON.stringify(redacted.payload).includes('Calle 10'), false);
assert.equal(redacted.receipt.raw_content_included, false);
assert.equal(Object.keys(redacted.receipt.counts).length > 0, true);
assert.equal(findIdentifiers(JSON.stringify(redacted.payload)).length, 0, 'el segundo escaneo no debe hallar identificadores');

const pseudonymized = transformData({ first: 'Ana Pérez', second: 'Ana Pérez' }, { mode: 'pseudonymize', names: ['Ana Pérez'] });
assert.equal(pseudonymized.status, 'ready');
assert.equal(pseudonymized.payload.first, pseudonymized.payload.second, 'el token debe ser consistente');
assert.equal(pseudonymized.receipt.mapping_storage, 'ephemeral');
assert.equal(destroyMapping(pseudonymized.mapping), true);
assert.equal(Object.keys(pseudonymized.mapping).length, 0, 'el mapping debe poder destruirse');

const rawAgent = validateAssistedRedactor({ rawText: 'Ana Pérez', transformedText: 'Ana Pérez', explicitConsent: true, local: true });
assert.equal(rawAgent.allowed, false);
assert.equal(rawAgent.code, 'RAW_AGENT_PAYLOAD_BLOCKED');
const missingConsent = validateAssistedRedactor({ transformedText: '[REDACTED_NAME]', explicitConsent: false, local: true });
assert.equal(missingConsent.allowed, false);
const allowedAgent = validateAssistedRedactor({ transformedText: '[REDACTED_NAME]', explicitConsent: true, local: true });
assert.equal(allowedAgent.allowed, true);

const externalBlocked = clone(example);
externalBlocked.source_policy = 'external_blocked';
externalBlocked.sources.push({ id: 'src-ext', kind: 'external', label: 'Fuente externa no permitida' });
const blockedSource = validateCase(externalBlocked);
assert.equal(blockedSource.valid, false);
assert.equal(blockedSource.errors.some((entry) => entry.code === 'EXTERNAL_SOURCE_BLOCKED'), true);
const externalNoConsent = clone(example);
externalNoConsent.source_policy = 'documents_plus_external';
externalNoConsent.session_config.source_policy = 'documents_plus_external';
externalNoConsent.sources.push({ id: 'src-ext-2', kind: 'external', label: 'Fuente externa sintética', url: 'https://example.org/recurso', date: '2026-09-13', title: 'Recurso sintético', fragment: 'Fragmento de prueba', sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
const noConsent = validateCase(externalNoConsent);
assert.equal(noConsent.valid, false);
assert.equal(noConsent.errors.some((entry) => entry.code === 'EXTERNAL_CONSENT_REQUIRED'), true);
externalNoConsent.session_config.external_consent = true;
assert.equal(validateCase(externalNoConsent).valid, true);
assert.equal(receiptCompatibility({ source_policy: 'documents_only' }, { sourcePolicy: 'documents_plus_external' }).compatible, false);
const changedPolicyReceipt = transformData(example, { mode: 'redact', sourcePolicy: 'documents_plus_external', previousReceipt: { source_policy: 'documents_only' } }).receipt;
assert.equal(changedPolicyReceipt.previous_receipt.code, 'SOURCE_POLICY_CHANGED');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hexaflex-tests-'));
fs.writeFileSync(path.join(temp, 'case.json'), JSON.stringify(example));
console.log(JSON.stringify({ ok: true, tests: 40, temp }, null, 2));
