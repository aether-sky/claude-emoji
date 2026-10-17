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

export function parseEntries(text: string): { entries: Record<string, Entry>; problem?: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { entries: {}, problem: `${ENTRIES_FILE} (not valid JSON)` }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { entries: {}, problem: `${ENTRIES_FILE} (expected an object keyed by file name)` }
  }
  const entries: Record<string, Entry> = {}
  for (const [file, value] of Object.entries(parsed)) {
    if (typeof value === 'string') entries[file] = { use: value }
    else if (typeof value === 'object' && value !== null) {
      const { name, use } = value as Record<string, unknown>
      entries[file] = { name: typeof name === 'string' ? name : undefined, use: typeof use === 'string' ? use : undefined }
    }
  }
  return { entries }
}

// emojis.json's text with one file's entry replaced; an entry with nothing in it is removed.
export function withEntry(entries: Record<string, Entry>, file: string, entry: Entry): string {
  const next = { ...entries }
  const kept: Entry = {}
  if (entry.name) kept.name = entry.name
  if (entry.use) kept.use = entry.use
  if (kept.name || kept.use) next[file] = kept
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

// An animated WebP carries an ANIM chunk after its VP8X header, within its first 64 bytes.
export function isAnimatedWebp(base64: string): boolean {
  const digits = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let text = ''
  for (let i = 0; i + 4 <= 88 && i + 4 <= base64.length; i += 4) {
    const n = [...base64.slice(i, i + 4)].reduce((sum, c) => sum * 64 + Math.max(0, digits.indexOf(c)), 0)
    text += String.fromCharCode((n >> 16) & 255, (n >> 8) & 255, n & 255)
  }
  return text.includes('ANIM')
}
