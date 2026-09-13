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

function esc(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
function list(items, className = '') { return items?.length ? `<ul class="${className}">${items.map((item) => `<li>${esc(typeof item === 'string' ? item : item.text)}</li>`).join('')}</ul>` : '<p class="meta">Sin información confirmada.</p>'; }
function tags(processes = []) { return processes.map((process) => `<span class="tag">${esc(processLabels[process] ?? process)}</span>`).join(''); }

function hexaflexSection(data, patient) {
  const patterns = patient ? (data.preview?.patterns ?? []) : (data.formulation.patterns ?? []);
  const processSet = [...new Set(patterns.flatMap((pattern) => pattern.processes ?? []))];
  const all = patient ? processSet : Object.keys(processLabels);
  const processCards = all.map((process) => `<article class="card"><h3>${esc(processLabels[process])}</h3><p>${patient ? 'Una perspectiva para explorar con curiosidad y flexibilidad.' : 'Lente interrelacionada; no es una puntuación ni una etapa obligatoria.'}</p></article>`).join('');
  const patternCards = patterns.map((pattern) => `<article class="card"><h3>${esc(pattern.title)}</h3><p>${tags(pattern.processes)}</p>${patient ? list(pattern.value_directions?.map((item) => item.text)) : `<details><summary>Ver elementos de formulación</summary><p><strong>Contexto:</strong></p>${list(pattern.context)}<p><strong>Conductas:</strong></p>${list(pattern.behaviors)}<p><strong>Hipótesis funcional:</strong> <span class="tag hyp">revisable</span> ${esc(pattern.function_hypothesis?.text)}</p><p><strong>Efectos a corto plazo:</strong></p>${list(pattern.short_term_effects)}<p><strong>Efectos a largo plazo:</strong></p>${list(pattern.long_term_effects)}</details>`}</article>`).join('');
  return `<section aria-labelledby="hexaflex-title"><h2 id="hexaflex-title">Mapa Hexaflex</h2><p class="meta">Los procesos son lentes que pueden aparecer juntos; no representan diagnóstico.</p><div class="grid">${processCards}</div><h3>Patrones y direcciones</h3><div class="grid">${patternCards || '<p class="meta">Sin patrones confirmados.</p>'}</div></section>`;
}

function functionalSection(data, patient) {
  const patterns = patient ? (data.preview?.patterns ?? []) : (data.formulation.patterns ?? []);
  const cards = patterns.map((pattern) => {
    if (patient) return `<article class="card"><h3>${esc(pattern.title)}</h3><p>Podemos observar este patrón con curiosidad y elegir qué explorar.</p>${list(pattern.value_directions?.map((item) => `Dirección valiosa: ${item.text}`))}</article>`;
    return `<article class="card"><h3>${esc(pattern.title)}</h3><div class="cycle"><div class="step"><strong>Contexto</strong>${list(pattern.context)}</div><div class="step"><strong>Experiencia / conducta</strong>${list([...(pattern.internal_experiences ?? []), ...(pattern.behaviors ?? [])])}</div><div class="step"><strong>Efectos</strong><p><span class="tag">corto plazo</span></p>${list(pattern.short_term_effects)}<p><span class="tag hyp">largo plazo · hipótesis</span></p>${list(pattern.long_term_effects)}</div><div class="step"><strong>Dirección valiosa</strong>${list(pattern.value_directions)}</div></div><p><span class="tag hyp">hipótesis funcional revisable</span> ${esc(pattern.function_hypothesis?.text)}</p></article>`;
  }).join('');
  return `<section aria-labelledby="cycle-title"><h2 id="cycle-title">Ciclo funcional</h2><p class="meta">Las conexiones inferidas se muestran como hipótesis revisables, no como causalidad comprobada.</p><div class="grid">${cards || '<p class="meta">Sin patrones disponibles.</p>'}</div></section>`;
}

function valuesSection(data, patient) {
  const values = patient ? (data.preview?.values ?? []) : (data.formulation.values ?? []);
  const sessions = patient ? (data.preview?.sessions ?? []) : (data.sessions ?? []);
  return `<section aria-labelledby="values-title"><h2 id="values-title">Brújula valores–acciones</h2><div class="grid"><article class="card"><h3>Direcciones elegidas</h3>${list(values)}</article><article class="card"><h3>Preguntas para conversar</h3>${patient ? '<p>¿Qué paso pequeño tendría sentido para ti?</p>' : list(data.formulation.open_questions)}</article></div><h3>Hoja de ruta de sesiones</h3><div class="grid">${sessions.map((session) => `<article class="card"><h3>${esc(session.title)}</h3><p>${esc(session.purpose)}</p><p>${tags(session.relevant_processes)}</p><details><summary>Práctica y seguimiento</summary>${list(session.between_session_practice)}${patient ? '' : `<p><strong>Seguimiento:</strong></p>${list(session.follow_up)}<p><strong>Adaptación:</strong> ${esc(session.adaptation_criterion)}</p>`}</details></article>`).join('') || '<p class="meta">Sin sesiones propuestas.</p>'}</div></section>`;
}

function roadmapSection(data, patient) {
  const sessions = patient ? (data.preview?.sessions ?? []) : (data.sessions ?? []);
  return `<section aria-labelledby="roadmap-title"><h2 id="roadmap-title">Sesiones</h2><div class="grid">${sessions.map((session, index) => `<article class="card"><p class="meta">Sesión ${index + 1}</p><h3>${esc(session.title)}</h3><p>${esc(session.purpose)}</p><p>${tags(session.relevant_processes)}</p><p><strong>Agenda:</strong></p>${patient ? '<p>Se acuerda conjuntamente en sesión.</p>' : list(session.agenda)}<p><strong>Consentimiento:</strong> ${patient ? 'Puedes preguntar, pausar o cambiar el ejercicio.' : esc(session.consent_check)}</p>${patient ? '' : `<p><strong>Criterio de adaptación:</strong> ${esc(session.adaptation_criterion)}</p>`}</article>`).join('') || '<p class="meta">Sin sesiones propuestas.</p>'}</div></section>`;
}

function renderBody(data, view, audience, result) {
  const patient = audience === 'patient' || audience === 'shareable';
  const sections = [];
  if (view === 'all' || view === 'hexaflex') sections.push(hexaflexSection(data, patient));
  if (view === 'all' || view === 'functional_cycle') sections.push(functionalSection(data, patient));
  if (view === 'all' || view === 'values_actions') sections.push(valuesSection(data, patient));
  if (view === 'all' || view === 'session_roadmap') sections.push(roadmapSection(data, patient));
  return `${patient && audience === 'patient' ? '<p class="notice" role="status">Previsualización psicoeducativa: aún no está marcada como material compartible.</p>' : ''}${sections.join('')}`;
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
  const receipt = { valid: true, schema_version: data.schema_version, case_ref: data.meta.case_ref, audience, map_view: options.view ?? 'all', checks: validation.checks, warnings: validation.warnings, case_sha256: caseHash };
  const body = renderBody({ ...data, preview: validation.preview }, options.view ?? 'all', audience, validation);
  const html = template.replaceAll('{{LANG}}', esc(data.meta.locale ?? 'es')).replaceAll('{{TITLE}}', esc(data.meta.title)).replaceAll('{{AUDIENCE_LABEL}}', audience === 'clinical' ? 'Vista clínica' : audience === 'shareable' ? 'Material compartible' : 'Vista paciente').replaceAll('{{SUBTITLE}}', audience === 'clinical' ? 'Borrador para revisión profesional' : 'Exploración colaborativa en lenguaje sencillo').replaceAll('{{BODY}}', body).replaceAll('{{CASE_REF}}', esc(data.meta.case_ref)).replaceAll('{{SCHEMA_VERSION}}', esc(data.schema_version)).replaceAll('{{CASE_HASH}}', caseHash).replace('{{RECEIPT}}', JSON.stringify(receipt).replaceAll('<', '\\u003c'));
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
      const receipt = { ...result.receipt, output: outputPath, artifact_sha256: artifactHash, bytes: fs.statSync(outputPath).size };
      fs.writeFileSync(`${outputPath}.receipt.json`, JSON.stringify(receipt, null, 2));
      console.log(JSON.stringify(receipt, null, 2));
    }
  }
}
