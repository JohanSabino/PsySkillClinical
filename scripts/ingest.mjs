#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_LIMITS = { maxBytes: 5 * 1024 * 1024, maxFiles: 20, maxPages: 100 };
const EXTENSIONS = new Map([
  ['.pdf', 'pdf'],
  ['.docx', 'docx'],
  ['.md', 'markdown'],
  ['.markdown', 'markdown'],
  ['.txt', 'text'],
  ['.json', 'json']
]);

function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
function idFor(file, hash) { return `doc-${sha256(`${file}:${hash}`).slice(0, 16)}`; }
function commandExists(command) {
  const probe = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(probe, [command], { stdio: 'ignore', timeout: 2500 });
  return result.status === 0;
}

export function extractorCapabilities() {
  return {
    text: { available: true, extractor: 'builtin-text' },
    markdown: { available: true, extractor: 'builtin-markdown' },
    json: { available: true, extractor: 'builtin-json' },
    pdf: commandExists('pdftotext') ? { available: true, extractor: 'pdftotext' } : { available: false, extractor: 'unsupported' },
    docx: commandExists('pandoc') ? { available: true, extractor: 'pandoc' } : { available: false, extractor: 'unsupported' }
  };
}

function safeRead(file, limits) {
  const stat = fs.statSync(file);
  if (!stat.isFile()) return { error: 'not_a_file' };
  if (stat.size > limits.maxBytes) return { error: 'too_large', bytes: stat.size };
  const buffer = fs.readFileSync(file);
  return { buffer, bytes: stat.size, sha256: sha256(buffer) };
}

function runExtractor(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 15000, maxBuffer: 10 * 1024 * 1024 });
  if (result.error || result.status !== 0) return { text: '', error: result.error?.message ?? `exit_${result.status}` };
  return { text: result.stdout ?? '' };
}

function textFragments(text, sourceId, kind) {
  const normalized = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  if (!normalized.trim()) return [];
  const pages = normalized.split('\f');
  let sequence = 0;
  return pages.flatMap((pageText, pageIndex) => pageText.split(/\n{2,}/).map((chunk) => chunk.trim()).filter(Boolean).map((chunk) => ({ id: `${sourceId}-f${++sequence}`, text: chunk, source_id: sourceId, section: kind === 'markdown' ? `bloque-${sequence}` : null, page: pages.length > 1 ? pageIndex + 1 : null, legibility: 'full' })));
}

function extract(file, kind, buffer, capabilities) {
  if (kind === 'text' || kind === 'markdown') return { extractor: `builtin-${kind}`, text: buffer.toString('utf8'), legibility: 'full', warnings: [], pageCount: null };
  if (kind === 'json') {
    try { return { extractor: 'builtin-json', text: JSON.stringify(JSON.parse(buffer.toString('utf8')), null, 2), legibility: 'full', warnings: [], pageCount: null }; }
    catch { return { extractor: 'builtin-json', text: '', legibility: 'unreadable', warnings: ['JSON no válido'], pageCount: null }; }
  }
  if (kind === 'pdf') {
    if (!capabilities.pdf.available) return { extractor: 'unsupported', text: '', legibility: 'unsupported', warnings: ['No se encontró pdftotext local; no se envió el PDF a la red.'], pageCount: null };
    const result = runExtractor('pdftotext', ['-layout', file, '-']);
    return { extractor: 'pdftotext', text: result.text, pageCount: Math.max(1, result.text.split('\f').length), legibility: result.text.trim() ? 'full' : 'partial', warnings: result.error ? [`Extracción PDF parcial: ${result.error}`] : [] };
  }
  if (kind === 'docx') {
    if (!capabilities.docx.available) return { extractor: 'unsupported', text: '', legibility: 'unsupported', warnings: ['No se encontró pandoc local; no se envió el DOCX a la red.'], pageCount: null };
    const result = runExtractor('pandoc', ['-t', 'plain', file]);
    return { extractor: 'pandoc', text: result.text, pageCount: null, legibility: result.text.trim() ? 'full' : 'partial', warnings: result.error ? [`Extracción DOCX parcial: ${result.error}`] : [] };
  }
  return { extractor: 'unsupported', text: '', legibility: 'unsupported', warnings: ['Tipo de archivo no permitido.'] };
}

export function listInputFiles(directory, limits = DEFAULT_LIMITS) {
  const root = path.resolve(directory);
  if (!fs.existsSync(root)) return { files: [], warnings: [`La carpeta no existe: ${directory}`], missing_directory: true, suggested_action: 'create_directory' };
  if (!fs.statSync(root).isDirectory()) return { files: [], warnings: [`La ruta no es una carpeta: ${directory}`], missing_directory: false, suggested_action: 'choose_directory' };
  const entries = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => !entry.name.startsWith('.')).sort((a, b) => a.name.localeCompare(b.name));
  const files = [];
  const warnings = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const absolute = path.join(root, entry.name);
    const kind = EXTENSIONS.get(path.extname(entry.name).toLowerCase());
    if (!kind) { warnings.push(`Excluido por tipo: ${entry.name}`); continue; }
    if (files.length >= limits.maxFiles) { warnings.push(`Límite de ${limits.maxFiles} archivos alcanzado.`); break; }
    files.push(absolute);
  }
  return { files, warnings };
}

/**
 * Create an inputs directory only after an explicit caller confirmation.
 * Inspection never creates folders implicitly.
 */
export function ensureInputDirectory(directory, options = {}) {
  const root = path.resolve(directory);
  if (fs.existsSync(root)) {
    return { path: root, exists: true, created: false, is_directory: fs.statSync(root).isDirectory(), requires_confirmation: false };
  }
  if (options.confirmCreate !== true) {
    return { path: root, exists: false, created: false, is_directory: false, requires_confirmation: true, suggested_action: 'create_directory' };
  }
  fs.mkdirSync(root, { recursive: true });
  return { path: root, exists: true, created: true, is_directory: true, requires_confirmation: false };
}

export function ingestFiles(selectedFiles, options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...(options.limits ?? {}) };
  const capabilities = options.capabilities ?? extractorCapabilities();
  const files = [...new Set(selectedFiles.map((file) => path.resolve(file)))];
  const documents = [];
  const warnings = [];
  if (files.length > limits.maxFiles) return { documents: [], warnings: [`Se seleccionaron ${files.length} archivos; máximo ${limits.maxFiles}.`] };
  for (const file of files) {
    const displayName = path.basename(file);
    const kind = EXTENSIONS.get(path.extname(file).toLowerCase()) ?? 'unknown';
    const read = fs.existsSync(file) ? safeRead(file, limits) : { error: 'missing' };
    const base = { id: read.sha256 ? idFor(displayName, read.sha256) : `doc-invalid-${sha256(displayName).slice(0, 12)}`, display_name: displayName, path: file, kind, sha256: read.sha256 ?? '', selected: true, extractor: 'unreadable', legibility: 'unreadable', warnings: [], page_count: null, fragments: [] };
    if (read.error) { base.warnings.push(read.error === 'too_large' ? `Archivo demasiado grande (${read.bytes} bytes).` : `No se pudo leer: ${read.error}.`); documents.push(base); continue; }
    const result = extract(file, kind, read.buffer, capabilities);
    base.extractor = result.extractor; base.legibility = result.legibility; base.page_count = result.pageCount ?? null; base.warnings = result.warnings;
    let extractedText = result.text;
    if (base.page_count && base.page_count > limits.maxPages) {
      extractedText = extractedText.split('\f').slice(0, limits.maxPages).join('\f');
      base.page_count = limits.maxPages;
      base.legibility = 'partial';
      base.warnings.push(`Límite de ${limits.maxPages} páginas alcanzado; se requiere revisión.`);
    }
    base.fragments = textFragments(extractedText, base.id, kind);
    if (!base.fragments.length && base.legibility === 'full') { base.legibility = 'partial'; base.warnings.push('No se encontraron fragmentos de texto.'); }
    if (base.warnings.length) warnings.push(...base.warnings.map((warning) => `${displayName}: ${warning}`));
    documents.push(base);
  }
  return { documents, warnings, capabilities };
}

export function ingestDirectory(directory, options = {}) {
  const directoryState = ensureInputDirectory(directory, { confirmCreate: options.createDirectory === true });
  if (!directoryState.is_directory) {
    return {
      documents: [], warnings: [`La carpeta no está disponible: ${directoryState.path}.`, 'Confirma la creación de la carpeta antes de cargar documentos.'],
      selected: [], selection_confirmed: false, requires_confirmation: true,
      directory: directoryState, capabilities: options.capabilities ?? extractorCapabilities()
    };
  }
  const listed = listInputFiles(directory, options.limits);
  if (options.selectionConfirmed !== true) {
    const candidates = listed.files.map((file) => ({ display_name: path.basename(file), path: file, kind: EXTENSIONS.get(path.extname(file).toLowerCase()) ?? 'unknown', selected: false }));
    return {
      documents: [], candidates, warnings: [...listed.warnings, 'Manifiesto en modo inspección: confirma la selección antes de extraer texto.'],
      selected: listed.files, selection_confirmed: false, requires_confirmation: true, manifest_only: true,
      directory: directoryState, capabilities: options.capabilities ?? extractorCapabilities()
    };
  }
  const result = ingestFiles(listed.files, options);
  return {
    ...result,
    warnings: [...listed.warnings, ...result.warnings],
    selected: listed.files,
    selection_confirmed: options.selectionConfirmed === true,
    requires_confirmation: options.selectionConfirmed !== true,
    directory: directoryState
  };
}

const input = process.argv[2];
const output = process.argv.slice(3).find((arg) => !arg.startsWith('--'));
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  if (!input) { console.error('Uso: node scripts/ingest.mjs <carpeta-o-archivo> [manifest.json] [--create-input-dir] [--confirm-selection]'); process.exitCode = 2; }
  else {
    const absolute = path.resolve(input);
    const result = fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()
      ? ingestDirectory(absolute, { selectionConfirmed: process.argv.includes('--confirm-selection') })
      : fs.existsSync(absolute) ? ingestFiles([absolute]) : ingestDirectory(absolute, { createDirectory: process.argv.includes('--create-input-dir') });
    const manifest = { schema_version: '1.0', selected_at: new Date().toISOString(), ...result };
    if (output) fs.writeFileSync(path.resolve(output), JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(manifest, null, 2));
    process.exitCode = result.documents.every((doc) => doc.legibility !== 'unreadable') ? 0 : 1;
  }
}
