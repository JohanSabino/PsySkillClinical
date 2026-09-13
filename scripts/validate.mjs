#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const PROCESSES = new Set(['acceptance', 'defusion', 'present_moment', 'self_as_context', 'values', 'committed_action']);
const STATUSES = new Set(['fact', 'hypothesis', 'shared_decision', 'unknown']);
const PROVENANCE = new Set(['patient_report', 'clinician_observation', 'measure', 'document', 'inference', 'external']);
const RELATION_KINDS = new Set(['observation', 'hypothesis', 'objective', 'barrier', 'resource', 'intervention', 'agreed_action']);
const SOURCE_POLICIES = new Set(['documents_only', 'documents_plus_external', 'external_blocked', 'unknown']);
const PRIVACY_MODES = new Set(['redact', 'pseudonymize', 'manual_review', 'unknown']);
const DOCUMENT_KINDS = new Set(['pdf', 'docx', 'markdown', 'text', 'json', 'unknown']);
const LEGIBILITY = new Set(['full', 'partial', 'unsupported', 'unreadable']);
const RISK_PATTERNS = [
  /\b(?:suicid(?:io|a|al)|autolesi(?:ón|on)|matarme|hacer(?:me|se)?\s+daño)\b/i,
  /\b(?:plan\s+(?:para|de)\s+(?:suicid|matar|hacer)|violencia\s+inminente|agresi[oó]n\s+inminente|abuso\s+en\s+curso)\b/i
];
const NEGATION = /\b(?:no|niega|sin|nunca)\b/i;
const HISTORICAL = /\b(?:historial|antecedente|antes|pasado|hace\s+(?:año|mes|tiempo))\b/i;
const CURRENT = /\b(?:ahora|hoy|inminente|intenci[oó]n|plan|medios|esta\s+noche)\b/i;
const DIRECT_IDENTIFIER = /(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b\d{7,}\b|\+?\d[\d ()-]{8,}\d)/;
const UNSAFE_CLAIMS = /\b(?:diagn[oó]stico\s+definitivo|recetar|prescribir\s+medicaci[oó]n|garantiza(?:r)?\s+resultados?)\b/i;

function usage() {
  console.error('Uso: node scripts/validate.mjs <case.json> [--audience clinical|patient|shareable] [--confirm-share] [--preview]');
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { return { __parseError: error.message }; }
}

function issue(code, subject, message, severity = 'error') {
  return { code, subject, message, severity };
}

function strings(value, out = [], subject = '$') {
  if (typeof value === 'string') out.push({ text: value, subject });
  else if (Array.isArray(value)) value.forEach((item, index) => strings(item, out, `${subject}[${index}]`));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => strings(item, out, `${subject}.${key}`));
  return out;
}

function itemCheck(item, subject, errors) {
  if (!item || typeof item !== 'object') { errors.push(issue('ITEM_NOT_OBJECT', subject, 'Cada elemento clínico debe ser un objeto.')); return; }
  for (const key of ['id', 'text', 'provenance', 'epistemic_status']) if (!item[key] || typeof item[key] !== 'string') errors.push(issue('ITEM_REQUIRED', `${subject}.${key}`, 'Falta un campo requerido.'));
  if (item.provenance && !PROVENANCE.has(item.provenance)) errors.push(issue('INVALID_PROVENANCE', `${subject}.provenance`, 'Procedencia no permitida.'));
  if (item.epistemic_status && !STATUSES.has(item.epistemic_status)) errors.push(issue('INVALID_EPISTEMIC_STATUS', `${subject}.epistemic_status`, 'Estatus epistémico no permitido.'));
}

function validateSessionConfig(config, errors) {
  if (config === undefined) return;
  if (!config || typeof config !== 'object' || Array.isArray(config)) { errors.push(issue('SESSION_CONFIG_OBJECT', '$.session_config', 'session_config debe ser un objeto.')); return; }
  for (const key of ['version', 'intervention_model', 'professional_role', 'clinical_goal', 'audience', 'source_policy', 'privacy_mode', 'consent_status']) if (!config[key] || typeof config[key] !== 'string') errors.push(issue('SESSION_CONFIG_REQUIRED', `$.session_config.${key}`, 'Falta una decisión de onboarding.'));
  if (config.version && config.version !== '1.0') errors.push(issue('SESSION_CONFIG_VERSION', '$.session_config.version', 'Se requiere versión 1.0.'));
  if (config.audience && !['clinical', 'patient', 'shareable', 'unknown'].includes(config.audience)) errors.push(issue('SESSION_CONFIG_AUDIENCE', '$.session_config.audience', 'Audiencia de sesión no permitida.'));
  if (config.source_policy && !SOURCE_POLICIES.has(config.source_policy)) errors.push(issue('SESSION_CONFIG_SOURCE_POLICY', '$.session_config.source_policy', 'Política de fuentes no permitida.'));
  if (config.privacy_mode && !PRIVACY_MODES.has(config.privacy_mode)) errors.push(issue('SESSION_CONFIG_PRIVACY_MODE', '$.session_config.privacy_mode', 'Modo de privacidad no permitido.'));
  if (config.consent_status && !['pending', 'confirmed', 'declined', 'unknown'].includes(config.consent_status)) errors.push(issue('SESSION_CONFIG_CONSENT', '$.session_config.consent_status', 'Estado de consentimiento no permitido.'));
  if (config.source_policy === 'documents_plus_external' && config.external_consent !== true) errors.push(issue('EXTERNAL_CONSENT_REQUIRED', '$.session_config.external_consent', 'La búsqueda externa requiere confirmación explícita.'));
  if (config.audience === 'shareable' && config.confirmed_share !== true) errors.push(issue('SHARE_CONFIRMATION_REQUIRED', '$.session_config.confirmed_share', 'La audiencia compartible requiere confirmación explícita.'));
}

function validateDocuments(documents, errors) {
  if (documents === undefined) return;
  if (!Array.isArray(documents)) { errors.push(issue('DOCUMENTS_ARRAY_REQUIRED', '$.documents', 'documents debe ser un arreglo.')); return; }
  for (const [index, document] of documents.entries()) {
    const subject = `$.documents[${index}]`;
    if (!document || typeof document !== 'object') { errors.push(issue('DOCUMENT_NOT_OBJECT', subject, 'Cada documento debe ser un objeto.')); continue; }
    for (const key of ['id', 'display_name', 'kind', 'sha256', 'selected', 'extractor', 'legibility', 'fragments']) if (document[key] === undefined) errors.push(issue('DOCUMENT_REQUIRED', `${subject}.${key}`, 'Falta un campo de documento.'));
    if (document.kind && !DOCUMENT_KINDS.has(document.kind)) errors.push(issue('DOCUMENT_KIND', `${subject}.kind`, 'Tipo de documento no permitido.'));
    if (document.legibility && !LEGIBILITY.has(document.legibility)) errors.push(issue('DOCUMENT_LEGIBILITY', `${subject}.legibility`, 'Estado de legibilidad no permitido.'));
    if (document.sha256 && !/^[a-f0-9]{64}$/.test(document.sha256)) errors.push(issue('DOCUMENT_HASH', `${subject}.sha256`, 'El hash debe ser SHA-256 hexadecimal.'));
    if (document.fragments && !Array.isArray(document.fragments)) errors.push(issue('DOCUMENT_FRAGMENTS', `${subject}.fragments`, 'fragments debe ser un arreglo.'));
    for (const [fragmentIndex, fragment] of (document.fragments ?? []).entries()) {
      const fragmentSubject = `${subject}.fragments[${fragmentIndex}]`;
      for (const key of ['id', 'text', 'source_id', 'legibility']) if (fragment?.[key] === undefined) errors.push(issue('FRAGMENT_REQUIRED', `${fragmentSubject}.${key}`, 'Falta un campo de fragmento.'));
      if (fragment?.legibility && !LEGIBILITY.has(fragment.legibility)) errors.push(issue('FRAGMENT_LEGIBILITY', `${fragmentSubject}.legibility`, 'Estado de fragmento no permitido.'));
    }
  }
}

function validatePrivacy(privacy, errors) {
  if (privacy === undefined) return;
  if (!privacy || typeof privacy !== 'object' || Array.isArray(privacy)) { errors.push(issue('PRIVACY_OBJECT', '$.privacy', 'privacy debe ser un objeto.')); return; }
  if (privacy.mode && !PRIVACY_MODES.has(privacy.mode)) errors.push(issue('PRIVACY_MODE', '$.privacy.mode', 'Modo de privacidad no permitido.'));
  if (privacy.status && !['ready', 'blocked', 'review_required'].includes(privacy.status)) errors.push(issue('PRIVACY_STATUS', '$.privacy.status', 'Estado de privacidad no permitido.'));
  if (privacy.raw_content_included === true) errors.push(issue('PRIVACY_RAW_CONTENT', '$.privacy.raw_content_included', 'El recibo nunca puede incluir contenido crudo.', 'blocking'));
  if (privacy.status === 'blocked') errors.push(issue('PRIVACY_BLOCKED', '$.privacy.status', 'El payload está bloqueado por privacidad.', 'blocking'));
}

function scanRisk(data) {
  const hits = [];
  for (const entry of strings(data)) {
    const match = RISK_PATTERNS.find((pattern) => pattern.test(entry.text));
    if (!match) continue;
    const start = Math.max(0, entry.text.search(match) - 45);
    const context = entry.text.slice(start, entry.text.search(match) + 80);
    const negated = NEGATION.test(context) && !CURRENT.test(context);
    const historical = HISTORICAL.test(context) && !CURRENT.test(context);
    hits.push({ subject: entry.subject, text: entry.text, negated, historical });
  }
  if (!hits.length) return { status: 'no_current_signal', hits: [] };
  if (hits.some((hit) => !hit.negated && !hit.historical)) return { status: 'urgent_human_review', hits };
  return { status: 'review_required', hits };
}

function patientPreview(data) {
  const formulation = data.formulation ?? {};
  const safePatterns = (formulation.patterns ?? []).filter((pattern) => pattern.private !== true).map((pattern) => ({
    id: pattern.id,
    title: pattern.title,
    processes: pattern.processes,
    value_directions: (pattern.value_directions ?? []).filter((item) => item.confirmed_by_patient === true && item.private !== true).map((item) => ({ id: item.id, text: item.text }))
  }));
  const values = (formulation.values ?? []).filter((item) => item.confirmed_by_patient === true && item.private !== true).map((item) => ({ id: item.id, text: item.text }));
  const sessions = (data.sessions ?? []).filter((session) => session.private !== true).map((session) => ({
    id: session.id,
    title: session.title,
    purpose: session.purpose,
    relevant_processes: session.relevant_processes,
    between_session_practice: session.between_session_practice ?? []
  }));
  return { title: data.meta.title, locale: data.meta.locale, audience: 'patient', patterns: safePatterns, values, sessions };
}

export function validateCase(data, options = {}) {
  const errors = [];
  const warnings = [];
  if (!data || typeof data !== 'object' || data.__parseError) {
    return { valid: false, errors: [issue('INVALID_JSON', '$', data?.__parseError ?? 'JSON inválido.')], warnings, checks: [] };
  }
  if (data.schema_version !== '1.0') errors.push(issue('SCHEMA_VERSION', '$.schema_version', 'Se requiere schema_version 1.0.'));
  if (!data.meta || typeof data.meta !== 'object') errors.push(issue('META_REQUIRED', '$.meta', 'Falta meta.'));
  else {
    for (const key of ['title', 'locale', 'audience', 'case_ref']) if (typeof data.meta[key] !== 'string' || !data.meta[key]) errors.push(issue('META_REQUIRED', `$.meta.${key}`, 'Falta un metadato requerido.'));
    if (data.meta.locale && !['es', 'en'].includes(data.meta.locale)) errors.push(issue('INVALID_LOCALE', '$.meta.locale', 'Locale permitido: es o en.'));
    if (data.meta.audience && !['clinical', 'patient', 'shareable'].includes(data.meta.audience)) errors.push(issue('INVALID_AUDIENCE', '$.meta.audience', 'Audiencia no permitida.'));
    if (data.meta.case_ref && !/^[A-Za-z0-9._-]+$/.test(data.meta.case_ref)) errors.push(issue('CASE_REF', '$.meta.case_ref', 'case_ref debe ser un identificador no directo.'));
  }
  if (!Array.isArray(data.sources)) errors.push(issue('SOURCES_REQUIRED', '$.sources', 'sources debe ser un arreglo.'));
  if (data.source_policy !== undefined && !SOURCE_POLICIES.has(data.source_policy)) errors.push(issue('SOURCE_POLICY', '$.source_policy', 'Política de fuentes no permitida.'));
  validateSessionConfig(data.session_config, errors);
  validateDocuments(data.documents, errors);
  validatePrivacy(data.privacy, errors);
  if (!data.formulation || typeof data.formulation !== 'object') errors.push(issue('FORMULATION_REQUIRED', '$.formulation', 'Falta formulation.'));
  const ids = new Set();
  const addId = (id, subject) => { if (!id) return; if (ids.has(id)) errors.push(issue('DUPLICATE_ID', subject, `ID repetido: ${id}.`)); ids.add(id); };
  for (const [index, source] of (data.sources ?? []).entries()) {
    addId(source.id, `$.sources[${index}].id`);
    if (source.kind && !new Set([...PROVENANCE]).has(source.kind)) errors.push(issue('INVALID_SOURCE_KIND', `$.sources[${index}].kind`, 'Tipo de fuente no permitido.'));
    if (source.kind === 'external' && !data.source_policy && !data.session_config?.source_policy) errors.push(issue('SOURCE_POLICY_REQUIRED', `$.sources[${index}]`, 'Una fuente externa requiere una política de fuentes explícita.'));
    if (source.kind === 'external' && ['documents_only', 'external_blocked'].includes(data.source_policy ?? data.session_config?.source_policy)) errors.push(issue('EXTERNAL_SOURCE_BLOCKED', `$.sources[${index}]`, 'La política activa bloquea fuentes externas.'));
    if (source.kind === 'external') {
      for (const key of ['url', 'date', 'title', 'fragment', 'sha256']) if (!source[key]) errors.push(issue('SOURCE_EXTERNAL_TRACEABILITY', `$.sources[${index}].${key}`, 'Una fuente externa requiere URL, fecha, título, fragmento y hash.'));
      if (source.url && !/^https?:\/\//i.test(source.url)) errors.push(issue('SOURCE_EXTERNAL_URL', `$.sources[${index}].url`, 'La URL externa debe ser HTTP(S).'));
      if (source.sha256 && !/^[a-f0-9]{64}$/.test(source.sha256)) errors.push(issue('SOURCE_EXTERNAL_HASH', `$.sources[${index}].sha256`, 'El respaldo externo debe tener hash SHA-256.'));
    }
  }
  if (data.source_policy === 'documents_plus_external' && data.session_config?.external_consent !== true) errors.push(issue('EXTERNAL_CONSENT_REQUIRED', '$.session_config.external_consent', 'La búsqueda externa requiere confirmación explícita.'));
  for (const [index, pattern] of (data.formulation?.patterns ?? []).entries()) {
    const subject = `$.formulation.patterns[${index}]`;
    addId(pattern.id, `${subject}.id`);
    if (!pattern.title) errors.push(issue('PATTERN_TITLE', `${subject}.title`, 'Cada patrón necesita título.'));
    if (!Array.isArray(pattern.processes) || pattern.processes.length === 0) errors.push(issue('PROCESSES_REQUIRED', `${subject}.processes`, 'Cada patrón debe referir al menos un proceso.'));
    for (const process of pattern.processes ?? []) if (!PROCESSES.has(process)) errors.push(issue('INVALID_PROCESS', `${subject}.processes`, `Proceso no permitido: ${process}.`));
    for (const field of ['context', 'internal_experiences', 'behaviors', 'short_term_effects', 'long_term_effects', 'value_directions']) {
      if (!Array.isArray(pattern[field])) errors.push(issue('ARRAY_REQUIRED', `${subject}.${field}`, 'Se requiere un arreglo.'));
      else pattern[field].forEach((item, itemIndex) => { addId(item.id, `${subject}.${field}[${itemIndex}].id`); itemCheck(item, `${subject}.${field}[${itemIndex}]`, errors); });
    }
    addId(pattern.function_hypothesis?.id, `${subject}.function_hypothesis.id`); itemCheck(pattern.function_hypothesis, `${subject}.function_hypothesis`, errors);
    for (const [relationIndex, relation] of (pattern.relations ?? []).entries()) {
      const relationSubject = `${subject}.relations[${relationIndex}]`;
      for (const key of ['from', 'to', 'kind', 'epistemic_status']) if (!relation?.[key]) errors.push(issue('RELATION_REQUIRED', `${relationSubject}.${key}`, 'Relación incompleta.'));
      if (relation?.kind && !RELATION_KINDS.has(relation.kind)) errors.push(issue('INVALID_RELATION_KIND', `${relationSubject}.kind`, 'Tipo de relación no permitido.'));
      if (relation?.epistemic_status && !STATUSES.has(relation.epistemic_status)) errors.push(issue('INVALID_EPISTEMIC_STATUS', `${relationSubject}.epistemic_status`, 'Estatus epistémico no permitido.'));
    }
  }
  for (const [index, value] of (data.formulation?.values ?? []).entries()) { addId(value.id, `$.formulation.values[${index}].id`); itemCheck(value, `$.formulation.values[${index}]`, errors); }
  if (!Array.isArray(data.formulation?.open_questions)) errors.push(issue('OPEN_QUESTIONS_REQUIRED', '$.formulation.open_questions', 'open_questions debe ser un arreglo.'));
  for (const [index, session] of (data.sessions ?? []).entries()) {
    const subject = `$.sessions[${index}]`;
    addId(session.id, `${subject}.id`);
    for (const key of ['title', 'purpose', 'consent_check', 'adaptation_criterion']) if (!session?.[key]) errors.push(issue('SESSION_REQUIRED', `${subject}.${key}`, 'Falta un campo mínimo de sesión.'));
    for (const key of ['relevant_processes', 'agenda', 'intervention_candidates', 'between_session_practice', 'follow_up']) if (!Array.isArray(session?.[key])) errors.push(issue('SESSION_ARRAY_REQUIRED', `${subject}.${key}`, 'Falta un arreglo de sesión.'));
    for (const process of session.relevant_processes ?? []) if (!PROCESSES.has(process)) errors.push(issue('INVALID_PROCESS', `${subject}.relevant_processes`, `Proceso no permitido: ${process}.`));
    for (const [interventionIndex, intervention] of (session.intervention_candidates ?? []).entries()) {
      const interventionSubject = `${subject}.intervention_candidates[${interventionIndex}]`;
      addId(intervention.id, `${interventionSubject}.id`);
      for (const key of ['id', 'label', 'purpose', 'status']) if (!intervention?.[key]) errors.push(issue('INTERVENTION_REQUIRED', `${interventionSubject}.${key}`, 'Intervención incompleta.'));
      if (intervention.status && !['suggested', 'shared_decision', 'declined', 'unknown'].includes(intervention.status)) errors.push(issue('INVALID_INTERVENTION_STATUS', `${interventionSubject}.status`, 'Estatus de intervención no permitido.'));
    }
  }
  let previousSequence = 0;
  for (const [index, revision] of (data.revisions ?? []).entries()) {
    const subject = `$.revisions[${index}]`;
    addId(revision.id, `${subject}.id`);
    for (const key of ['id', 'sequence', 'change', 'evidence', 'status']) if (revision?.[key] === undefined) errors.push(issue('REVISION_REQUIRED', `${subject}.${key}`, 'Revisión incompleta.'));
    if (typeof revision.sequence === 'number' && revision.sequence <= previousSequence) errors.push(issue('REVISION_ORDER', `${subject}.sequence`, 'Las revisiones deben estar en orden ascendente.'));
    previousSequence = revision.sequence ?? previousSequence;
    if (revision.status && !['confirmed', 'weakened', 'discarded', 'new'].includes(revision.status)) errors.push(issue('INVALID_REVISION_STATUS', `${subject}.status`, 'Estatus de revisión no permitido.'));
  }
  const risk = scanRisk(data);
  if (risk.status === 'urgent_human_review') errors.push(issue('URGENT_HUMAN_REVIEW', '$.safety', 'Señal plausible de riesgo inmediato: detener la planificación rutinaria y solicitar evaluación humana urgente.', 'blocking'));
  else if (risk.status === 'review_required') warnings.push(issue('RISK_CONTEXT_REVIEW', '$.safety', 'Hay lenguaje histórico o negado que requiere revisión humana; no es una garantía de seguridad.', 'warning'));
  const declaredRisk = data.safety?.risk_screen;
  if (declaredRisk === 'urgent_human_review') errors.push(issue('DECLARED_URGENT_REVIEW', '$.safety.risk_screen', 'El caso declara revisión humana urgente.', 'blocking'));
  if (declaredRisk === 'review_required') warnings.push(issue('DECLARED_REVIEW_REQUIRED', '$.safety.risk_screen', 'El caso requiere revisión humana antes de continuar.', 'warning'));
  for (const entry of strings(data)) {
    const isDate = /\b\d{4}-\d{2}-\d{2}\b/.test(entry.text);
    const structural = /(?:\.id|\.case_ref|\.sha256|_sha256|\.path|\.page|\.sequence|\.created_at)$/.test(entry.subject);
    if (DIRECT_IDENTIFIER.test(entry.text) && !isDate && !structural) errors.push(issue('PRIVACY_DIRECT_IDENTIFIER', entry.subject, 'Retira identificadores directos antes de derivar artefactos.', 'blocking'));
    if (UNSAFE_CLAIMS.test(entry.text)) errors.push(issue('UNSAFE_CLAIM', entry.subject, 'Reformula como límite o hipótesis; no uses diagnóstico, prescripción o garantía automática.', 'blocking'));
  }
  const audience = options.audience ?? data.meta?.audience ?? 'clinical';
  if (audience === 'shareable' && data.session_config?.audience === 'unknown') errors.push(issue('AUDIENCE_UNKNOWN_BLOCKED', '$.session_config.audience', 'No se puede preparar material compartible hasta decidir la audiencia.', 'blocking'));
  if (audience === 'shareable' && options.confirmShare !== true) errors.push(issue('SHARE_CONFIRMATION_REQUIRED', '$.meta.audience', 'La vista compartible requiere confirmación explícita.', 'blocking'));
  if (audience === 'patient' || audience === 'shareable') {
    const preview = patientPreview(data);
    if (!preview.values.length && !preview.patterns.length) warnings.push(issue('PATIENT_PREVIEW_SPARSE', '$.formulation', 'La vista paciente no contiene valores o patrones confirmados.', 'warning'));
    return { valid: errors.length === 0, errors, warnings, risk, audience, preview, checks: buildChecks(errors, warnings) };
  }
  return { valid: errors.length === 0, errors, warnings, risk, audience, checks: buildChecks(errors, warnings) };
}

function buildChecks(errors, warnings) {
  const blocking = errors.filter((entry) => entry.severity === 'blocking' || entry.severity === 'error');
  const schemaCodes = /^(?:SCHEMA_VERSION|META_REQUIRED|SOURCES_REQUIRED|FORMULATION_REQUIRED|ITEM_REQUIRED|ITEM_NOT_OBJECT|INVALID_(?:LOCALE|AUDIENCE|PROVENANCE|SOURCE_KIND|EPISTEMIC_STATUS|PROCESS|RELATION_KIND|INTERVENTION_STATUS|REVISION_STATUS)|ARRAY_REQUIRED|PATTERN_TITLE|PROCESSES_REQUIRED|RELATION_REQUIRED|SESSION_REQUIRED|SESSION_ARRAY_REQUIRED|INTERVENTION_REQUIRED|REVISION_REQUIRED|DUPLICATE_ID|REVISION_ORDER|SOURCE_POLICY|SOURCE_EXTERNAL_|SESSION_CONFIG_|DOCUMENT_|FRAGMENT_)/;
  return [
    { name: 'schema', passed: !errors.some((entry) => schemaCodes.test(entry.code)) },
    { name: 'provenance', passed: !errors.some((entry) => /PROVENANCE|EPISTEMIC/.test(entry.code)) },
    { name: 'safety', passed: !errors.some((entry) => /RISK|URGENT/.test(entry.code)) },
    { name: 'privacy', passed: !errors.some((entry) => /PRIVACY|UNSAFE/.test(entry.code)) },
    { name: 'audience', passed: !errors.some((entry) => /SHARE|PATIENT/.test(entry.code)) },
    { name: 'warnings', passed: warnings.length === 0 },
    { name: 'delivery', passed: blocking.length === 0 }
  ];
}

const [, , input, ...args] = process.argv;
if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}`) {
  if (!input) { usage(); process.exitCode = 2; }
  else {
    const audienceIndex = args.indexOf('--audience');
    const audience = audienceIndex >= 0 ? args[audienceIndex + 1] : undefined;
    const result = validateCase(readJson(path.resolve(input)), { audience, confirmShare: args.includes('--confirm-share') });
    if (args.includes('--preview') && result.preview) result.preview_only = result.audience === 'patient' && !args.includes('--confirm-share');
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.valid ? 0 : 1;
  }
}
