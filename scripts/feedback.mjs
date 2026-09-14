#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { findIdentifiers, prepareModelPayload } from './privacy.mjs';

const RISK = /\b(?:suicid\w*|autolesi(?:ón|on)\w*|matarme|hacer(?:me|se)?\s+daño|violencia\s+inminente|plan\s+para\s+(?:suicid\w*|matar\w*))\b/i;
const STATUSES = new Set(['draft', 'ready', 'blocked', 'review_required', 'incorporated']);
const AUDIENCES = new Set(['clinical', 'patient', 'shareable', 'unknown']);
const PROVENANCE = new Set(['patient_report', 'clinician_observation', 'shared_decision', 'unknown']);
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

function normalizeEntries(entries = []) {
  if (!Array.isArray(entries)) throw new Error('entries debe ser un arreglo.');
  return entries.map((entry, index) => ({
    id: String(entry?.id ?? `feedback-${index + 1}`),
    prompt: String(entry?.prompt ?? ''),
    response: String(entry?.response ?? ''),
    provenance: PROVENANCE.has(entry?.provenance) ? entry.provenance : 'unknown',
    epistemic_status: ['fact', 'hypothesis', 'shared_decision', 'unknown'].includes(entry?.epistemic_status) ? entry.epistemic_status : 'unknown'
  }));
}

export function prepareFeedback(data, options = {}) {
  const entries = normalizeEntries(data.entries);
  if (entries.some((entry) => !entry.id || !entry.prompt.trim())) return { status: 'blocked', payload: null, diff: [], receipt: { status: 'blocked', code: 'FEEDBACK_ENTRY_REQUIRED', raw_content_included: false, warnings: ['Cada entrada requiere id y pregunta antes de exportar.'] } };
  const rawText = entries.map((entry) => `${entry.prompt}\n${entry.response}`).join('\n');
  if (RISK.test(rawText)) {
    return { status: 'blocked', payload: null, diff: [], receipt: { status: 'blocked', code: 'URGENT_HUMAN_REVIEW', raw_content_included: false, warnings: ['El feedback contiene una señal plausible de riesgo; requiere evaluación humana urgente.'] } };
  }
  const base = {
    schema_version: '1.0',
    feedback_id: String(data.feedback_id ?? `feedback-${Date.now()}`),
    artifact_sha256: String(data.artifact_sha256 ?? options.artifactSha256 ?? ''),
    case_ref: String(data.case_ref ?? options.caseRef ?? 'unknown'),
    created_at: data.created_at ?? new Date().toISOString(),
    audience: AUDIENCES.has(data.audience) ? data.audience : (options.audience ?? 'unknown'),
    status: 'ready',
    consent_status: data.consent_status ?? (options.confirmed ? 'confirmed' : 'pending'),
    entries,
    raw_content_included: false
  };
  if (!/^[a-f0-9]{64}$/.test(base.artifact_sha256)) return { status: 'blocked', payload: null, diff: [], receipt: { status: 'blocked', code: 'FEEDBACK_ARTIFACT_REQUIRED', raw_content_included: false, warnings: ['Vincula el feedback a un hash SHA-256 de artefacto válido.'] } };
  if (!base.case_ref || base.case_ref === 'unknown' || base.audience === 'unknown') return { status: 'blocked', payload: null, diff: [], receipt: { status: 'blocked', code: 'FEEDBACK_BINDING_REQUIRED', raw_content_included: false, warnings: ['Se requieren referencia de caso y audiencia antes de exportar.'] } };
  if (base.consent_status !== 'confirmed') return { status: 'review_required', payload: null, diff: [], receipt: { status: 'review_required', code: 'FEEDBACK_CONSENT_REQUIRED', raw_content_included: false, warnings: ['Se requiere consentimiento explícito antes de exportar feedback.'] } };
  const transformed = prepareModelPayload(base, { mode: options.mode ?? 'redact', names: options.names ?? [], audience: base.audience, sourcePolicy: options.sourcePolicy });
  const payload = { ...transformed.payload, status: 'ready', raw_content_included: false, privacy_receipt_sha256: transformed.receipt.payload_sha256 };
  // Scan only feedback text: hashes and structural IDs are intentionally opaque metadata.
  const residual = findIdentifiers(JSON.stringify(payload.entries));
  const binding = { feedback_id: payload.feedback_id, case_ref: payload.case_ref, artifact_sha256: payload.artifact_sha256, created_at: payload.created_at, consent_status: payload.consent_status, provenance: [...new Set(payload.entries.map((entry) => entry.provenance))] };
  if (residual.length) return { status: 'blocked', payload: null, diff: transformed.preview?.changes ?? [], receipt: { ...transformed.receipt, ...binding, status: 'blocked', raw_content_included: false, warnings: ['Quedaron identificadores después del segundo escaneo.'] } };
  return { status: 'ready', payload, diff: transformed.preview?.changes ?? [], receipt: { ...transformed.receipt, ...binding, status: 'ready', raw_content_included: false } };
}

/** Return a new case version only after a clinician explicitly approves the diff. */
export function incorporateFeedback(caseData, feedback, options = {}) {
  if (options.approved !== true) return { status: 'review_required', code: 'CLINICIAN_APPROVAL_REQUIRED', message: 'La incorporación requiere aprobación explícita del profesional.', case: null };
  if (!feedback || feedback.status !== 'ready' || feedback.raw_content_included === true) return { status: 'blocked', code: 'FEEDBACK_NOT_READY', message: 'Solo se puede incorporar feedback minimizado y listo.', case: null };
  const next = JSON.parse(JSON.stringify(caseData));
  const sequence = Math.max(0, ...(next.revisions ?? []).map((revision) => revision.sequence ?? 0)) + 1;
  next.revisions = [...(next.revisions ?? []), { id: `${feedback.feedback_id}-revision`, sequence, change: 'Feedback revisado e incorporado', evidence: feedback.entries.map((entry) => entry.id), status: 'new' }];
  next.feedback = feedback;
  next.meta = { ...next.meta, updated_at: new Date().toISOString() };
  const artifactSha256 = hash(JSON.stringify(next));
  return { status: 'incorporated', case: next, version: sequence, output_suffix: `v${sequence}`, receipt: { status: 'incorporated', version: sequence, artifact_sha256: artifactSha256, previous_artifact_sha256: options.previousArtifactSha256 ?? null, feedback_id: feedback.feedback_id, raw_content_included: false } };
}

const [, , input, output, ...args] = process.argv;
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  if (!input || !output) { console.error('Uso: node scripts/feedback.mjs <feedback.json> <output.json> --confirmed [--mode redact|pseudonymize]'); process.exitCode = 2; }
  else {
    try {
      const data = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
      const names = []; for (let index = 0; index < args.length; index += 1) if (args[index] === '--name' && args[index + 1]) names.push(args[++index]);
      const result = prepareFeedback(data, { confirmed: args.includes('--confirmed'), mode: args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'redact', names });
      if (result.status !== 'ready') { console.error(JSON.stringify(result, null, 2)); process.exitCode = 1; }
      else {
        const absolute = path.resolve(output); fs.mkdirSync(path.dirname(absolute), { recursive: true });
        fs.writeFileSync(absolute, JSON.stringify(result.payload, null, 2));
        fs.writeFileSync(`${absolute}.privacy.json`, JSON.stringify(result.receipt, null, 2));
        fs.writeFileSync(`${absolute}.diff.json`, JSON.stringify(result.diff, null, 2));
        console.log(JSON.stringify({ status: result.status, output: absolute, receipt: result.receipt, diff: result.diff }, null, 2));
      }
    } catch (error) { console.error(JSON.stringify({ status: 'blocked', code: error.code ?? 'FEEDBACK_ERROR', message: error.message }, null, 2)); process.exitCode = 1; }
  }
}
