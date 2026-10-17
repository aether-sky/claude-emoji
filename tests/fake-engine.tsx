// The engine beneath the plugin in the tests: a home folder holding the emoji folder and the output styles, the
// settings, command and tool registries, panes, submitted prompts, and the engine's own drawing of a reply as a
// Text reading "engine".
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

export const FOLDER = 'C:/home/.claude/emojis'
export const STYLES = 'C:/home/.claude/output-styles'
// A 1x1 PNG.
export const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
// The start of an animated WebP: RIFF, VP8X, then an ANIM chunk.
export const ANIMATED_WEBP = 'UklGRkAAAABXRUJQVlA4WAoAAAASAAAAPwAAPwAAQU5JTQYAAAAAAAAAAAA='

// The emoji folder's files by name (written files land here too), or the output styles' texts by file name.
export type Files = Record<string, { text?: string; base64?: string }>

export type Setup = { styles?: Files; outputStyle?: string }

export function engine(on: On, files: Files, { styles = {}, outputStyle = 'Tadaima voice' }: Setup = {}) {
  const seen = { prompts: [] as string[], closed: [] as string[], opened: [] as string[] }
  mock.env(on, { USERPROFILE: 'C:/home' })
  mock.store(on)
  on('settings.read', () => ({ value: { outputStyle } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__discord-emoji__${e.name}` } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  // The engine hands paths on in the platform's spelling.
  const slashed = (path: string) => path.replaceAll('\\', '/')
  const folderOf = (path: string): [Files, string] => {
    const at = slashed(path)
    if (at.startsWith(`${FOLDER}/`)) return [files, at.slice(FOLDER.length + 1)]
    if (at.startsWith(`${STYLES}/`)) return [styles, at.slice(STYLES.length + 1)]
    throw new Error(`no such file ${path}`)
  }
  on('fs.list', ($, e) => {
    const at = slashed(e.path)
    const listed = at === FOLDER ? files : at === STYLES ? styles : undefined
    if (!listed) throw new Error(`no folder ${e.path}`)
    const here = Object.keys(listed).filter(name => !name.includes('/'))
    return { value: here.map(name => ({ name, kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false })) }
  })
  on('fs.read', ($, e) => {
    const [within, name] = folderOf(e.path)
    const file = within[name]
    if (!file) throw new Error(`no file ${e.path}`)
    return { value: e.as === 'bytes' ? { base64: file.base64 ?? '' } : (file.text ?? '') }
  })
  on('fs.write', ($, e) => {
    const [within, name] = folderOf(e.path)
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

export async function start($: Engine) {
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
}

// A docked pane of the mod's, as the desktop mounts it.
export const pane = (requestId: string) => ({
  component: 'Pane' as const,
  requestId,
  props: { title: requestId, isFocused: true, bodyColumns: 80, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} },
})

export const COMMAND = { args: '', origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } }
