import { describe, expect, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

import { wrapImage } from '../hooks/folder'
import { ANIMATED_WEBP, ANIMATED_WEBP_WITH_ICC, COMMAND, PNG, engine, pane, start } from './fake-engine'
import type { Files } from './fake-engine'

type Piece = { type: string }

const NBSP = '\u00A0'
const reply = (text: string) => ({ component: 'AssistantMessage' as const, props: { text, isFirstOfReply: true } })
const PANE = pane('emoji-teach')
const entries = (files: Files) => JSON.parse(files['emojis.json']?.text ?? '{}')
const pngs = (names: string[]): Files => Object.fromEntries(names.map(n => [`${n}.png`, { base64: PNG }]))
const COMPOSE = { model: 'm', promptModel: 'm', tools: [], outputStyle: null, traits: [] }
// The most source an Svg element takes (SvgProps).
const ENGINE_SVG_LIMIT = 131072

describe('drawing replies', () => {
  test('a paragraph naming a known emoji draws its picture between its words on desktop', async ($, on) => {
    engine(on, { 'hmph.png': { base64: PNG } })
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...reply('I am so :hmph: about it.') })
    const svg = await ui.find({ type: 'Svg' })
    expect(svg?.props.alt).toBe(':hmph:')
    expect(String(svg?.props.source)).toContain('data:image/png;base64,')
    const row = (await ui.findAll({ type: 'Box' })).find(box => box.props.flexWrap === 'wrap')
    const pieces = (row?.children ?? []) as Piece[]
    expect(pieces.map(p => p.type)).toEqual(['Text', 'Text', 'Text', 'Box', 'Text', 'Text'])
    const words = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')
    expect(words.replaceAll(NBSP, ' ')).toBe('I am so  about it.')
  })

  test('the space after a word or emoji ends it, so a wrapped line never starts with a space', async ($, on) => {
    engine(on, { 'hmph.png': { base64: PNG } })
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...reply('one two :hmph: three') })
    const words = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(words.filter(word => word.startsWith(NBSP))).toEqual([NBSP])
    const spaced = (await ui.findAll({ type: 'Box' })).find(box => (box.children as Piece[]).some(p => p.type === 'Svg'))
    expect((spaced?.children as Piece[]).map(p => p.type)).toEqual(['Svg', 'Text'])
  })

  test('the terminal and unknown names keep the engine drawing', async ($, on) => {
    engine(on, { 'hmph.png': { base64: PNG } })
    await start($)
    for (const [surface, text] of [['terminal', 'so :hmph:'], ['desktop', 'so :nope:']] as const) {
      const ui = await $.ui.mount({ plugin: 'inline-emoji', surface, ...reply(text) })
      expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
    }
  })

  test('paragraphs without emoji, and code, stay markdown', async ($, on) => {
    engine(on, { 'hmph.png': { base64: PNG } })
    await start($)
    const text = '# Title\n\nwow :hmph:\n\n```\n:hmph:\n```\n\n- one\n- two'
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...reply(text) })
    const markdown = await ui.findAll({ type: 'Markdown' })
    expect(markdown.map(m => m.props.text)).toEqual(['# Title', '```\n:hmph:\n```\n\n- one\n- two'])
    expect(await ui.findAll({ type: 'Svg' })).toHaveLength(1)
  })

  test('a table holding an emoji stays a markdown table', async ($, on) => {
    engine(on, { 'hmph.png': { base64: PNG } })
    await start($)
    const table = '| step | ok |\n|---|---|\n| build | :hmph: |'
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...reply(`Results :hmph:\n\n${table}`) })
    expect((await ui.findAll({ type: 'Markdown' })).map(m => m.props.text)).toEqual([table])
  })

  test('an emoji on a line touching a code fence still draws, and the fence stays code', async ($, on) => {
    engine(on, { 'hmph.png': { base64: PNG } })
    await start($)
    const text = 'Here :hmph: is code:\n```bash\npnpm test\n```\nAll green :hmph:'
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...reply(text) })
    expect(await ui.findAll({ type: 'Svg' })).toHaveLength(2)
    expect((await ui.findAll({ type: 'Markdown' })).map(m => m.props.text)).toEqual(['```bash\npnpm test\n```'])
  })

  test('a code block indented under a list item with an emoji stays a fenced block', async ($, on) => {
    engine(on, { 'hmph.png': { base64: PNG } })
    await start($)
    const text = '- Parent\n  - Child :hmph:\n\n    ```bash\n    pnpm test\n    ```\n\n- Next'
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...reply(text) })
    expect((await ui.findAll({ type: 'Markdown' })).map(m => m.props.text)).toEqual(['```bash\npnpm test\n```\n\n- Next'])
  })

  test('emoji inside bold, links and list items stay in their line, and animated ones move', async ($, on) => {
    engine(on, { 'hmph.png': { base64: PNG }, 'yay.gif': { base64: PNG }, 'wave.webp': { base64: ANIMATED_WEBP } })
    await start($)
    const text = '- **so :hmph:** and [a :yay: link](https://example.com)\n- plain `:hmph:` code :wave:'
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...reply(text) })
    const rows = (await ui.findAll({ type: 'Box' })).filter(box => box.props.flexWrap === 'wrap')
    expect(rows).toHaveLength(2)
    expect((await ui.find({ type: 'Text', text: /^so/ }))?.props.bold).toBe(true)
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

  test('link text keeps its bold, and a link that is not https stays clickable as markdown', async ($, on) => {
    engine(on, { 'hmph.png': { base64: PNG } })
    await start($)
    const text = 'See [**Docs**](https://example.com) and http://localhost:5173 :hmph:'
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...reply(text) })
    expect((await ui.find({ type: 'Link' }))?.props.href).toBe('https://example.com')
    expect((await ui.find({ type: 'Text', text: /^Docs/ }))?.props.bold).toBe(true)
    expect((await ui.find({ type: 'Markdown' }))?.props.text).toContain('](<http://localhost:5173>)')
  })

  test('***bold italic*** draws bold and italic with no asterisks left', async ($, on) => {
    engine(on, { 'hmph.png': { base64: PNG } })
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...reply('***Important*** :hmph:') })
    const word = await ui.find({ type: 'Text', text: /Important/ })
    expect([word?.props.bold, word?.props.italic, word?.text.includes('*')]).toEqual([true, true, false])
    expect(await ui.find({ type: 'Text', text: /\*/ })).toBeUndefined()
  })

  test('a paragraph of only emoji draws them large', async ($, on) => {
    engine(on, { 'hmph.png': { base64: PNG } })
    await start($)
    const big = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...reply(':hmph: :hmph:') })
    const small = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...reply('ok :hmph:') })
    expect((await big.find({ type: 'Svg' }))?.props.width).toBe(48)
    expect((await small.find({ type: 'Svg' }))?.props.width).toBe(22)
  })

  test('an emoji renamed in emojis.json answers to its new name', async ($, on) => {
    engine(on, { 'party-cat.png': { base64: PNG }, 'emojis.json': { text: '{"party-cat": {"name": "partycat"}}' } })
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...reply('ok :partycat:') })
    expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe(':partycat:')
  })
})

describe('the model and the folder', () => {
  test('the system prompt lists the emoji and when to use them where pictures draw, and not on the terminal alone', async ($, on) => {
    engine(on, { 'hmph.png': { base64: PNG }, 'emojis.json': { text: '{"hmph": "annoyed pout"}' } })
    on('prompt.compose', () => ({ sections: [] }))
    await start($)
    for (const surface of ['desktop', 'mobile', 'vscode'] as const) {
      const composed = await $.prompt.compose({ ...COMPOSE, surfaces: [surface] })
      expect(composed.sections.map(s => s.text).join('\n')).toContain(':hmph: (use it when annoyed pout)')
    }
    const terminal = await $.prompt.compose({ ...COMPOSE, surfaces: ['terminal'] })
    expect(terminal.sections).toHaveLength(0)
  })

  test('/emoji-reload names the files it could not use', async ($, on) => {
    engine(on, {
      'hmph.png': { base64: PNG },
      'hmph.gif': { base64: PNG },
      'Bad-Name.png': { base64: PNG },
      'huge.png': { base64: 'A'.repeat(140000) },
      'notes.txt': { text: 'x' },
      'emojis.json': { text: '{' },
    })
    await start($)
    const result = await $.command.run({ command: 'emoji-reload', ...COMMAND })
    for (const named of ['hmph.gif', 'Bad-Name.png', 'huge.png', 'emojis.json']) expect(result.text).toContain(named)
    expect(result.text).not.toContain('notes.txt')
  })

  test('an unreadable image, or one over the engine\'s read limit, leaves the others loaded', async ($, on) => {
    engine(on, {
      'hmph.png': { base64: PNG },
      'busy.png': { base64: PNG, isUnreadable: true },
      'giant.gif': { base64: 'A'.repeat(6_000_000) },
    })
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...reply('ok :hmph:') })
    expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe(':hmph:')
    const result = await $.command.run({ command: 'emoji-reload', ...COMMAND })
    for (const named of ['busy.png', 'giant.gif']) expect(result.text).toContain(named)
  })

  test('an image whose picture is exactly at the size limit loads, and one just over it does not', async ($, on) => {
    const fits = Math.floor((ENGINE_SVG_LIMIT - wrapImage('image/png', '').length) / 4) * 4
    engine(on, { 'atlimit.png': { base64: 'A'.repeat(fits) }, 'overlimit.png': { base64: 'A'.repeat(fits + 4) } })
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...reply('a :atlimit: b :overlimit:') })
    expect((await ui.findAll({ type: 'Svg' })).map(svg => svg.props.alt)).toEqual([':atlimit:'])
  })

  test('an SVG emoji is drawn from its own markup', async ($, on) => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4"/></svg>'
    engine(on, { 'dot.svg': { text: svg } })
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...reply('ok :dot:') })
    expect((await ui.find({ type: 'Svg' }))?.props.source).toBe(svg)
  })

  test('emojis.json saved with a byte order mark is read', async ($, on) => {
    engine(on, { 'party-cat.png': { base64: PNG }, 'emojis.json': { text: '\uFEFF{"party-cat": {"name": "partycat"}}' } })
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...reply('ok :partycat:') })
    expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe(':partycat:')
  })

  test('a symbolic link to an image loads like the image', async ($, on) => {
    engine(on, { 'linked.png': { base64: PNG, isLink: true } })
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...reply('ok :linked:') })
    expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe(':linked:')
  })

  test('an animated WebP with a colour profile moves', async ($, on) => {
    engine(on, { 'wave.webp': { base64: ANIMATED_WEBP_WITH_ICC } })
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...reply('ok :wave:') })
    expect((await ui.find({ type: 'Svg' }))?.props.isInteractive).toBe(true)
  })

  test('a folder option starting with ~ is under the home folder', { options: { folder: '~/.claude/emojis' } }, async ($, on) => {
    engine(on, { 'hmph.png': { base64: PNG } })
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...reply('ok :hmph:') })
    expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe(':hmph:')
  })

  test('/emoji-reload says when the folder cannot be read', { options: { folder: 'C:/nowhere' } }, async ($, on) => {
    engine(on, {})
    await start($)
    const result = await $.command.run({ command: 'emoji-reload', ...COMMAND })
    expect(result.text).toContain('C:/nowhere (could not be read')
  })
})

describe('the teaching pane', () => {
  const warning = async (ui: { findAll: (q: { type: 'Text' }) => Promise<{ text: string; props: { color?: unknown } }[]> }) =>
    (await ui.findAll({ type: 'Text' })).find(t => t.props.color === 'warning')?.text

  test('Enter in "use it when" saves the context to emojis.json and the model list', async ($, on) => {
    const files: Files = { 'hmph.png': { base64: PNG }, 'emojis.json': { text: '{"other": "kept"}' } }
    engine(on, files)
    on('prompt.compose', () => ({ sections: [] }))
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...PANE })
    await ui.input({ key: 'use:hmph', text: 'something breaks and you laugh it off' })
    expect(entries(files)).toEqual({ hmph: { use: 'something breaks and you laugh it off' }, other: 'kept' })
    const composed = await $.prompt.compose({ ...COMPOSE, surfaces: ['desktop'] })
    expect(composed.sections.map(s => s.text).join('\n')).toContain('laugh it off')
  })

  test('a save keeps what else emojis.json holds, as written', async ($, on) => {
    const kept = '{"hmph": {"source": "a server", "use": "pout"}, "old": 1, "zed": {"source": "a server", "use": "z"}}'
    const files: Files = { 'hmph.png': { base64: PNG }, 'emojis.json': { text: kept } }
    engine(on, files)
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...PANE })
    await ui.input({ key: 'use:hmph', text: 'grumpy' })
    expect(entries(files)).toEqual({ ...JSON.parse(kept), hmph: { source: 'a server', use: 'grumpy' } })
  })

  test('a broken emojis.json is never overwritten', async ($, on) => {
    const files: Files = { 'hmph.png': { base64: PNG }, 'emojis.json': { text: '{"other": "kept",}' } }
    engine(on, files)
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...PANE })
    await ui.input({ key: 'use:hmph', text: 'grumpy' })
    expect(files['emojis.json']?.text).toBe('{"other": "kept",}')
    expect(await warning(ui)).toContain('emojis.json')
  })

  test('an emojis.json that cannot be read for a moment is never overwritten', async ($, on) => {
    const files: Files = { 'hmph.png': { base64: PNG }, 'emojis.json': { text: '{"other": "kept"}', isUnreadable: true } }
    engine(on, files)
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...PANE })
    await ui.input({ key: 'use:hmph', text: 'grumpy' })
    expect(files['emojis.json']?.text).toBe('{"other": "kept"}')
    expect(await warning(ui)).toContain('emojis.json')
  })

  test('a failed write says so and keeps what was typed', async ($, on) => {
    const files: Files = { 'hmph.png': { base64: PNG }, 'emojis.json': { text: '{}', isReadOnly: true } }
    engine(on, files)
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...PANE })
    await ui.input({ key: 'use:hmph', text: 'grumpy' })
    expect(await warning(ui)).toContain('emojis.json')
    expect((await ui.find({ key: 'use:hmph' }))?.props.value).toBe('grumpy')
  })

  test('a rename to a bad or taken name is refused with a message and nothing saved', async ($, on) => {
    const files: Files = pngs(['hmph', 'yay'])
    engine(on, files)
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...PANE })
    await ui.input({ key: 'name:hmph', text: 'yay' })
    expect(await warning(ui)).toContain(':yay:')
    await ui.input({ key: 'name:hmph', text: 'no way' })
    expect(await warning(ui)).toContain(':no way:')
    expect(files['emojis.json']).toBeUndefined()
  })

  test('Done saves what is still typed, closes the pane and asks Claude to merge the contexts', async ($, on) => {
    const files: Files = { 'hmph.png': { base64: PNG } }
    const seen = engine(on, files)
    on('prompt.compose', () => ({ sections: [] }))
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...PANE })
    await ui.input({ key: 'use:hmph', text: 'you are annoyed but cute about it', kind: 'change' })
    await ui.input({ key: 'name:hmph', text: 'pout', kind: 'change' })
    await ui.press({ key: 'done' })
    expect(entries(files)).toEqual({ hmph: { name: 'pout', use: 'you are annoyed but cute about it' } })
    expect(seen.closed).toEqual(['emoji-teach'])
    expect(seen.prompts).toHaveLength(1)
    expect(seen.prompts[0]).toContain('emojis.json')
    const renamed = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...reply('ok :pout:') })
    expect((await renamed.find({ type: 'Svg' }))?.props.alt).toBe(':pout:')
    const composed = await $.prompt.compose({ ...COMPOSE, surfaces: ['desktop'] })
    expect(composed.sections.map(s => s.text).join('\n')).toContain(':pout:')
  })

  test('Done with a name that will not do keeps the pane open and asks Claude nothing', async ($, on) => {
    const files: Files = { 'hmph.png': { base64: PNG } }
    const seen = engine(on, files)
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...PANE })
    await ui.input({ key: 'name:hmph', text: 'no way', kind: 'change' })
    await ui.press({ key: 'done' })
    expect([seen.closed, seen.prompts, files['emojis.json']]).toEqual([[], [], undefined])
    expect(await warning(ui)).toContain(':no way:')
  })

  test('the filter shows only the emoji without a context, six to a page', async ($, on) => {
    const files = pngs(['aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg', 'hh'])
    files['emojis.json'] = { text: '{"aa": "x"}' }
    engine(on, files)
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...PANE })
    const keys = async () => (await ui.findAll({ type: 'Input' })).map(i => i.key).filter(k => k?.startsWith('use:'))
    expect(await keys()).toEqual(['use:aa', 'use:bb', 'use:cc', 'use:dd', 'use:ee', 'use:ff'])
    await ui.press({ key: 'filter' })
    expect(await keys()).toEqual(['use:bb', 'use:cc', 'use:dd', 'use:ee', 'use:ff', 'use:gg'])
    await ui.press({ key: 'next' })
    expect(await keys()).toEqual(['use:hh'])
  })

  test('with the filter on, Next after describing an emoji shows the very next one', async ($, on) => {
    const files = pngs(['aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg', 'hh', 'ii', 'jj', 'kk', 'll', 'mm'])
    engine(on, files)
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...PANE })
    await ui.press({ key: 'filter' })
    await ui.input({ key: 'use:ff', text: 'x', kind: 'change' })
    await ui.press({ key: 'next' })
    expect((await ui.findAll({ type: 'Input' })).map(i => i.key).find(k => k?.startsWith('use:'))).toBe('use:gg')
  })

  test('with the filter on, a row whose save failed stays to be fixed', async ($, on) => {
    engine(on, pngs(['aa', 'bb']))
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...PANE })
    await ui.press({ key: 'filter' })
    await ui.input({ key: 'name:aa', text: 'no way', kind: 'change' })
    await ui.input({ key: 'use:aa', text: 'x' })
    expect(await ui.find({ key: 'name:aa' })).toBeDefined()
  })

  test('the pane opens by itself once, ever, while some emoji has no context', async ($, on) => {
    const seen = engine(on, { 'hmph.png': { base64: PNG } })
    await start($)
    await start($)
    expect(seen.opened).toEqual(['emoji-teach'])
  })

  test('the pane does not open by itself again in a later session', async ($, on) => {
    const seen = engine(on, { 'hmph.png': { base64: PNG } }, { store: { teachPaneAutoOpened: true } })
    await start($)
    expect(seen.opened).toEqual([])
  })

  test('a session nobody is at, like claude -p, does not use up the pane opening by itself', async ($, on) => {
    const seen = engine(on, { 'hmph.png': { base64: PNG } })
    await start($, false)
    expect(seen.opened).toEqual([])
    await start($)
    expect(seen.opened).toEqual(['emoji-teach'])
  })

  test('Claude can open the pane with its tool', async ($, on) => {
    const seen = engine(on, { 'hmph.png': { base64: PNG }, 'emojis.json': { text: '{"hmph": "x"}' } })
    await start($)
    expect(seen.opened).toEqual([])
    await $.tool.call({ tool: 'mcp__inline-emoji__open_emoji_teacher', input: {} })
    expect(seen.opened).toEqual(['emoji-teach'])
  })

  test('typing does not redraw the pane, and a page turn saves it', async ($, on) => {
    const files = pngs(['aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg'])
    engine(on, files)
    // Each drawing of the pane reads the drafts it shows.
    let draws = 0
    on('state.get', ($, e, next) => {
      if (e.plugin === 'inline-emoji' && e.key === 'shownDrafts') draws += 1
      return next(e)
    })
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...PANE })
    const before = draws
    for (const typed of ['h', 'he', 'hey']) await ui.input({ key: 'use:aa', text: typed, kind: 'change' })
    expect(draws).toBe(before)
    await ui.press({ key: 'next' })
    expect(entries(files)).toEqual({ aa: { use: 'hey' } })
    expect(await ui.find({ key: 'use:gg' })).toBeDefined()
    await ui.press({ key: 'back' })
    expect((await ui.find({ key: 'use:aa' }))?.props.value).toBe('hey')
  })

  test('Back saves what is typed on the page', async ($, on) => {
    const files = pngs(['aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg'])
    engine(on, files)
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...PANE })
    await ui.press({ key: 'next' })
    await ui.input({ key: 'use:gg', text: 'last one', kind: 'change' })
    await ui.press({ key: 'back' })
    expect(entries(files)).toEqual({ gg: { use: 'last one' } })
    expect(await ui.find({ key: 'use:aa' })).toBeDefined()
  })

  test('a page turn stays on the page when a typed name will not do', async ($, on) => {
    const files = pngs(['aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg'])
    engine(on, files)
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...PANE })
    await ui.input({ key: 'name:aa', text: 'no way', kind: 'change' })
    await ui.press({ key: 'next' })
    expect(await ui.find({ key: 'use:aa' })).toBeDefined()
    expect(await warning(ui)).toContain(':no way:')
    expect(files['emojis.json']).toBeUndefined()
  })

  test('moving the focus off a field saves it', async ($, on) => {
    const files = pngs(['aa', 'bb'])
    engine(on, files)
    on('ui.focus', () => ({}))
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...PANE })
    const focus = (element: string) =>
      $.ui.focus({ component: 'Pane', requestId: 'emoji-teach', plugin: 'inline-emoji', element, origin: { kind: 'person' } })
    await focus('use:aa')
    await ui.input({ key: 'use:aa', text: 'hi', kind: 'change' })
    expect(files['emojis.json']).toBeUndefined()
    await focus('name:bb')
    expect(entries(files)).toEqual({ aa: { use: 'hi' } })
  })

  // A plugin beside the mod that closes the teaching pane on /close-teach, as the person's close mark would.
  const closer: Plugin = {
    name: 'closer',
    register: on => {
      on('command.run', { command: 'close-teach' }, async $ => {
        await $.ui.close({ id: 'emoji-teach' })
        return { text: '' }
      })
    },
  }

  test('closing the pane saves what is typed', { plugins: [closer] }, async ($, on) => {
    const files = pngs(['aa'])
    engine(on, files)
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...PANE })
    await ui.input({ key: 'use:aa', text: 'hi', kind: 'change' })
    await $.command.run({ command: 'close-teach', ...COMMAND })
    expect(entries(files)).toEqual({ aa: { use: 'hi' } })
  })

  test('ending the session with the pane open saves what is typed', async ($, on) => {
    const files = pngs(['aa'])
    engine(on, files)
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...PANE })
    await ui.input({ key: 'use:aa', text: 'hi', kind: 'change' })
    await $.session.end({ reason: 'other', sessionId: 's', resume: { id: 's' } })
    expect(entries(files)).toEqual({ aa: { use: 'hi' } })
  })

  test('the pane shows an animated emoji by its still thumbnail and a still one by its picture', async ($, on) => {
    engine(on, { 'wave.webp': { base64: ANIMATED_WEBP }, 'thumbs/wave.png': { base64: PNG }, 'hmph.png': { base64: PNG } })
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...PANE })
    const sources = Object.fromEntries((await ui.findAll({ type: 'Svg' })).map(svg => [svg.props.alt, String(svg.props.source)]))
    expect(sources[':wave:']).toContain('data:image/png;base64,')
    expect(sources[':hmph:']).toContain('data:image/png;base64,')
    const drawn = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...reply('hi :wave:') })
    expect(String((await drawn.find({ type: 'Svg' }))?.props.source)).toContain('data:image/webp;base64,')
  })

  test('a thumbnail too large to draw is left out, and the pane still draws', async ($, on) => {
    engine(on, { 'wave.gif': { base64: PNG }, 'thumbs/wave.png': { base64: 'A'.repeat(140000) } })
    await start($)
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...PANE })
    expect(String((await ui.find({ type: 'Svg' }))?.props.source)).toContain('data:image/gif;base64,')
    const result = await $.command.run({ command: 'emoji-reload', ...COMMAND })
    expect(result.text).toContain('thumbs/wave.png')
  })
})
