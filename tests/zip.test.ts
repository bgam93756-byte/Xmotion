import { describe, expect, it } from 'vitest';
import * as zlib from 'node:zlib';
import { ZIP_MAX_FILES, ZipLimitError, ZipWriter, crc32, dosDateTime } from '../src/engine/zip';

/** Reference CRC-32: node:zlib when it has one (Node 22.2+), else a plain bitwise version. */
function refCrc(data: Uint8Array): number {
  const z = (zlib as { crc32?: (d: Uint8Array) => number }).crc32;
  if (z) return z(data) >>> 0;
  let c = 0xffffffff;
  for (const b of data) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

interface Entry {
  name: string;
  flags: number;
  method: number;
  time: number;
  date: number;
  crc: number;
  size: number;
  data: Uint8Array;
}

/**
 * Reads an archive the way unzip tools do: end record → central directory →
 * local headers, checking that every structure agrees with the others.
 */
function parseZip(buf: Uint8Array): Entry[] {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const text = (from: number, len: number) => new TextDecoder().decode(buf.subarray(from, from + len));
  const end = buf.length - 22;
  expect(v.getUint32(end, true)).toBe(0x06054b50);
  expect(v.getUint16(end + 4, true)).toBe(0);
  expect(v.getUint16(end + 6, true)).toBe(0);
  const count = v.getUint16(end + 10, true);
  expect(v.getUint16(end + 8, true)).toBe(count);
  const dirSize = v.getUint32(end + 12, true);
  const dirOffset = v.getUint32(end + 16, true);
  expect(v.getUint16(end + 20, true)).toBe(0);
  expect(dirOffset + dirSize).toBe(end);

  const out: Entry[] = [];
  let p = dirOffset;
  let expectedOffset = 0;
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(p, true)).toBe(0x02014b50);
    const entry = {
      flags: v.getUint16(p + 8, true),
      method: v.getUint16(p + 10, true),
      time: v.getUint16(p + 12, true),
      date: v.getUint16(p + 14, true),
      crc: v.getUint32(p + 16, true),
      size: v.getUint32(p + 24, true),
    };
    expect(v.getUint32(p + 20, true)).toBe(entry.size);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const offset = v.getUint32(p + 42, true);
    const name = text(p + 46, nameLen);
    // Entries are packed back to back from the start of the file.
    expect(offset).toBe(expectedOffset);

    expect(v.getUint32(offset, true)).toBe(0x04034b50);
    expect(v.getUint16(offset + 6, true)).toBe(entry.flags);
    expect(v.getUint16(offset + 8, true)).toBe(entry.method);
    expect(v.getUint16(offset + 10, true)).toBe(entry.time);
    expect(v.getUint16(offset + 12, true)).toBe(entry.date);
    expect(v.getUint32(offset + 14, true)).toBe(entry.crc);
    expect(v.getUint32(offset + 18, true)).toBe(entry.size);
    expect(v.getUint32(offset + 22, true)).toBe(entry.size);
    const localNameLen = v.getUint16(offset + 26, true);
    const localExtraLen = v.getUint16(offset + 28, true);
    expect(text(offset + 30, localNameLen)).toBe(name);
    const start = offset + 30 + localNameLen + localExtraLen;
    out.push({ ...entry, name, data: buf.subarray(start, start + entry.size) });
    expectedOffset = start + entry.size;
    p += 46 + nameLen + extraLen + commentLen;
  }
  expect(p).toBe(end);
  expect(expectedOffset).toBe(dirOffset);
  return out;
}

const bytes = (blob: Blob) => blob.arrayBuffer().then((b) => new Uint8Array(b));

describe('crc32', () => {
  it('matches the standard check value and a reference implementation', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
    const data = new Uint8Array(100_003).map((_, i) => (i * 7919 + (i >> 5)) & 0xff);
    expect(crc32(data)).toBe(refCrc(data));
  });

  it('continues from a previous value', () => {
    const data = new Uint8Array(5000).map((_, i) => (i * 31) & 0xff);
    expect(crc32(data.subarray(1234), crc32(data.subarray(0, 1234)))).toBe(crc32(data));
  });
});

describe('dosDateTime', () => {
  it('packs local time with 2 s resolution', () => {
    const { time, date } = dosDateTime(new Date(2024, 4, 17, 13, 45, 31));
    expect(time).toBe((13 << 11) | (45 << 5) | 15);
    expect(date).toBe((44 << 9) | (5 << 5) | 17);
  });

  it('clamps to the years DOS dates can hold', () => {
    expect(dosDateTime(new Date(1975, 0, 1))).toEqual({ time: 0, date: (1 << 5) | 1 });
    expect(dosDateTime(new Date(2200, 0, 1)).date >> 9).toBe(127);
  });
});

describe('ZipWriter', () => {
  it('writes a valid stored archive of two files', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
    const jpeg = new Uint8Array(70_000).map((_, i) => (i * 13 + 7) & 0xff);
    const when = new Date(2026, 9, 3, 9, 30, 12);
    const zip = new ZipWriter(when);
    await zip.add('clip/clip_00001.png', png);
    await zip.add('clip/clip_00002.jpg', new Blob([jpeg]));
    const blob = zip.finish();
    expect(blob.type).toBe('application/zip');

    const buf = await bytes(blob);
    const entries = parseZip(buf);
    expect(entries.map((e) => e.name)).toEqual(['clip/clip_00001.png', 'clip/clip_00002.jpg']);
    const { time, date } = dosDateTime(when);
    for (const [e, src] of [
      [entries[0], png],
      [entries[1], jpeg],
    ] as const) {
      expect(e.method).toBe(0);
      expect(e.flags).toBe(0);
      expect(e.size).toBe(src.length);
      expect(e.crc).toBe(refCrc(src));
      expect(e.crc).toBe(refCrc(e.data));
      expect(Array.from(e.data)).toEqual(Array.from(src));
      expect(e.time).toBe(time);
      expect(e.date).toBe(date);
    }
    // 2 × local header + names + data, the central directory and the end record.
    const names = 19 + 19;
    expect(buf.length).toBe(2 * 30 + names + png.length + jpeg.length + 2 * 46 + names + 22);
  });

  it('marks UTF-8 names and normalizes separators', async () => {
    const zip = new ZipWriter();
    await zip.add('Ünïcode ✓.txt', new TextEncoder().encode('hi'));
    await zip.add('\\folder\\file.txt', new Uint8Array([1]));
    const [utf8, plain] = parseZip(await bytes(zip.finish()));
    expect(utf8.name).toBe('Ünïcode ✓.txt');
    expect(utf8.flags & 0x800).toBe(0x800);
    expect(plain.name).toBe('folder/file.txt');
    expect(plain.flags).toBe(0);
  });

  it('keeps a copy of byte arrays and handles empty files', async () => {
    const data = new Uint8Array([1, 2, 3]);
    const zip = new ZipWriter();
    await zip.add('a.bin', data);
    await zip.add('empty.bin', new Uint8Array(0));
    data[0] = 99;
    const [a, empty] = parseZip(await bytes(zip.finish()));
    expect(Array.from(a.data)).toEqual([1, 2, 3]);
    expect(empty.size).toBe(0);
    expect(empty.crc).toBe(0);
  });

  it('commits concurrent adds consistently', async () => {
    const zip = new ZipWriter();
    const files = Array.from({ length: 20 }, (_, i) => new Uint8Array(100 + i * 37).fill(i));
    await Promise.all(files.map((f, i) => zip.add(`f${i}.bin`, i % 2 ? new Blob([f]) : f)));
    const entries = parseZip(await bytes(zip.finish()));
    expect(entries).toHaveLength(20);
    for (const e of entries) {
      const src = files[Number(e.name.slice(1, -4))];
      expect(e.crc).toBe(refCrc(src));
      expect(e.size).toBe(src.length);
    }
  });

  it('refuses to finish while files are being added, and to add after finishing', async () => {
    const zip = new ZipWriter();
    const pending = zip.add('a.bin', new Blob([new Uint8Array(10)]));
    expect(() => zip.finish()).toThrow(/still being added/);
    await pending;
    const blob = zip.finish();
    expect(zip.finish()).toBe(blob);
    await expect(zip.add('b.bin', new Uint8Array(1))).rejects.toThrow(/after finish/);
    await expect(new ZipWriter().add('', new Uint8Array(1))).rejects.toThrow(/invalid file name/);
  });

  it('stops at 4 GB with a clear error, before reading the data', async () => {
    const zip = new ZipWriter();
    await zip.add('small.bin', new Uint8Array(16));
    const huge = { size: 2 ** 32 } as unknown as Blob;
    await expect(zip.add('huge.bin', huge)).rejects.toThrow(ZipLimitError);
    await expect(zip.add('huge.bin', huge)).rejects.toThrow(/4 GB/);
    // The archive is still valid without the rejected file.
    expect(parseZip(await bytes(zip.finish())).map((e) => e.name)).toEqual(['small.bin']);
  });

  it(`stops at ${ZIP_MAX_FILES} files with a clear error`, async () => {
    const zip = new ZipWriter();
    const empty = new Uint8Array(0);
    for (let i = 0; i < ZIP_MAX_FILES; i++) await zip.add(`${i}`, empty);
    await expect(zip.add('one-too-many', empty)).rejects.toThrow(ZipLimitError);
    const buf = await bytes(zip.finish());
    const v = new DataView(buf.buffer);
    expect(v.getUint16(buf.length - 22 + 10, true)).toBe(ZIP_MAX_FILES);
  });
});
