// What the emoji folder holds: images named <file>.png, .gif, .webp, .jpg or .svg, and emojis.json, which maps a
// file name (without its extension) to { name, use }: the name to write between colons when it is not the
// file's, and when the person wants it used. A plain string there is read as its `use`.

// Discord's rule for emoji names, lowercased here.
export const NAME = /^[a-z0-9_]{2,32}$/
export const ENTRIES_FILE = 'emojis.json'
// The most an Svg element's source holds.
export const SVG_LIMIT = 131072

export const MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
}

export type Entry = { name?: string; use?: string }

// emojis.json's entries, and the file's object as read, which a save writes back with one entry changed.
export function parseEntries(text: string): { entries: Record<string, Entry>; raw: Record<string, unknown>; problem?: string } {
  let parsed: unknown
  try {
    // A byte order mark, as Notepad and Windows PowerShell write, is not part of the JSON.
    parsed = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
  } catch {
    return { entries: {}, raw: {}, problem: `${ENTRIES_FILE} (not valid JSON)` }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { entries: {}, raw: {}, problem: `${ENTRIES_FILE} (expected an object keyed by file name)` }
  }
  const entries: Record<string, Entry> = {}
  for (const [file, value] of Object.entries(parsed)) {
    if (typeof value === 'string') entries[file] = { use: value }
    else if (typeof value === 'object' && value !== null) {
      const { name, use } = value as Record<string, unknown>
      entries[file] = { name: typeof name === 'string' ? name : undefined, use: typeof use === 'string' ? use : undefined }
    }
  }
  return { entries, raw: parsed as Record<string, unknown> }
}

// emojis.json's text with one file's name and use replaced, everything else as read; an entry left with
// nothing in it is removed.
export function withEntry(raw: Record<string, unknown>, file: string, entry: Entry): string {
  const next = { ...raw }
  const old = raw[file]
  const { name: _name, use: _use, ...rest } =
    typeof old === 'object' && old !== null && !Array.isArray(old) ? (old as Record<string, unknown>) : {}
  const kept = { ...(entry.name ? { name: entry.name } : {}), ...(entry.use ? { use: entry.use } : {}), ...rest }
  if (Object.keys(kept).length) next[file] = kept
  else delete next[file]
  const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)))
  return `${JSON.stringify(sorted, null, 2)}\n`
}

export function wrapImage(mime: string, base64: string): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">' +
    `<image width="128" height="128" preserveAspectRatio="xMidYMid meet" href="data:${mime};base64,${base64}"/>` +
    '</svg>'
  )
}

// How long an image file of `size` bytes is once wrapped for an Svg element.
export function wrappedLength(mime: string | undefined, size: number): number {
  return mime ? wrapImage(mime, '').length + Math.ceil(size / 3) * 4 : size
}

// An animated WebP is an extended one (a VP8X chunk first) with the animation flag set in that chunk's flags.
export function isAnimatedWebp(base64: string): boolean {
  const digits = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let text = ''
  for (let i = 0; i + 4 <= 32 && i + 4 <= base64.length; i += 4) {
    const n = [...base64.slice(i, i + 4)].reduce((sum, c) => sum * 64 + Math.max(0, digits.indexOf(c)), 0)
    text += String.fromCharCode((n >> 16) & 255, (n >> 8) & 255, n & 255)
  }
  return text.slice(12, 16) === 'VP8X' && (text.charCodeAt(20) & 0x02) !== 0
}
