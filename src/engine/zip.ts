/**
 * A small ZIP writer. Files are stored without compression (method 0): PNG
 * and JPEG frames are already compressed, so deflating them again would cost
 * time for nothing. Plain ZIP only (no ZIP64): an archive holds at most
 * 65,534 files and 4 GB.
 */

/** Most files a plain ZIP can list (0xFFFF in the count means "see ZIP64"). */
export const ZIP_MAX_FILES = 0xfffe;
/** Largest archive whose sizes and offsets fit in 32 bits (0xFFFFFFFF means "see ZIP64"). */
const MAX_BYTES = 0xfffffffe;

const LOCAL = 30;
const CENTRAL = 46;
const END = 22;
/** Version 2.0, MS-DOS attributes. */
const MADE_BY = 20;
/** Version 1.0: stored files. */
const NEEDED = 10;
/** General purpose flag bit 11: the name is UTF-8. */
const UTF8 = 0x800;

/** Thrown when an archive would go past the plain ZIP limits. */
export class ZipLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipLimitError';
  }
}

let table: Uint32Array | null = null;

/** CRC-32 (IEEE, as used by ZIP and PNG), continuing from a previous `crc`. */
export function crc32(data: Uint8Array, crc = 0): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  const t = table;
  let c = ~crc;
  for (let i = 0; i < data.length; i++) c = t[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

/** CRC-32 of a Blob, read in slices so large files don't need one big buffer. */
async function blobCrc(blob: Blob): Promise<number> {
  const CHUNK = 8 << 20;
  let crc = 0;
  for (let off = 0; off < blob.size; off += CHUNK) crc = crc32(new Uint8Array(await blob.slice(off, off + CHUNK).arrayBuffer()), crc);
  return crc;
}

/** MS-DOS time and date words (local time, 2 s resolution, years 1980–2107). */
export function dosDateTime(d: Date): { time: number; date: number } {
  const year = d.getFullYear();
  if (year < 1980) return { time: 0, date: (1 << 5) | 1 };
  if (year > 2107) return { time: (23 << 11) | (59 << 5) | 29, date: (127 << 9) | (12 << 5) | 31 };
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

interface Entry {
  name: Uint8Array;
  flags: number;
  crc: number;
  size: number;
  /** Offset of the local header from the start of the archive. */
  offset: number;
}

const encoder = new TextEncoder();

export class ZipWriter {
  private parts: BlobPart[] = [];
  private entries: Entry[] = [];
  /** Bytes of local headers and data so far: where the next entry starts. */
  private offset = 0;
  /** Bytes the central directory needs for the entries so far. */
  private dirSize = 0;
  private pending = 0;
  private blob: Blob | null = null;
  private readonly time: number;
  private readonly date: number;

  /** `now` is the modification time stamped on every file. */
  constructor(now = new Date()) {
    const { time, date } = dosDateTime(now);
    this.time = time;
    this.date = date;
  }

  /**
   * Adds a file; folders in the name are separated by "/" ("frames/0001.png").
   * Files are listed in the order their add() calls complete.
   */
  async add(name: string, data: Uint8Array | Blob): Promise<void> {
    if (this.blob) throw new Error('ZipWriter: add() after finish()');
    const path = name.replace(/\\/g, '/').replace(/^\/+/, '');
    const nameBytes = encoder.encode(path);
    if (!nameBytes.length || nameBytes.length > 0xffff) throw new Error(`ZipWriter: invalid file name “${name}”`);
    const size = data instanceof Uint8Array ? data.byteLength : data.size;
    // Checked up front (no point reading a file that can't fit) and again when committing.
    this.checkLimits(nameBytes.length, size, this.pending);
    this.pending++;
    let crc: number;
    try {
      crc = data instanceof Uint8Array ? crc32(data) : await blobCrc(data);
    } finally {
      this.pending--;
    }
    this.checkLimits(nameBytes.length, size, 0);
    const entry: Entry = { name: nameBytes, flags: /[^\x00-\x7f]/.test(path) ? UTF8 : 0, crc, size, offset: this.offset };
    const header = new Uint8Array(LOCAL + nameBytes.length);
    const v = new DataView(header.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, NEEDED, true);
    v.setUint16(6, entry.flags, true);
    v.setUint16(8, 0, true);
    v.setUint16(10, this.time, true);
    v.setUint16(12, this.date, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, size, true);
    v.setUint32(22, size, true);
    v.setUint16(26, nameBytes.length, true);
    v.setUint16(28, 0, true);
    header.set(nameBytes, LOCAL);
    // Copy byte arrays so later changes by the caller can't corrupt the archive.
    this.parts.push(header, data instanceof Uint8Array ? new Uint8Array(data) : data);
    this.entries.push(entry);
    this.offset += header.length + size;
    this.dirSize += CENTRAL + nameBytes.length;
  }

  private checkLimits(nameLength: number, size: number, reserved: number) {
    if (this.entries.length + reserved >= ZIP_MAX_FILES) {
      throw new ZipLimitError(`A ZIP file can hold at most ${ZIP_MAX_FILES.toLocaleString('en-US')} files`);
    }
    const total = this.offset + LOCAL + nameLength + size + this.dirSize + CENTRAL + nameLength + END;
    if (total > MAX_BYTES) throw new ZipLimitError('A ZIP file can be at most 4 GB');
  }

  /** Writes the central directory and returns the archive. Await every add() first. */
  finish(): Blob {
    if (this.blob) return this.blob;
    if (this.pending) throw new Error('ZipWriter: finish() while files are still being added');
    const dir = new Uint8Array(this.dirSize + END);
    const v = new DataView(dir.buffer);
    let p = 0;
    for (const e of this.entries) {
      v.setUint32(p, 0x02014b50, true);
      v.setUint16(p + 4, MADE_BY, true);
      v.setUint16(p + 6, NEEDED, true);
      v.setUint16(p + 8, e.flags, true);
      v.setUint16(p + 10, 0, true);
      v.setUint16(p + 12, this.time, true);
      v.setUint16(p + 14, this.date, true);
      v.setUint32(p + 16, e.crc, true);
      v.setUint32(p + 20, e.size, true);
      v.setUint32(p + 24, e.size, true);
      v.setUint16(p + 28, e.name.length, true);
      // Extra field, comment, disk number, internal and external attributes stay 0.
      v.setUint32(p + 42, e.offset, true);
      dir.set(e.name, p + CENTRAL);
      p += CENTRAL + e.name.length;
    }
    v.setUint32(p, 0x06054b50, true);
    v.setUint16(p + 8, this.entries.length, true);
    v.setUint16(p + 10, this.entries.length, true);
    v.setUint32(p + 12, this.dirSize, true);
    v.setUint32(p + 16, this.offset, true);
    this.blob = new Blob([...this.parts, dir], { type: 'application/zip' });
    this.parts = [];
    return this.blob;
  }
}
