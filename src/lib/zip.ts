/**
 * A minimal, dependency-free ZIP writer (store only, no compression).
 *
 * It exists so the resume can be exported as a genuine .docx — an OOXML
 * package is just a zip — without pulling a 100 KB zip library into a bundle
 * that has a 150 KB budget. Word, Pages and Google Docs all accept stored
 * (uncompressed) entries.
 */

export interface ZipEntry {
  name: string
  data: Uint8Array
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

class Writer {
  private parts: Uint8Array[] = []
  length = 0

  push(bytes: Uint8Array) {
    this.parts.push(bytes)
    this.length += bytes.length
  }

  u16(n: number) {
    this.push(new Uint8Array([n & 0xff, (n >>> 8) & 0xff]))
  }

  u32(n: number) {
    this.push(new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]))
  }

  concat(): Uint8Array {
    const out = new Uint8Array(this.length)
    let at = 0
    for (const p of this.parts) {
      out.set(p, at)
      at += p.length
    }
    return out
  }
}

/** DOS time/date, which is what the zip format still speaks. */
function dosStamp(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

export function zip(entries: ZipEntry[], now: Date = new Date()): Uint8Array {
  const { time, date } = dosStamp(now)
  const body = new Writer()
  const central = new Writer()

  for (const entry of entries) {
    const name = utf8(entry.name)
    const crc = crc32(entry.data)
    const offset = body.length

    // local file header
    body.u32(0x04034b50)
    body.u16(20) // version needed
    body.u16(0x0800) // UTF-8 filenames
    body.u16(0) // stored
    body.u16(time)
    body.u16(date)
    body.u32(crc)
    body.u32(entry.data.length)
    body.u32(entry.data.length)
    body.u16(name.length)
    body.u16(0)
    body.push(name)
    body.push(entry.data)

    // central directory entry
    central.u32(0x02014b50)
    central.u16(20) // version made by
    central.u16(20) // version needed
    central.u16(0x0800)
    central.u16(0)
    central.u16(time)
    central.u16(date)
    central.u32(crc)
    central.u32(entry.data.length)
    central.u32(entry.data.length)
    central.u16(name.length)
    central.u16(0) // extra
    central.u16(0) // comment
    central.u16(0) // disk
    central.u16(0) // internal attrs
    central.u32(0) // external attrs
    central.u32(offset)
    central.push(name)
  }

  const out = new Writer()
  out.push(body.concat())
  const centralBytes = central.concat()
  const centralOffset = out.length
  out.push(centralBytes)

  // end of central directory
  out.u32(0x06054b50)
  out.u16(0)
  out.u16(0)
  out.u16(entries.length)
  out.u16(entries.length)
  out.u32(centralBytes.length)
  out.u32(centralOffset)
  out.u16(0)

  return out.concat()
}
