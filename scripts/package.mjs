#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2] ?? path.join(root, 'dist', 'hexaflex-clinical.zip'));
const crcTable = Array.from({ length: 256 }, (_, index) => { let c = index; for (let bit = 0; bit < 8; bit += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); return c >>> 0; });
function crc32(buffer) { let crc = 0xffffffff; for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function filesIn(directory, result = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (['.git', 'node_modules', 'dist', 'output'].includes(entry.name) || entry.name.endsWith('.zip')) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) filesIn(absolute, result); else result.push(absolute);
  }
  return result;
}
function u16(value) { const buffer = Buffer.alloc(2); buffer.writeUInt16LE(value, 0); return buffer; }
function u32(value) { const buffer = Buffer.alloc(4); buffer.writeUInt32LE(value >>> 0, 0); return buffer; }
const entries = filesIn(root).map((absolute) => ({ name: `hexaflex-clinical/${path.relative(root, absolute).replaceAll('\\', '/')}`, data: fs.readFileSync(absolute) }));
const locals = []; const centrals = []; let offset = 0;
for (const entry of entries) {
  const name = Buffer.from(entry.name, 'utf8'); const checksum = crc32(entry.data);
  const local = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), u16(20), u16(0x800), u16(0), u16(0), u16(0), u32(checksum), u32(entry.data.length), u32(entry.data.length), u16(name.length), u16(0), name, entry.data]);
  locals.push(local);
  const central = Buffer.concat([Buffer.from([0x50, 0x4b, 0x01, 0x02]), u16(20), u16(20), u16(0x800), u16(0), u16(0), u16(0), u32(checksum), u32(entry.data.length), u32(entry.data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]);
  centrals.push(central); offset += local.length;
}
const centralBytes = Buffer.concat(centrals); const localBytes = Buffer.concat(locals);
const end = Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x06]), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(centralBytes.length), u32(localBytes.length), u16(0)]);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, Buffer.concat([localBytes, centralBytes, end]));
console.log(JSON.stringify({ output, entries: entries.length, bytes: fs.statSync(output).size, deterministic: true }, null, 2));
