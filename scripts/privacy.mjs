#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const STRUCTURAL_KEYS = new Set(['schema_version', 'id', 'case_ref', 'sha256', 'input_sha256', 'payload_sha256', 'kind', 'provenance', 'epistemic_status', 'status', 'audience', 'locale', 'source_policy', 'privacy_mode', 'consent_status', 'extractor', 'legibility', 'file_id', 'source_id', 'page', 'section', 'version', 'sequence']);
const TEXT_KEYS = new Set(['text', 'label', 'title', 'purpose', 'agenda', 'open_questions', 'protocol_note', 'change', 'evidence', 'consent_check', 'adaptation_criterion', 'between_session_practice', 'follow_up', 'alternative', 'conditions', 'clinical_goal', 'professional_role', 'intervention_model', 'display_name']);
const PATTERNS = {
  email: /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,
  phone: /\+?\d[\d ()-]{8,}\d/g,
  date: /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/g,
  identifier: /\b\d{7,}\b/g,
  address: /\b(?:calle|carrera|avenida|av\.?|direcci[oó]n|address)\s*[:#-]?\s*\d[\wÁÉÍÓÚáéíóúÑñ .#\/-]{2,}/giu
};

function isDateLike(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function regexFindings(text, options = {}) {
  const findings = [];
  for (const [kind, pattern] of Object.entries(PATTERNS)) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const value = match[0];
      if (kind === 'phone' && (isDateLike(value) || (/^\d+$/.test(value) && value.length >= 32))) continue;
      if (kind === 'identifier' && (isDateLike(value) || /^\d{4}$/.test(value) || (/^\d+$/.test(value) && value.length >= 32))) continue;
      findings.push({ kind, value, start: match.index, end: match.index + value.length });
    }
  }
  for (const name of options.names ?? []) {
    if (typeof name !== 'string' || name.trim().length < 2) continue;
    const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\b`, 'giu');
    for (const match of text.matchAll(pattern)) findings.push({ kind: 'configured_name', value: match[0], start: match.index, end: match.index + match[0].length });
  }
  return findings.sort((a, b) => a.start - b.start || b.end - a.end).filter((finding, index, all) => index === 0 || finding.start >= all[index - 1].end);
}

export function findIdentifiers(text, options = {}) { return regexFindings(String(text ?? ''), options); }

function replacementFor(finding, state) {
  if (state.mode === 'pseudonymize') {
    const key = `${finding.kind}:${finding.value.toLocaleLowerCase()}`;
    if (!state.mapping[key]) {
      const prefix = finding.kind === 'configured_name' ? 'PERSONA' : finding.kind.toUpperCase();
      state.mapping[key] = `[${prefix}_${String(Object.keys(state.mapping).length + 1).padStart(3, '0')}]`;
    }
    return state.mapping[key];
  }
  return `[REDACTED_${finding.kind.toUpperCase()}]`;
}

export function transformText(text, options = {}, state = { mode: options.mode ?? 'redact', mapping: {}, counts: {} }) {
  const value = String(text ?? '');
  const findings = findIdentifiers(value, options);
  let output = '';
  let cursor = 0;
  for (const finding of findings) {
    output += value.slice(cursor, finding.start);
    output += replacementFor(finding, state);
    state.counts[finding.kind] = (state.counts[finding.kind] ?? 0) + 1;
    cursor = finding.end;
  }
  output += value.slice(cursor);
  return { text: output, findings };
}

function transformValue(value, key, options, state, subject) {
  if (typeof value === 'string') {
    if (key === 'path') return '[LOCAL_PATH_OMITTED]';
    if (!TEXT_KEYS.has(key) && STRUCTURAL_KEYS.has(key)) return value;
    const transformed = transformText(value, options, state);
    if (transformed.findings.length) state.changes.push({ subject, kinds: [...new Set(transformed.findings.map((finding) => finding.kind))], original_length: value.length, transformed_length: transformed.text.length });
    return transformed.text;
  }
  if (Array.isArray(value)) return value.map((item, index) => transformValue(item, key, options, state, `${subject}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, transformValue(childValue, childKey, options, state, `${subject}.${childKey}`)]));
  }
  return value;
}

export function transformData(data, options = {}) {
  const mode = options.mode ?? 'redact';
  if (!['redact', 'pseudonymize', 'manual_review'].includes(mode)) throw new Error(`Modo de privacidad no permitido: ${mode}`);
  if (mode === 'manual_review' && options.confirmed !== true) return { status: 'review_required', payload: null, mapping: {}, preview: null, receipt: { mode, status: 'review_required', rules: [], counts: {}, raw_content_included: false, warnings: ['Se requiere revisión manual antes de transformar.'] } };
  const state = { mode: mode === 'manual_review' ? 'redact' : mode, mapping: {}, counts: {}, changes: [] };
  const payload = transformValue(data, '', options, state, '$');
  const inputText = JSON.stringify(data);
  const payloadText = JSON.stringify(payload);
  const residual = findIdentifiers(payloadText, options);
  const status = residual.length ? 'blocked' : 'ready';
  const warnings = residual.length ? ['Quedaron identificadores después de la transformación; se bloquea el payload.'] : [];
  const receipt = {
    mode,
    status,
    input_sha256: sha256(inputText),
    payload_sha256: sha256(payloadText),
    rules: ['email', 'phone', 'date', 'identifier', 'address', ...(options.names?.length ? ['configured_name'] : [])],
    counts: state.counts,
    audience: options.audience ?? data.meta?.audience ?? 'unknown',
    source_policy: options.sourcePolicy ?? data.source_policy ?? data.session_config?.source_policy ?? 'unknown',
    warnings,
    raw_content_included: false,
    mapping_storage: mode === 'pseudonymize' ? (options.mappingStorage ?? 'ephemeral') : 'none'
  };
  const previousReceipt = receiptCompatibility(options.previousReceipt, { sourcePolicy: receipt.source_policy });
  if (!previousReceipt.compatible) { receipt.previous_receipt = previousReceipt; receipt.warnings.push(previousReceipt.reason); }
  return { status, payload: status === 'ready' ? payload : null, mapping: state.mapping, preview: { changes: state.changes, counts: state.counts, residual: residual.map(({ kind }) => kind) }, receipt };
}

export function destroyMapping(mapping) {
  for (const key of Object.keys(mapping ?? {})) delete mapping[key];
  return true;
}

export function receiptCompatibility(previousReceipt, options = {}) {
  if (!previousReceipt) return { compatible: true };
  const sourcePolicy = options.sourcePolicy ?? 'unknown';
  if ((previousReceipt.source_policy ?? 'unknown') !== sourcePolicy) return { compatible: false, code: 'SOURCE_POLICY_CHANGED', reason: 'El alcance de fuentes cambió; el recibo anterior no cubre esta sesión.' };
  return { compatible: true };
}

export function validateAssistedRedactor({ rawText, transformedText, explicitConsent = false, local = false } = {}) {
  if (rawText && rawText === transformedText) return { allowed: false, code: 'RAW_AGENT_PAYLOAD_BLOCKED', message: 'No se permite enviar texto crudo a un agente redactor.' };
  if (!explicitConsent) return { allowed: false, code: 'REDACTOR_CONSENT_REQUIRED', message: 'El redactor asistido requiere consentimiento explícito.' };
  if (!local) return { allowed: false, code: 'REDACTOR_LOCAL_REQUIRED', message: 'El redactor asistido debe ejecutarse localmente o sobre datos ya minimizados.' };
  const residual = findIdentifiers(transformedText ?? '');
  if (residual.length) return { allowed: false, code: 'REDACTOR_INPUT_NOT_MINIMIZED', message: 'El texto todavía contiene identificadores.' };
  return { allowed: true };
}

export function prepareModelPayload(data, options = {}) {
  const result = transformData(data, options);
  if (result.status !== 'ready') {
    const error = new Error(result.receipt.warnings.join(' ') || 'Payload bloqueado por privacidad.');
    error.code = 'PRIVACY_PAYLOAD_BLOCKED'; error.receipt = result.receipt;
    throw error;
  }
  return result;
}

const [, , input, output, ...args] = process.argv;
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  if (!input || !output) { console.error('Uso: node scripts/privacy.mjs <input.json> <output.json> [--mode redact|pseudonymize] [--name Nombre]'); process.exitCode = 2; }
  else {
    const data = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
    const names = []; for (let index = 0; index < args.length; index += 1) if (args[index] === '--name' && args[index + 1]) names.push(args[++index]);
    try {
      const result = prepareModelPayload(data, { mode: args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'redact', names });
      fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
      fs.writeFileSync(path.resolve(output), JSON.stringify(result.payload, null, 2));
      fs.writeFileSync(`${path.resolve(output)}.privacy.json`, JSON.stringify(result.receipt, null, 2));
      console.log(JSON.stringify({ status: result.status, receipt: result.receipt, preview: result.preview }, null, 2));
    } catch (error) { console.error(JSON.stringify({ status: 'blocked', code: error.code, message: error.message, receipt: error.receipt }, null, 2)); process.exitCode = 1; }
  }
}
