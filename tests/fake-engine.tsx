// The engine beneath the plugin in the tests: a home folder holding the emoji folder and the output styles, the
// project's output styles, the settings, command and tool registries, panes, submitted prompts, and the engine's
// own drawing of a reply as a Text reading "engine".
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

export const FOLDER = 'C:/home/.claude/emojis'
export const STYLES = 'C:/home/.claude/output-styles'
export const PROJECT_STYLES = '.claude/output-styles'
// A 1x1 PNG.
export const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
// The start of an animated WebP: RIFF, VP8X with the animation flag, then an ANIM chunk.
export const ANIMATED_WEBP = 'UklGRkAAAABXRUJQVlA4WAoAAAASAAAAPwAAPwAAQU5JTQYAAAAAAAAAAAA='
// The same with a colour profile (an ICCP chunk) between VP8X and ANIM.
export const ANIMATED_WEBP_WITH_ICC =
  'UklGRmwAAABXRUJQVlA4WAoAAAAiAAAAPwAAPwAASUNDUEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQU5JTQYAAAAAAAAAAAA='
// The most the engine reads at once.
const READ_LIMIT = 4 * 1024 * 1024

// A file of the fake: its text or bytes; `isUnreadable`, every read of it rejects, as a file another program
// holds for a moment; `isReadOnly`, every write rejects; `isLink`, it is listed as a symbolic link to a file.
export type File = { text?: string; base64?: string; isUnreadable?: boolean; isReadOnly?: boolean; isLink?: boolean }

// The emoji folder's files by name (written files land here too), or the output styles' texts by file name.
export type Files = Record<string, File>

export type Setup = { styles?: Files; projectStyles?: Files; outputStyle?: string; store?: Record<string, unknown> }

export function engine(on: On, files: Files, { styles = {}, projectStyles = {}, outputStyle = 'Test voice', store }: Setup = {}) {
  const seen = { prompts: [] as string[], closed: [] as string[], opened: [] as string[] }
  mock.env(on, { USERPROFILE: 'C:/home' })
  mock.store(on, store)
  on('settings.read', () => ({ value: { outputStyle } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__inline-emoji__${e.name}` } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  const folders: [string, Files][] = [
    [FOLDER, files],
    [STYLES, styles],
    [PROJECT_STYLES, projectStyles],
  ]
  // The engine hands paths on in the platform's spelling.
  const slashed = (path: string) => path.replaceAll('\\', '/')
  // Where a folder ends in a path: an absolute folder from the path's start, a relative one (resolved by the
  // engine under the working directory) after any slash; -1 when the path is not in it.
  const folderEnd = (at: string, dir: string) => {
    if (dir.startsWith('C:')) return at === dir || at.startsWith(`${dir}/`) ? dir.length : -1
    const i = `${at}/`.indexOf(`/${dir}/`)
    return i < 0 ? -1 : i + 1 + dir.length
  }
  const fileAt = (path: string): [Files, string] | undefined => {
    const at = slashed(path)
    for (const [dir, within] of folders) {
      const end = folderEnd(at, dir)
      if (end >= 0 && end < at.length) return [within, at.slice(end + 1)]
    }
    return undefined
  }
  const sizeOf = (file: File) => (file.base64 !== undefined ? (file.base64.length * 3) / 4 : (file.text ?? '').length)
  on('fs.list', ($, e) => {
    const at = slashed(e.path)
    const listed = folders.find(([dir]) => folderEnd(at, dir) === at.length)?.[1]
    if (!listed) throw new Error(`ENOENT: no folder ${e.path}`)
    const here = Object.entries(listed).filter(([name]) => !name.includes('/'))
    return {
      value: here.map(([name, file]) => ({
        name,
        kind: file.isLink ? ('other' as const) : ('file' as const),
        size: file.isLink ? 0 : sizeOf(file),
        mtimeMs: 0,
        isLink: Boolean(file.isLink),
      })),
    }
  })
  on('fs.stat', ($, e) => {
    const [within, name] = fileAt(e.path) ?? [{}, '']
    const file = within[name]
    if (!file) throw new Error(`ENOENT: no file ${e.path}`)
    return { value: { kind: 'file' as const, size: sizeOf(file), mtimeMs: 0, isLink: Boolean(file.isLink) } }
  })
  on('fs.exists', ($, e) => {
    const [within, name] = fileAt(e.path) ?? [{}, '']
    return { value: within[name] !== undefined }
  })
  on('fs.read', ($, e) => {
    const [within, name] = fileAt(e.path) ?? [{}, '']
    const file = within[name]
    if (!file) throw new Error(`ENOENT: no file ${e.path}`)
    if (file.isUnreadable) throw new Error(`EBUSY: ${e.path} is busy`)
    if (sizeOf(file) > READ_LIMIT) throw new Error(`${e.path} is over 4 MiB`)
    return { value: e.as === 'bytes' ? { base64: file.base64 ?? '' } : (file.text ?? '') }
  })
  on('fs.write', ($, e) => {
    const [within, name] = fileAt(e.path) ?? []
    if (!within || name === undefined) throw new Error(`ENOENT: no folder for ${e.path}`)
    if (within[name]?.isReadOnly) throw new Error(`EPERM: ${e.path} is read-only`)
    within[name] = { text: e.text }
    return { value: undefined }
  })
  on('ui.open', ($, e) => {
    seen.opened.push(e.id)
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', ($, e) => {
    seen.closed.push(e.id)
    return { value: undefined }
  })
  on('prompt.submit', ($, e) => {
    seen.prompts.push(e.text)
    return { text: e.text }
  })
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  return seen
}

export async function start($: Engine, isInteractive = true) {
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive })
}

// A docked pane of the mod's, as the desktop mounts it.
export const pane = (requestId: string) => ({
  component: 'Pane' as const,
  requestId,
  props: { title: requestId, isFocused: true, bodyColumns: 80, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} },
})

export const COMMAND = { args: '', origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } }
