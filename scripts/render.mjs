#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateCase } from './validate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const processLabels = {
  acceptance: 'Aceptación',
  defusion: 'Defusión',
  present_moment: 'Momento presente',
  self_as_context: 'Yo-como-contexto',
  values: 'Valores',
  committed_action: 'Acción comprometida'
};
const kindLabels = { observation: 'observación', hypothesis: 'hipótesis', objective: 'objetivo', barrier: 'barrera', resource: 'recurso', intervention: 'intervención', agreed_action: 'acción acordada' };
const isActModel = (data) => /\b(?:ACT|Hexaflex)\b/i.test(data.session_config?.intervention_model ?? data.intervention_model ?? '');

function esc(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
function list(items, className = '') { return items?.length ? `<ul class="${className}">${items.map((item) => `<li>${esc(typeof item === 'string' ? item : item.text)}</li>`).join('')}</ul>` : '<p class="meta">Sin información confirmada.</p>'; }
function tags(processes = []) { return processes.map((process) => `<span class="tag">${esc(processLabels[process] ?? process)}</span>`).join(''); }
function evidenceStatus(pattern) {
  const statuses = [...['context', 'internal_experiences', 'behaviors', 'short_term_effects', 'long_term_effects', 'value_directions'].flatMap((field) => (pattern[field] ?? []).map((item) => item.epistemic_status)), pattern.function_hypothesis?.epistemic_status].filter(Boolean);
  if (statuses.includes('unknown')) return 'unknown';
  if (statuses.includes('hypothesis')) return 'hypothesis';
  if (statuses.includes('shared_decision')) return 'shared_decision';
  return 'fact';
}
function filterAttrs({ id = '', processes = [], audience = 'clinical', evidence = 'fact' } = {}) { return `class="card filterable" data-pattern-id="${esc(id)}" data-processes="${esc(processes.join(','))}" data-audience="${esc(audience)}" data-evidence="${esc(evidence)}"`; }
function summarySection(data, patient, audience) {
  const patterns = patient ? (data.preview?.patterns ?? []) : (data.formulation?.patterns ?? []);
  const sessions = patient ? (data.preview?.sessions ?? []) : (data.sessions ?? []);
  const values = patient ? (data.preview?.values ?? []) : (data.formulation?.values ?? []);
  const policy = data.source_policy ?? data.session_config?.source_policy ?? 'unknown';
  const privacy = data.privacy?.mode ?? data.session_config?.privacy_mode ?? 'unknown';
  return `<section class="summary-panel" aria-labelledby="summary-title"><div><p class="eyebrow">Resumen rápido</p><h2 id="summary-title">Orientación de esta sesión</h2><p class="meta">${esc(data.session_config?.clinical_goal ?? 'Exploración colaborativa del caso')}</p></div><dl class="summary-stats"><div><dt>Patrones</dt><dd>${patterns.length}</dd></div><div><dt>Valores</dt><dd>${values.length}</dd></div><div><dt>Sesiones</dt><dd>${sessions.length}</dd></div><div><dt>Fuentes</dt><dd>${(data.sources ?? []).length + (data.documents ?? []).length}</dd></div></dl><div class="summary-chips"><span class="tag">Audiencia: ${esc(audience)}</span><span class="tag">Fuentes: ${esc(policy)}</span><span class="tag">Privacidad: ${esc(privacy)}</span></div><div class="filters" aria-label="Filtros de presentación"><label>Buscar <input id="map-search" type="search" placeholder="Palabra o tema" autocomplete="off"></label><label>Proceso <select id="process-filter"><option value="all">Todos</option>${Object.entries(processLabels).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label><label>Evidencia <select id="evidence-filter"><option value="all">Todos</option><option value="fact">Hecho/reporte</option><option value="hypothesis">Hipótesis</option><option value="shared_decision">Decisión compartida</option><option value="unknown">Desconocido</option></select></label><label>Audiencia <select id="audience-filter"><option value="all">Todas</option><option value="clinical">Clínica</option><option value="patient">Paciente</option><option value="shareable">Compartible</option></select></label><button type="button" id="reset-filters">Restablecer</button><span id="filter-summary" class="meta" role="status" aria-live="polite"></span></div><noscript><p class="meta">Los filtros son opcionales; todo el contenido sigue disponible con JavaScript desactivado.</p></noscript></section>`;
}

function radialSvg() {
  const positions = [[220,30],[350,105],[350,255],[220,330],[90,255],[90,105]];
  const center = [220,180];
  const lines = Object.keys(processLabels).map((process, index) => `<line x1="${center[0]}" y1="${center[1]}" x2="${positions[index][0]}" y2="${positions[index][1]}" stroke="var(--line)" stroke-width="2" aria-hidden="true"></line>`).join('');
  const nodes = Object.keys(processLabels).map((process, index) => `<g><circle class="radial-node" tabindex="0" role="button" cx="${positions[index][0]}" cy="${positions[index][1]}" r="42" aria-label="${esc(processLabels[process])}" aria-controls="process-${process}"></circle><text class="radial-node-label" x="${positions[index][0]}" y="${positions[index][1] + 4}" text-anchor="middle">${esc(processLabels[process])}</text></g>`).join('');
  return `<div class="radial" aria-label="Diagrama radial Hexaflex"><svg viewBox="0 0 440 360" role="img" aria-labelledby="radial-title radial-desc"><title id="radial-title">Procesos Hexaflex</title><desc id="radial-desc">Seis procesos interrelacionados. Selecciona un nodo para abrir su tarjeta.</desc>${lines}<circle cx="${center[0]}" cy="${center[1]}" r="54" fill="var(--accent)" opacity=".9"></circle><text x="${center[0]}" y="${center[1] + 5}" text-anchor="middle" fill="var(--card)" font-weight="700">ACT / Hexaflex</text>${nodes}</svg><p class="meta">Selecciona un nodo para ir a su explicación. El diagrama es un mapa, no una puntuación.</p></div>`;
}

function hexaflexSection(data, patient, audience = patient ? 'patient' : 'clinical') {
  const act = isActModel(data);
  const patterns = patient ? (data.preview?.patterns ?? []) : (data.formulation.patterns ?? []);
  const processSet = [...new Set(patterns.flatMap((pattern) => pattern.processes ?? []))];
  const all = act ? (patient ? processSet : Object.keys(processLabels)) : processSet;
  const processCards = all.map((process) => `<article id="process-${esc(process)}" tabindex="0" ${filterAttrs({ id: `process-${process}`, processes: [process], audience, evidence: 'fact' })}><h3>${esc(processLabels[process] ?? process)}</h3><p>${patient ? 'Una perspectiva para explorar con curiosidad y flexibilidad.' : act ? 'Lente interrelacionada; no es una puntuación ni una etapa obligatoria.' : 'Constructo del modelo elegido; confirma su significado y utilidad en sesión.'}</p></article>`).join('');
  const patternCards = patterns.map((pattern) => `<article ${filterAttrs({ id: pattern.id, processes: pattern.processes, audience, evidence: evidenceStatus(pattern) })}><h3>${esc(pattern.title)}</h3><p>${tags(pattern.processes)}</p>${patient ? list(pattern.value_directions?.map((item) => item.text)) : `<details id="details-${esc(pattern.id)}"><summary>Ver elementos de formulación</summary><p><strong>Contexto:</strong></p>${list(pattern.context)}<p><strong>Experiencias y conductas:</strong></p>${list([...(pattern.internal_experiences ?? []), ...(pattern.behaviors ?? [])])}<p><strong>Hipótesis funcional:</strong> <span class="tag hyp">revisable</span> ${esc(pattern.function_hypothesis?.text)}</p><p><strong>Efectos a corto plazo:</strong></p>${list(pattern.short_term_effects)}<p><strong>Efectos a largo plazo:</strong></p>${list(pattern.long_term_effects)}</details>`}</article>`).join('');
  return `<section aria-labelledby="hexaflex-title"><h2 id="hexaflex-title">${act ? 'Mapa Hexaflex · ACT' : 'Mapa del modelo elegido'}</h2><p class="meta">${act ? 'Los procesos son lentes que pueden aparecer juntos; no representan diagnóstico.' : `Modelo seleccionado: ${esc(data.session_config?.intervention_model ?? 'no especificado')}. No se activan supuestos Hexaflex.`}</p>${act ? radialSvg() : ''}<div class="grid">${processCards || '<p class="meta">El modelo elegido aún no tiene constructos mapeados.</p>'}</div><h3>Patrones y direcciones</h3><div class="grid">${patternCards || '<p class="meta">Sin patrones confirmados.</p>'}</div></section>`;
}

function functionalSection(data, patient, audience = patient ? 'patient' : 'clinical') {
  const patterns = patient ? (data.preview?.patterns ?? []) : (data.formulation.patterns ?? []);
  const cards = patterns.map((pattern) => {
    if (patient) return `<article ${filterAttrs({ id: pattern.id, processes: pattern.processes, audience, evidence: 'shared_decision' })}><h3>${esc(pattern.title)}</h3><p>Podemos observar este patrón con curiosidad y elegir qué explorar.</p>${list(pattern.value_directions?.map((item) => `Dirección valiosa: ${item.text}`))}</article>`;
    return `<article ${filterAttrs({ id: pattern.id, processes: pattern.processes, audience, evidence: evidenceStatus(pattern) })}><h3>${esc(pattern.title)}</h3><div class="cycle"><div class="step"><strong>Contexto</strong>${list(pattern.context)}</div><div class="step"><strong>Experiencia / conducta</strong>${list([...(pattern.internal_experiences ?? []), ...(pattern.behaviors ?? [])])}</div><div class="step"><strong>Efectos</strong><p><span class="tag">corto plazo</span></p>${list(pattern.short_term_effects)}<p><span class="tag hyp">largo plazo · hipótesis</span></p>${list(pattern.long_term_effects)}</div><div class="step"><strong>Dirección valiosa</strong>${list(pattern.value_directions)}</div></div><p><span class="tag hyp">hipótesis funcional revisable</span> ${esc(pattern.function_hypothesis?.text)}</p></article>`;
  }).join('');
  return `<section aria-labelledby="cycle-title"><h2 id="cycle-title">Ciclo funcional</h2><p class="meta">Las conexiones inferidas se muestran como hipótesis revisables, no como causalidad comprobada.</p><div class="grid">${cards || '<p class="meta">Sin patrones disponibles.</p>'}</div></section>`;
}

function valuesSection(data, patient, audience = patient ? 'patient' : 'clinical') {
  const values = patient ? (data.preview?.values ?? []) : (data.formulation.values ?? []);
  const sessions = patient ? (data.preview?.sessions ?? []) : (data.sessions ?? []);
  return `<section aria-labelledby="values-title"><h2 id="values-title">Brújula valores–acciones</h2><div class="grid"><article class="card"><h3>Direcciones elegidas</h3>${list(values)}</article><article class="card"><h3>Preguntas para conversar</h3>${patient ? '<p>¿Qué paso pequeño tendría sentido para ti?</p>' : list(data.formulation.open_questions)}</article></div><h3>Hoja de ruta de sesiones</h3><div class="grid">${sessions.map((session) => `<article ${filterAttrs({ id: session.id, processes: session.relevant_processes, audience, evidence: session.epistemic_status ?? 'shared_decision' })}><h3>${esc(session.title)}</h3><p>${esc(session.purpose)}</p><p>${tags(session.relevant_processes)}</p><details><summary>Práctica y seguimiento</summary>${list(session.between_session_practice)}${patient ? '' : `<p><strong>Seguimiento:</strong></p>${list(session.follow_up)}<p><strong>Adaptación:</strong> ${esc(session.adaptation_criterion)}</p>`}</details></article>`).join('') || '<p class="meta">Sin sesiones propuestas.</p>'}</div></section>`;
}

function roadmapSection(data, patient, audience = patient ? 'patient' : 'clinical') {
  const sessions = patient ? (data.preview?.sessions ?? []) : (data.sessions ?? []);
  return `<section aria-labelledby="roadmap-title"><h2 id="roadmap-title">Sesiones</h2><div class="grid">${sessions.map((session, index) => `<article ${filterAttrs({ id: session.id, processes: session.relevant_processes, audience, evidence: session.epistemic_status ?? 'shared_decision' })}><p class="meta">Sesión ${index + 1}</p><h3>${esc(session.title)}</h3><p>${esc(session.purpose)}</p><p>${tags(session.relevant_processes)}</p><p><strong>Agenda:</strong></p>${patient ? '<p>Se acuerda conjuntamente en sesión.</p>' : list(session.agenda)}<p><strong>Consentimiento:</strong> ${patient ? 'Puedes preguntar, pausar o cambiar el ejercicio.' : esc(session.consent_check)}</p>${patient ? '' : `<p><strong>Criterio de adaptación:</strong> ${esc(session.adaptation_criterion)}</p>`}</article>`).join('') || '<p class="meta">Sin sesiones propuestas.</p>'}</div></section>`;
}

function guidedStorySection(data, patient) {
  const sessions = patient ? (data.preview?.sessions ?? []) : (data.sessions ?? []);
  const steps = [
    { title: 'Orientarnos', text: data.session_config?.clinical_goal ?? 'Acordar qué sería útil explorar hoy.' },
    { title: 'Observar el patrón', text: 'Distinguir contexto, experiencia, conducta y efectos sin convertir hipótesis en hechos.' },
    { title: 'Elegir una dirección', text: patient ? 'Conversar un paso pequeño y valioso que tenga sentido para ti.' : 'Seleccionar una opción de intervención con propósito, consentimiento y alternativa.' },
    { title: 'Revisar y adaptar', text: sessions[0]?.adaptation_criterion ?? 'Registrar qué ocurrió y ajustar el siguiente paso con la persona.' }
  ];
  return `<section class="guided-section" aria-labelledby="guided-title"><h2 id="guided-title">Recorrido guiado</h2><p class="meta">Una secuencia breve y pausible para presentar el mapa; salir no modifica el caso.</p><button type="button" id="start-guided">Iniciar recorrido</button><div id="guided-story" class="guided-story" hidden aria-live="polite"><p class="guided-counter meta"></p>${steps.map((step, index) => `<article class="guided-step" data-step="${index}" ${index ? 'hidden' : ''}><h3>${esc(step.title)}</h3><p>${esc(step.text)}</p></article>`).join('')}<div class="guided-controls"><button type="button" id="guided-prev">Anterior</button><button type="button" id="guided-next">Siguiente</button><button type="button" id="guided-pause" aria-pressed="false">Pausar</button><button type="button" id="guided-exit">Salir</button></div></div></section>`;
}

function feedbackSection(data, audience) {
  const prompts = audience === 'patient' || audience === 'shareable'
    ? [{ id: 'fits', label: '¿Qué parte encaja contigo y cuál no encaja?', provenance: 'patient_report' }, { id: 'explore', label: '¿Qué te gustaría explorar o aclarar?', provenance: 'patient_report' }, { id: 'next-step', label: '¿Qué paso pequeño se siente elegido por ti?', provenance: 'shared_decision' }]
    : [{ id: 'accuracy', label: '¿Qué es factual y qué evidencia falta?', provenance: 'clinician_observation' }, { id: 'process-fit', label: '¿Qué constructo o proceso encaja con el modelo elegido?', provenance: 'clinician_observation' }, { id: 'safety-privacy', label: '¿Qué alerta de seguridad o privacidad requiere revisión?', provenance: 'clinician_observation' }, { id: 'adaptation', label: '¿Qué adaptación conviene probar y medir?', provenance: 'shared_decision' }];
  return `<section class="feedback-panel" aria-labelledby="feedback-title"><h2 id="feedback-title">Feedback para la siguiente revisión</h2><p class="meta">Se prepara en tu dispositivo, con redacción local y sin enviar texto a la red. Revisa el archivo antes de incorporarlo.</p><form id="feedback-form"><div class="feedback-grid">${prompts.map((prompt) => `<label for="feedback-${prompt.id}">${esc(prompt.label)}<textarea id="feedback-${prompt.id}" data-feedback-id="${esc(prompt.id)}" data-provenance="${esc(prompt.provenance)}" data-prompt="${esc(prompt.label)}"></textarea></label>`).join('')}</div><label><input type="checkbox" name="feedback-consent"> Confirmo que puedo revisar y exportar este borrador local.</label><p><button type="submit">Preparar feedback local</button> <span class="feedback-status meta" role="status" aria-live="polite"></span></p></form><noscript><p class="meta">Con JavaScript desactivado puedes leer las preguntas, pero la exportación debe hacerse con el comando local de feedback.</p></noscript></section>`;
}

function renderBody(data, view, audience, result) {
  const patient = audience === 'patient' || audience === 'shareable';
  const sections = [];
  if (view === 'all' || view === 'hexaflex') sections.push(hexaflexSection(data, patient, audience));
  if (view === 'all' || view === 'functional_cycle') sections.push(functionalSection(data, patient, audience));
  if (view === 'all' || view === 'values_actions') sections.push(valuesSection(data, patient, audience));
  if (view === 'all' || view === 'session_roadmap') sections.push(roadmapSection(data, patient, audience));
  return `${patient && audience === 'patient' ? '<p class="notice" role="status">Previsualización psicoeducativa: aún no está marcada como material compartible.</p>' : ''}${summarySection(data, patient, audience)}${sections.join('')}${guidedStorySection(data, patient)}${feedbackSection(data, audience)}`;
}

function atomicWrite(output, content) {
  const absolute = path.resolve(output);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const temp = `${absolute}.candidate-${process.pid}-${Date.now()}`;
  const backup = `${absolute}.last-good.bak`;
  fs.writeFileSync(temp, content, 'utf8');
  try {
    if (fs.existsSync(backup)) fs.rmSync(backup, { force: true });
    if (fs.existsSync(absolute)) fs.renameSync(absolute, backup);
    fs.renameSync(temp, absolute);
    if (fs.existsSync(backup)) fs.rmSync(backup, { force: true });
  } catch (error) {
    if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
    if (!fs.existsSync(absolute) && fs.existsSync(backup)) fs.renameSync(backup, absolute);
    throw error;
  }
  return absolute;
}

export function renderCase(data, options = {}) {
  const audience = options.audience ?? data.meta?.audience ?? 'clinical';
  const validation = validateCase(data, { audience, confirmShare: options.confirmShare === true });
  if (!validation.valid) return { ok: false, validation };
  if (validation.risk.status !== 'no_current_signal') return { ok: false, validation: { ...validation, errors: [...validation.errors, { code: 'RISK_REVIEW_REQUIRED', subject: '$.safety', message: 'No se renderiza hasta completar revisión humana de seguridad.', severity: 'blocking' }] } };
  const template = fs.readFileSync(path.join(root, 'assets', 'viewer-template.html'), 'utf8');
  const caseText = JSON.stringify(data);
  const caseHash = crypto.createHash('sha256').update(caseText).digest('hex');
  const receipt = { valid: true, schema_version: data.schema_version, case_ref: data.meta.case_ref, audience, map_view: options.view ?? 'all', source_policy: data.source_policy ?? data.session_config?.source_policy ?? 'unknown', privacy_mode: data.privacy?.mode ?? data.session_config?.privacy_mode ?? 'unknown', checks: validation.checks, warnings: validation.warnings, case_sha256: caseHash, artifact_sha256: caseHash, artifact_binding: 'source-case' };
  const body = renderBody({ ...data, preview: validation.preview }, options.view ?? 'all', audience, validation);
  const visual = data.visual ?? {};
  const html = template.replaceAll('{{LANG}}', esc(data.meta.locale ?? 'es')).replaceAll('{{TITLE}}', esc(data.meta.title)).replaceAll('{{AUDIENCE_LABEL}}', audience === 'clinical' ? 'Vista clínica' : audience === 'shareable' ? 'Material compartible' : 'Vista paciente').replaceAll('{{SUBTITLE}}', `${audience === 'clinical' ? 'Borrador para revisión profesional' : 'Exploración colaborativa en lenguaje sencillo'} · modelo: ${esc(data.session_config?.intervention_model ?? 'no especificado')}`).replaceAll('{{BODY}}', body).replaceAll('{{CASE_REF}}', esc(data.meta.case_ref)).replaceAll('{{SCHEMA_VERSION}}', esc(data.schema_version)).replaceAll('{{CASE_HASH}}', caseHash).replaceAll('{{VISUAL_MODE}}', esc(visual.mode ?? 'system')).replaceAll('{{VISUAL_PRESET}}', esc(visual.preset ?? 'sage')).replace('{{RECEIPT}}', JSON.stringify(receipt).replaceAll('<', '\\u003c'));
  return { ok: true, html, receipt, validation };
}

const [, , input, output, ...args] = process.argv;
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  if (!input || !output) { console.error('Uso: node scripts/render.mjs <case.json> <output.html> [--view all|hexaflex|functional_cycle|values_actions|session_roadmap] [--audience clinical|patient|shareable] [--confirm-share]'); process.exitCode = 2; }
  else {
    const data = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
    const viewIndex = args.indexOf('--view');
    const audienceIndex = args.indexOf('--audience');
    const result = renderCase(data, { view: viewIndex >= 0 ? args[viewIndex + 1] : 'all', audience: audienceIndex >= 0 ? args[audienceIndex + 1] : undefined, confirmShare: args.includes('--confirm-share') });
    if (!result.ok) { console.error(JSON.stringify(result.validation, null, 2)); process.exitCode = 1; }
    else {
      const outputPath = atomicWrite(output, result.html);
      const artifactHash = crypto.createHash('sha256').update(fs.readFileSync(outputPath)).digest('hex');
      const receipt = { ...result.receipt, output: outputPath, artifact_sha256: artifactHash, source_artifact_sha256: result.receipt.artifact_sha256, bytes: fs.statSync(outputPath).size };
      fs.writeFileSync(`${outputPath}.receipt.json`, JSON.stringify(receipt, null, 2));
      console.log(JSON.stringify(receipt, null, 2));
    }
  }
}
