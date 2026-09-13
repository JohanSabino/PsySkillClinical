#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCase } from './validate.mjs';
import { renderCase } from './render.mjs';
import { extractorCapabilities, ingestDirectory } from './ingest.mjs';
import { transformData } from './privacy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = ['SKILL.md', 'agents/openai.yaml', 'schemas/case.schema.json', 'schemas/visual.schema.json', 'schemas/session.schema.json', 'schemas/document.schema.json', 'schemas/privacy.schema.json', 'assets/viewer-template.html', 'examples/synthetic-case.json', 'references/formulation.md', 'references/session-planning.md', 'references/interventions.md', 'references/safety-privacy.md', 'references/visual-language.md', 'references/document-ingestion.md', 'references/source-policy.md', 'scripts/ingest.mjs', 'scripts/privacy.mjs'];
const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
const nodeMajor = Number(process.versions.node.split('.')[0]);
const checks = [{ name: 'node_runtime', passed: nodeMajor >= 18, detail: `Node.js ${process.versions.node} (mínimo 18)` }, { name: 'package_structure', passed: missing.length === 0, detail: missing.length ? `Faltan: ${missing.join(', ')}` : 'Archivos requeridos presentes' }];
let validation;
let render;
try {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'examples/synthetic-case.json'), 'utf8'));
  validation = validateCase(data, { audience: 'clinical' });
  checks.push({ name: 'synthetic_validation', passed: validation.valid, detail: validation.valid ? 'Caso sintético válido' : validation.errors });
  render = renderCase(data, { view: 'all', audience: 'clinical' });
  checks.push({ name: 'synthetic_render', passed: render.ok === true, detail: render.ok ? 'Renderer produjo HTML' : render.validation });
  if (render.ok) checks.push({ name: 'offline_html', passed: !/\b(?:https?:)?\/\//i.test(render.html), detail: 'No contiene referencias de red' });
  const capabilities = extractorCapabilities();
  checks.push({ name: 'extractor_capabilities', passed: capabilities.text.available && capabilities.markdown.available && capabilities.json.available, detail: `PDF: ${capabilities.pdf.available ? capabilities.pdf.extractor : 'unsupported'}; DOCX: ${capabilities.docx.available ? capabilities.docx.extractor : 'unsupported'}` });
  const ingestion = ingestDirectory(path.join(root, 'examples', 'synthetic-input'), { capabilities });
  checks.push({ name: 'synthetic_ingestion', passed: ingestion.documents.length === 2 && ingestion.documents.some((document) => document.kind === 'markdown' && document.legibility === 'full'), detail: `${ingestion.documents.length} archivos seleccionables; tipos no permitidos excluidos` });
  const privacy = transformData({ note: 'Nombre Demo, correo demo@example.com y teléfono +57 300 1234567' }, { mode: 'redact', names: ['Nombre Demo'] });
  checks.push({ name: 'privacy_transform', passed: privacy.status === 'ready' && privacy.receipt.raw_content_included === false && !JSON.stringify(privacy.payload).includes('demo@example.com'), detail: 'Payload local transformado y escaneado' });
  const scriptsText = fs.readFileSync(path.join(root, 'scripts', 'ingest.mjs'), 'utf8') + fs.readFileSync(path.join(root, 'scripts', 'privacy.mjs'), 'utf8') + fs.readFileSync(path.join(root, 'scripts', 'render.mjs'), 'utf8');
  checks.push({ name: 'network_dependencies', passed: !/\b(?:fetch|axios|https?:\/\/)/i.test(scriptsText), detail: 'Scripts de ingestión, privacidad y render no usan red' });
  checks.push({ name: 'privacy_defaults', passed: data.session_config?.privacy_mode === 'redact' && privacy.receipt.raw_content_included === false, detail: 'Redacción local predeterminada y recibo sin contenido crudo' });
} catch (error) {
  checks.push({ name: 'synthetic_execution', passed: false, detail: error.message });
}
const result = { ok: checks.every((check) => check.passed), package: 'hexaflex-clinical', version: '0.1.0', root, checks };
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.ok ? 0 : 1;
