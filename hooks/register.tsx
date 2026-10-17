// Custom Discord-style emoji in Claude's replies. The emoji folder's images (folder.ts) are listed for the model
// in the system prompt with when the person wants each used, drawn as pictures in replies (reply.tsx), taught in
// the /emoji-teach pane (teach.tsx), and the output style's emoji rules are shown in the /emoji-rules pane
// (rules.ts, rules-pane.tsx). Every call on the engine is made here.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, FsEntry, Register } from 'claude-code'

import type { Emoji, EmojiDraft, EmojiRules } from '../types'
import { ENTRIES_FILE, MIME_TYPES, NAME, SVG_LIMIT, isAnimatedWebp, parseEntries, withEntry, wrapImage, wrappedLength } from './folder'
import { hasEmoji } from './markdown'
import { drawReply } from './reply'
import { emojiSection, frontmatterName, parseEmojiRules } from './rules'
import { drawRulesPane } from './rules-pane'
import { drawTeachPane, listed } from './teach'

const emojis = atom({ plugin: 'inline-emoji', key: 'emojis' } as const, {} as Record<string, Emoji>)
const folder = atom({ plugin: 'inline-emoji', key: 'folder' } as const, '')
const pageStart = atom({ plugin: 'inline-emoji', key: 'pageStart' } as const, 0)
const isUndescribedOnly = atom({ plugin: 'inline-emoji', key: 'isUndescribedOnly' } as const, false)
const drafts = atom({ plugin: 'inline-emoji', key: 'drafts' } as const, {} as Record<string, EmojiDraft>)
const notice = atom({ plugin: 'inline-emoji', key: 'notice' } as const, '')
const shownDrafts = atom({ plugin: 'inline-emoji', key: 'shownDrafts' } as const, {} as Record<string, EmojiDraft>)
const focused = atom({ plugin: 'inline-emoji', key: 'focused' } as const, '')
const rules = atom({ plugin: 'inline-emoji', key: 'rules' } as const, { intro: '', groups: [] } as EmojiRules)

const TEACH_PANE = 'emoji-teach'
const TEACH_TOOL = 'open_emoji_teacher'
const AUTO_OPENED = 'teachPaneAutoOpened'
const RULES_PANE = 'emoji-rules'
const RULES_TOOL = 'open_emoji_rules'
const STYLE_FOLDER = '.claude/output-styles'
const SVG_SURFACES: readonly string[] = ['desktop', 'mobile', 'vscode']

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'emoji-reload', description: 'Reloads the custom emoji folder.' })
    await $.command.register({ name: 'emoji-teach', description: 'Opens a pane to say when Claude should use each emoji.' })
    await $.command.register({ name: 'emoji-rules', description: "Shows the output style's emoji rules with their pictures." })
    await $.tool.register({
      name: TEACH_TOOL,
      description: "Opens the emoji teaching pane, where the person says when Claude should use each of their emoji. Call it when they ask to open, launch or show it.",
      isDeferred: false,
    })
    await $.tool.register({
      name: RULES_TOOL,
      description: "Opens the emoji rules viewer: the output style's emoji rules beside each emoji's picture. Call it when the person asks to see the emoji rules.",
      isDeferred: false,
    })
    await reload($, options)
    // The pane opens by itself once, ever, in a session someone is at, while some emoji has no context yet.
    const all = Object.values(await read($, emojis))
    if (e.isInteractive && !(await $.store.get(AUTO_OPENED)) && all.some(emoji => !emoji.use)) {
      await $.store.set(AUTO_OPENED, true)
      void $.ui.open({ id: TEACH_PANE, title: 'Teach emoji' })
    }
    return next(e)
  })

  on('tool.call', { tool: 'mcp__inline-emoji__open_emoji_teacher' }, async $ => {
    await $.ui.open({ id: TEACH_PANE, title: 'Teach emoji', focus: true })
    return { result: 'Opened the emoji teaching pane.' }
  })

  on('tool.call', { tool: 'mcp__inline-emoji__open_emoji_rules' }, async $ => {
    await showRules($)
    return { result: 'Opened the emoji rules viewer.' }
  })

  on('command.run', { command: 'emoji-rules' }, async $ => {
    await showRules($)
    return { text: 'Opened the emoji rules viewer.' }
  })

  on('ui.render', { component: 'Pane', requestId: 'emoji-rules' }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const view = { ...elements, Svg: 'Svg' in elements ? elements.Svg : undefined }
    return drawRulesPane(view, await read($, rules), await read($, emojis), () => loadRules($))
  })

  on('command.run', { command: 'emoji-reload' }, async $ => {
    const { path, count, skipped } = await reload($, options)
    const lines = [`Loaded ${count} emoji from ${path}.`]
    if (skipped.length) lines.push(`Skipped: ${skipped.join('; ')}.`)
    return { text: lines.join('\n') }
  })

  on('command.run', { command: 'emoji-teach' }, async $ => {
    await $.ui.open({ id: TEACH_PANE, title: 'Teach emoji', focus: true })
    return { text: 'Opened the emoji teaching pane.' }
  })

  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    const all = Object.values(await read($, emojis))
    const isDrawn = e.surfaces.some(s => SVG_SURFACES.includes(s))
    if (!all.length || !isDrawn) return result
    const section = { id: 'inline-emoji:list', scope: 'session', text: emojiList(all) } as const
    return { ...result, sections: [...result.sections, section] }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface === 'terminal' || e.props.isSummary) return next(e)
    const known = await read($, emojis)
    if (!hasEmoji(e.props.text, known)) return next(e)
    return drawReply($.ui.resolve(e), e.props.text, known)
  })

  on('ui.render', { component: 'Pane', requestId: TEACH_PANE }, async ($, e) => {
    if (e.surface === 'mobile') {
      const { Text } = $.ui.resolve(e)
      return <Text>The mobile app has no text fields yet: teach emoji from the desktop app.</Text>
    }
    const elements = $.ui.resolve(e)
    const view = {
      all: Object.values(await read($, emojis)),
      // Not `drafts`: a drawing that read it would redraw on every keystroke and move the person's cursor.
      drafts: await read($, shownDrafts),
      pageStart: await read($, pageStart),
      isUndescribedOnly: await read($, isUndescribedOnly),
      notice: await read($, notice),
    }
    const actions = {
      draft: (file: string, change: EmojiDraft) => updateDraft($, file, change),
      submit: async (file: string, change: EmojiDraft) => {
        await updateDraft($, file, change)
        await save($, file)
        await showDrafts($)
      },
      // A page turn saves what is typed on the page first, and stays put when a name will not do. The new page
      // starts at `anchor`, wherever it now is, since saved emoji leave the filtered list.
      goTo: async (anchor: string | undefined, files: string[]) => {
        const isSaved = await saveAll($, files)
        await showDrafts($)
        if (!isSaved || anchor === undefined) return
        const all = Object.values(await read($, emojis))
        const at = listed(all, await read($, isUndescribedOnly)).findIndex(emoji => emoji.file === anchor)
        if (at >= 0) await update($, pageStart, () => at)
      },
      toggleFilter: async () => {
        await showDrafts($)
        await update($, isUndescribedOnly, value => !value)
        await update($, pageStart, () => 0)
      },
      finish: () => finish($),
    }
    return drawTeachPane({ ...elements, Svg: 'Svg' in elements ? elements.Svg : undefined }, view, actions)
  })

  // Moving the focus off a field saves that field's emoji.
  on('ui.focus', { component: 'Pane', requestId: 'emoji-teach' }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny !== undefined) return result
    const left = /^(?:name|use):(.+)$/.exec(await read($, focused))?.[1]
    await update($, focused, () => e.element ?? '')
    if (left && (await read($, drafts))[left]) {
      await save($, left)
      await showDrafts($)
    }
    return result
  })

  // Closing the pane saves what is typed; an emoji whose name will not do keeps its draft.
  on('ui.close', { id: 'emoji-teach' }, async ($, e, next) => {
    await saveAll($)
    await showDrafts($)
    await update($, focused, () => '')
    return next(e)
  })

  // Ending the session with the pane open saves what is typed in it.
  on('session.end', async ($, e, next) => {
    await saveAll($)
    return next(e)
  })
}

// Reads the rules again and opens the viewer.
async function showRules($: EngineInterface) {
  await loadRules($)
  await $.ui.open({ id: RULES_PANE, title: 'Emoji rules', focus: true })
}

async function loadRules($: EngineInterface) {
  const loaded = await readRules($)
  await update($, rules, () => loaded)
}

// The Emoji section of the output style the settings choose, from the project's or the person's
// .claude/output-styles folder, as the engine looks for styles.
async function readRules($: EngineInterface): Promise<EmojiRules> {
  const none = { intro: '', groups: [] }
  const settings = await $.settings.read({})
  const style = typeof settings.outputStyle === 'string' ? settings.outputStyle : undefined
  if (!style) return { ...none, problem: 'No output style is chosen in the settings.' }
  for (const dir of [STYLE_FOLDER, `${await homeFolder($)}/${STYLE_FOLDER}`]) {
    for (const file of await $.fs.list(dir).catch(() => [])) {
      if (!file.name.endsWith('.md') || (await kindOf($, dir, file)).kind !== 'file') continue
      const guide = `${dir}/${file.name}`
      const text = await $.fs.read(guide)
      // A style without a name in its frontmatter is named after its file.
      if ((frontmatterName(text) ?? file.name.slice(0, -'.md'.length)) !== style) continue
      const section = emojiSection(text)
      if (section === undefined) return { ...none, style, guide, problem: 'This output style has no "## Emoji" section.' }
      return { style, guide, ...parseEmojiRules(section) }
    }
  }
  return { ...none, style, problem: `No file in ${STYLE_FOLDER} is the output style "${style}".` }
}

async function reload($: EngineInterface, options: Record<string, unknown>) {
  const path = await emojiFolder($, options)
  const { loaded, skipped } = await loadEmojis($, path)
  await update($, folder, () => path)
  await update($, emojis, () => loaded)
  return { path, count: Object.keys(loaded).length, skipped }
}

async function homeFolder($: EngineInterface): Promise<string> {
  return (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '.'
}

// The folder the options name, a leading ~ standing for the home folder, else ~/.claude/emojis.
async function emojiFolder($: EngineInterface, options: Record<string, unknown>): Promise<string> {
  const chosen = typeof options.folder === 'string' ? options.folder.trim() : ''
  if (/^~(?:[\\/]|$)/.test(chosen)) return `${await homeFolder($)}${chosen.slice(1)}`
  return chosen || `${await homeFolder($)}/.claude/emojis`
}

// A listed entry's kind and size, followed through a symbolic link.
async function kindOf($: EngineInterface, dir: string, entry: FsEntry): Promise<Pick<FsEntry, 'kind' | 'size'>> {
  if (!entry.isLink) return entry
  return $.fs.stat(`${dir}/${entry.name}`).catch(() => ({ kind: 'other' as const, size: 0 }))
}

// emojis.json's text: '{}' when there is none, undefined when it is there but cannot be read.
async function readEntries($: EngineInterface, path: string): Promise<string | undefined> {
  try {
    return await $.fs.read(path)
  } catch {
    return (await $.fs.exists(path)) ? undefined : '{}'
  }
}

// Every usable image in the folder, by name, and why the others were left out.
async function loadEmojis($: EngineInterface, path: string) {
  const loaded: Record<string, Emoji> = {}
  const skipped: string[] = []
  let entriesListed: FsEntry[] = []
  try {
    entriesListed = await $.fs.list(path)
  } catch (error) {
    skipped.push(`${path} (could not be read: ${reason(error)})`)
  }
  const text = await readEntries($, `${path}/${ENTRIES_FILE}`)
  if (text === undefined) skipped.push(`${ENTRIES_FILE} (could not be read)`)
  const { entries, problem } = parseEntries(text ?? '{}')
  if (problem) skipped.push(problem)
  for (const entry of entriesListed) {
    const file = { ...entry, ...(await kindOf($, path, entry)) }
    const dot = file.name.lastIndexOf('.')
    const ext = file.name.slice(dot + 1).toLowerCase()
    const stem = file.name.slice(0, dot)
    const mime = MIME_TYPES[ext]
    if (file.kind !== 'file' || dot <= 0 || !(mime || ext === 'svg')) continue
    const name = (entries[stem]?.name ?? stem).toLowerCase()
    const holder = loaded[name]
    if (!NAME.test(name)) {
      skipped.push(`${file.name} (a name is 2-32 letters, digits or underscores)`)
      continue
    }
    if (holder) {
      skipped.push(`${file.name} (:${name}: is already ${holder.file})`)
      continue
    }
    const tooLarge = `${file.name} (too large; save it at 64 px or smaller)`
    if (wrappedLength(mime, file.size) > SVG_LIMIT) {
      skipped.push(tooLarge)
      continue
    }
    let base64 = ''
    let source: string
    try {
      base64 = mime ? (await $.fs.read(`${path}/${file.name}`, { as: 'bytes' })).base64 : ''
      source = mime ? wrapImage(mime, base64) : await $.fs.read(`${path}/${file.name}`)
    } catch (error) {
      skipped.push(`${file.name} (could not be read: ${reason(error)})`)
      continue
    }
    if (source.length > SVG_LIMIT) {
      skipped.push(tooLarge)
      continue
    }
    const isAnimated = ext === 'gif' || (ext === 'webp' && isAnimatedWebp(base64))
    const thumb = isAnimated ? await readThumb($, path, stem) : undefined
    if (thumb === null) skipped.push(`thumbs/${stem}.png (too large; save it at 64 px or smaller)`)
    loaded[name] = { name, file: stem, source, isAnimated, thumb: thumb ?? undefined, use: entries[stem]?.use }
  }
  return { loaded, skipped }
}

// thumbs/<file>.png as an SVG when the folder has one, or null when it is too large to draw.
async function readThumb($: EngineInterface, path: string, stem: string): Promise<string | null | undefined> {
  const bytes = await $.fs.read(`${path}/thumbs/${stem}.png`, { as: 'bytes' }).catch(() => undefined)
  if (!bytes) return undefined
  const thumb = wrapImage('image/png', bytes.base64)
  return thumb.length > SVG_LIMIT ? null : thumb
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function updateDraft($: EngineInterface, file: string, change: EmojiDraft) {
  await update($, drafts, all => ({ ...all, [file]: { ...all[file], ...change } }))
}

// Lets the pane draw the drafts as typed so far.
async function showDrafts($: EngineInterface) {
  const typed = await read($, drafts)
  await update($, shownDrafts, () => typed)
}

// Saves one emoji's typed name and context to emojis.json; false, with the reason in the pane's notice, when the
// name will not do or the file cannot be read or written.
async function save($: EngineInterface, file: string): Promise<boolean> {
  const all = await read($, emojis)
  const emoji = Object.values(all).find(one => one.file === file)
  if (!emoji) return true
  const draft = (await read($, drafts))[file] ?? {}
  const name = (draft.name ?? emoji.name).trim().toLowerCase()
  const use = (draft.use ?? emoji.use ?? '').trim()
  const holder = all[name]
  if (!NAME.test(name)) {
    await update($, notice, () => `Not saved: :${name}: (for ${file}) is not a name; use 2-32 letters, digits or underscores.`)
    return false
  }
  if (holder && holder.file !== file) {
    await update($, notice, () => `Not saved: :${name}: (for ${file}) is already the name of ${holder.file}.`)
    return false
  }
  const path = `${await read($, folder)}/${ENTRIES_FILE}`
  const text = await readEntries($, path)
  if (text === undefined) {
    await update($, notice, () => `Not saved: ${path} could not be read.`)
    return false
  }
  const { raw, problem } = parseEntries(text)
  if (problem) {
    await update($, notice, () => `Not saved: ${problem}.`)
    return false
  }
  try {
    await $.fs.write(path, withEntry(raw, file, { name: name === file.toLowerCase() ? undefined : name, use }))
  } catch (error) {
    await update($, notice, () => `Not saved: ${path} could not be written (${reason(error)}).`)
    return false
  }
  await update($, emojis, current => {
    const { [emoji.name]: _, ...rest } = current
    return { ...rest, [name]: { ...emoji, name, use: use || undefined } }
  })
  await update($, drafts, current => {
    const { [file]: _, ...rest } = current
    return rest
  })
  await update($, notice, () => `Saved :${name}:.`)
  return true
}

// Saves the emoji with something typed, of `files` or all; false once one will not save, the reason in the
// pane's notice.
async function saveAll($: EngineInterface, files?: string[]): Promise<boolean> {
  let isSaved = true
  for (const file of Object.keys(await read($, drafts))) {
    if (!files || files.includes(file)) isSaved = (await save($, file)) && isSaved
  }
  return isSaved
}

// Saves what is still typed, closes the pane and asks Claude to merge the contexts into the voice guide.
async function finish($: EngineInterface) {
  if (!(await saveAll($))) return
  const path = `${await read($, folder)}/${ENTRIES_FILE}`
  await $.ui.close({ id: TEACH_PANE })
  await $.prompt.submit({
    text: `I finished describing my emoji in the teaching pane. Read the contexts in ${path} and merge them into my output style's voice guide.`,
  })
}

function emojiList(all: Emoji[]): string {
  return [
    '# Custom emoji',
    "The person has custom emoji, which their app draws as pictures in the line wherever a reply writes `:name:`, as Discord does. Use them where they fit, in the voice the person's output style asks for, and write only these names, never inside code or code blocks.",
    ...[...all].sort((a, b) => a.name.localeCompare(b.name)).map(e => `- :${e.name}:${e.use ? ` (use it when ${e.use})` : ''}`),
  ].join('\n')
}
