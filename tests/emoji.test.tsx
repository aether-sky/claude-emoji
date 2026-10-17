import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const FOLDER = 'C:/home/.claude/emojis'
// A 1x1 PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
// The start of an animated WebP: RIFF, VP8X, then an ANIM chunk.
const ANIMATED_WEBP = 'UklGRkAAAABXRUJQVlA4WAoAAAASAAAAPwAAPwAAQU5JTQYAAAAAAAAAAAA='

type Files = Record<string, { text?: string; base64?: string }>
type Piece = { type: string }

// The engine beneath the plugin: a home folder holding `files` (written files land there too), a command
// registry, panes, submitted prompts, and the engine's own drawing of a reply as a Text reading "engine".
function engine(on: On, files: Files) {
  const seen = { prompts: [] as string[], closed: [] as string[], opened: [] as string[] }
  mock.env(on, { USERPROFILE: 'C:/home' })
  mock.store(on)
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__discord-emoji__${e.name}` } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  // The engine hands paths on in the platform's spelling.
  const slashed = (path: string) => path.replaceAll('\\', '/')
  const nameIn = (path: string) => {
    const at = slashed(path)
    if (!at.startsWith(`${FOLDER}/`)) throw new Error(`outside the folder: ${path}`)
    return at.slice(FOLDER.length + 1)
  }
  on('fs.list', ($, e) => {
    if (slashed(e.path) !== FOLDER) throw new Error(`no folder ${e.path}`)
    const here = Object.keys(files).filter(name => !name.includes('/'))
    return { value: here.map(name => ({ name, kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false })) }
  })
  on('fs.read', ($, e) => {
    const file = files[nameIn(e.path)]
    if (!file) throw new Error(`no file ${e.path}`)
    return { value: e.as === 'bytes' ? { base64: file.base64 ?? '' } : (file.text ?? '') }
  })
  on('fs.write', ($, e) => {
    files[nameIn(e.path)] = { text: e.text }
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

async function start($: Engine) {
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
}

const reply = (text: string) => ({ component: 'AssistantMessage' as const, props: { text, isFirstOfReply: true } })
const PANE = {
  component: 'Pane' as const,
  requestId: 'emoji-teach',
  props: { title: 'Teach emoji', isFocused: true, bodyColumns: 80, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} },
}
const entries = (files: Files) => JSON.parse(files['emojis.json']?.text ?? '{}')

describe('drawing replies', () => {
  test('a paragraph naming a known emoji draws its picture between its words on desktop', async ($, on) => {
    engine(on, { 'hmph.png': { base64: PNG } })
    await start($)
    const ui = await $.ui.mount({ plugin: 'discord-emoji', surface: 'desktop', ...reply('I am so :hmph: about it.') })
    const svg = await ui.find({ type: 'Svg' })
    expect(svg?.props.alt).toBe(':hmph:')
    expect(String(svg?.props.source)).toContain('data:image/png;base64,')
    const row = (await ui.findAll({ type: 'Box' })).find(box => box.props.flexWrap === 'wrap')
    const pieces = (row?.children ?? []) as Piece[]
    expect(pieces.map(p => p.type)).toEqual(['Text', 'Text', 'Text', 'Text', 'Svg', 'Text', 'Text'])
    const words = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')
    expect(words.replaceAll('\u00A0', ' ')).toBe('I am so  about it.')
  })

  test('the terminal and unknown names keep the engine drawing', async ($, on) => {
    engine(on, { 'hmph.png': { base64: PNG } })
    await start($)
    for (const [surface, text] of [['terminal', 'so :hmph:'], ['desktop', 'so :nope:']] as const) {
      const ui = await $.ui.mount({ plugin: 'discord-emoji', surface, ...reply(text) })
      expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
    }
  })

  test('paragraphs without emoji, and code, stay markdown', async ($, on) => {
    engine(on, { 'hmph.png': { base64: PNG } })
    await start($)
    const text = '# Title\n\nwow :hmph:\n\n```\n:hmph:\n```\n\n- one\n- two'
    const ui = await $.ui.mount({ plugin: 'discord-emoji', surface: 'desktop', ...reply(text) })
    const markdown = await ui.findAll({ type: 'Markdown' })
    expect(markdown.map(m => m.props.text)).toEqual(['# Title', '```\n:hmph:\n```\n\n- one\n- two'])
    expect(await ui.findAll({ type: 'Svg' })).toHaveLength(1)
  })

  test('emoji inside bold, links and list items stay in their line, and animated ones move', async ($, on) => {
    engine(on, { 'hmph.png': { base64: PNG }, 'yay.gif': { base64: PNG }, 'wave.webp': { base64: ANIMATED_WEBP } })
    await start($)
    const text = '- **so :hmph:** and [a :yay: link](https://example.com)\n- plain `:hmph:` code :wave:'
    const ui = await $.ui.mount({ plugin: 'discord-emoji', surface: 'desktop', ...reply(text) })
    const rows = (await ui.findAll({ type: 'Box' })).filter(box => box.props.flexWrap === 'wrap')
    expect(rows).toHaveLength(2)
    expect((await ui.find({ type: 'Text', text: 'so' }))?.props.bold).toBe(true)
    const links = await ui.findAll({ type: 'Link' })
    expect(links.map(l => l.props.href)).toEqual(['https://example.com', 'https://example.com'])
    const svgs = await ui.findAll({ type: 'Svg' })
    expect(svgs.map(s => [s.props.alt, s.props.isInteractive])).toEqual([
      [':hmph:', undefined],
      [':yay:', true],
      [':wave:', true],
    ])
    expect((await ui.find({ type: 'Text', text: /:hmph:/ }))?.props.color).toBe('suggestion')
  })

  test('a paragraph of only emoji draws them large', async ($, on) => {
    engine(on, { 'hmph.png': { base64: PNG } })
    await start($)
    const big = await $.ui.mount({ plugin: 'discord-emoji', surface: 'desktop', ...reply(':hmph: :hmph:') })
    const small = await $.ui.mount({ plugin: 'discord-emoji', surface: 'desktop', ...reply('ok :hmph:') })
    expect((await big.find({ type: 'Svg' }))?.props.width).toBe(48)
    expect((await small.find({ type: 'Svg' }))?.props.width).toBe(22)
  })

  test('an emoji renamed in emojis.json answers to its new name', async ($, on) => {
    engine(on, { '1198057303186870303.png': { base64: PNG }, 'emojis.json': { text: '{"1198057303186870303": {"name": "smoke"}}' } })
    await start($)
    const ui = await $.ui.mount({ plugin: 'discord-emoji', surface: 'desktop', ...reply('ok :smoke:') })
    expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe(':smoke:')
  })
})

describe('the model and the folder', () => {
  test('the system prompt lists the emoji and when to use them where a desktop draws, and not on the terminal alone', async ($, on) => {
    engine(on, { 'hmph.png': { base64: PNG }, 'emojis.json': { text: '{"hmph": "annoyed pout"}' } })
    on('prompt.compose', () => ({ sections: [] }))
    await start($)
    const base = { model: 'm', promptModel: 'm', tools: [], outputStyle: null, traits: [] }
    const desktop = await $.prompt.compose({ ...base, surfaces: ['desktop'] })
    expect(desktop.sections.map(s => s.text).join('\n')).toContain(':hmph: (use it when annoyed pout)')
    const terminal = await $.prompt.compose({ ...base, surfaces: ['terminal'] })
    expect(terminal.sections).toHaveLength(0)
  })

  test('/emoji-reload names the files it could not use', async ($, on) => {
    engine(on, {
      'hmph.png': { base64: PNG },
      'Bad-Name.png': { base64: PNG },
      'huge.png': { base64: 'A'.repeat(140000) },
      'notes.txt': { text: 'x' },
    })
    await start($)
    const presentation = { isFullscreen: false, columns: 80 }
    const result = await $.command.run({ command: 'emoji-reload', args: '', origin: { kind: 'composer' }, presentation })
    expect(result.text).toContain('Loaded 1 emoji')
    expect(result.text).toContain('Bad-Name.png')
    expect(result.text).toContain('huge.png (too large')
    expect(result.text).not.toContain('notes.txt')
  })
})

describe('the teaching pane', () => {
  test('Enter in "use it when" saves the context to emojis.json and the model list', async ($, on) => {
    const files: Files = { 'hmph.png': { base64: PNG }, 'emojis.json': { text: '{"other": "kept"}' } }
    engine(on, files)
    on('prompt.compose', () => ({ sections: [] }))
    await start($)
    const ui = await $.ui.mount({ plugin: 'discord-emoji', surface: 'desktop', ...PANE })
    await ui.input({ key: 'use:hmph', text: 'something breaks and you laugh it off' })
    expect(entries(files)).toEqual({ hmph: { use: 'something breaks and you laugh it off' }, other: { use: 'kept' } })
    expect((await ui.find({ type: 'Text', text: /emoji have/ }))?.text).toContain('1 of 1')
    const base = { model: 'm', promptModel: 'm', tools: [], outputStyle: null, traits: [], surfaces: ['desktop'] as const }
    const composed = await $.prompt.compose({ ...base, surfaces: [...base.surfaces] })
    expect(composed.sections.map(s => s.text).join('\n')).toContain('laugh it off')
  })

  test('a rename to a bad or taken name is refused with a message and nothing saved', async ($, on) => {
    const files: Files = { 'hmph.png': { base64: PNG }, 'yay.png': { base64: PNG } }
    engine(on, files)
    await start($)
    const ui = await $.ui.mount({ plugin: 'discord-emoji', surface: 'desktop', ...PANE })
    await ui.input({ key: 'name:hmph', text: 'yay' })
    expect((await ui.find({ type: 'Text', text: /already/ }))?.text).toContain('yay')
    await ui.input({ key: 'name:hmph', text: 'no way' })
    expect(await ui.find({ type: 'Text', text: /is not a name/ })).toBeDefined()
    expect(files['emojis.json']).toBeUndefined()
  })

  test('Done saves what is still typed, closes the pane and asks Claude to merge the contexts', async ($, on) => {
    const files: Files = { 'hmph.png': { base64: PNG } }
    const seen = engine(on, files)
    await start($)
    const ui = await $.ui.mount({ plugin: 'discord-emoji', surface: 'desktop', ...PANE })
    await ui.input({ key: 'use:hmph', text: 'you are annoyed but cute about it', kind: 'change' })
    await ui.input({ key: 'name:hmph', text: 'pout', kind: 'change' })
    await ui.press({ key: 'done' })
    expect(entries(files)).toEqual({ hmph: { name: 'pout', use: 'you are annoyed but cute about it' } })
    expect(seen.closed).toEqual(['emoji-teach'])
    expect(seen.prompts).toHaveLength(1)
    expect(seen.prompts[0]).toContain('emojis.json')
  })

  test('the filter shows only the emoji without a context, six to a page', async ($, on) => {
    const names = ['aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg', 'hh']
    const files: Files = Object.fromEntries(names.map(n => [`${n}.png`, { base64: PNG }]))
    files['emojis.json'] = { text: '{"aa": "x"}' }
    engine(on, files)
    await start($)
    const ui = await $.ui.mount({ plugin: 'discord-emoji', surface: 'desktop', ...PANE })
    const keys = async () => (await ui.findAll({ type: 'Input' })).map(i => i.key).filter(k => k?.startsWith('use:'))
    expect(await keys()).toEqual(['use:aa', 'use:bb', 'use:cc', 'use:dd', 'use:ee', 'use:ff'])
    await ui.press({ key: 'filter' })
    expect(await keys()).toEqual(['use:bb', 'use:cc', 'use:dd', 'use:ee', 'use:ff', 'use:gg'])
    await ui.press({ key: 'next' })
    expect(await keys()).toEqual(['use:hh'])
  })

  test('the pane opens by itself once, ever, while some emoji has no context', async ($, on) => {
    const seen = engine(on, { 'hmph.png': { base64: PNG } })
    await start($)
    await start($)
    expect(seen.opened).toEqual(['emoji-teach'])
  })

  test('Claude can open the pane with its tool', async ($, on) => {
    const seen = engine(on, { 'hmph.png': { base64: PNG }, 'emojis.json': { text: '{"hmph": "x"}' } })
    await start($)
    expect(seen.opened).toEqual([])
    const call = await $.tool.call({ tool: 'mcp__discord-emoji__open_emoji_teacher', input: {} })
    expect(call.result).toBe('Opened the emoji teaching pane.')
    expect(seen.opened).toEqual(['emoji-teach'])
  })

  test('typing does not redraw the field under the cursor, and a page turn saves it', async ($, on) => {
    const names = ['aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg']
    const files: Files = Object.fromEntries(names.map(n => [`${n}.png`, { base64: PNG }]))
    engine(on, files)
    await start($)
    const ui = await $.ui.mount({ plugin: 'discord-emoji', surface: 'desktop', ...PANE })
    for (const typed of ['h', 'he', 'hey']) await ui.input({ key: 'use:aa', text: typed, kind: 'change' })
    expect((await ui.find({ key: 'use:aa' }))?.props.value).toBe('')
    await ui.press({ key: 'next' })
    expect(entries(files)).toEqual({ aa: { use: 'hey' } })
    expect(await ui.find({ key: 'use:gg' })).toBeDefined()
    await ui.press({ key: 'back' })
    expect((await ui.find({ key: 'use:aa' }))?.props.value).toBe('hey')
  })

  test('a page turn stays on the page when a typed name will not do', async ($, on) => {
    const names = ['aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg']
    const files: Files = Object.fromEntries(names.map(n => [`${n}.png`, { base64: PNG }]))
    engine(on, files)
    await start($)
    const ui = await $.ui.mount({ plugin: 'discord-emoji', surface: 'desktop', ...PANE })
    await ui.input({ key: 'name:aa', text: 'no way', kind: 'change' })
    await ui.press({ key: 'next' })
    expect(await ui.find({ key: 'use:aa' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /is not a name/ })).toBeDefined()
    expect(files['emojis.json']).toBeUndefined()
  })

  test('moving the focus off a field saves it', async ($, on) => {
    const files: Files = { 'aa.png': { base64: PNG }, 'bb.png': { base64: PNG } }
    engine(on, files)
    on('ui.focus', () => ({}))
    await start($)
    const ui = await $.ui.mount({ plugin: 'discord-emoji', surface: 'desktop', ...PANE })
    const focus = (element: string) =>
      $.ui.focus({ component: 'Pane', requestId: 'emoji-teach', plugin: 'discord-emoji', element, origin: { kind: 'person' } })
    await focus('use:aa')
    await ui.input({ key: 'use:aa', text: 'hi', kind: 'change' })
    expect(files['emojis.json']).toBeUndefined()
    await focus('name:bb')
    expect(entries(files)).toEqual({ aa: { use: 'hi' } })
  })

  test('the pane shows an animated emoji by its still thumbnail and a still one by its picture', async ($, on) => {
    engine(on, { 'wave.webp': { base64: ANIMATED_WEBP }, 'thumbs/wave.png': { base64: PNG }, 'hmph.png': { base64: PNG } })
    await start($)
    const ui = await $.ui.mount({ plugin: 'discord-emoji', surface: 'desktop', ...PANE })
    const sources = Object.fromEntries((await ui.findAll({ type: 'Svg' })).map(svg => [svg.props.alt, String(svg.props.source)]))
    expect(sources[':wave:']).toContain('data:image/png;base64,')
    expect(sources[':hmph:']).toContain('data:image/png;base64,')
    const reply = await $.ui.mount({ plugin: 'discord-emoji', surface: 'desktop', component: 'AssistantMessage', props: { text: 'hi :wave:', isFirstOfReply: true } })
    expect(String((await reply.find({ type: 'Svg' }))?.props.source)).toContain('data:image/webp;base64,')
  })
})

