import { describe, expect, test } from 'claude-code/testing'

import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { COMMAND, PNG, engine, pane, start } from './fake-engine'
import type { Files, Setup } from './fake-engine'

const PANE = pane('emoji-rules')

const guide = (emoji: string, name = 'name: Test voice\n') => `---
${name}description: test style
---

Answer plainly.

## Emoji
Use them inline as \`:name:\`, one now and then.

${emoji}

## Notes
- Keep it short.
`

const RULES = `Good news:
- \`:tada:\` or \`:yay:\` something worked
- \`:cheer:\` a release went out

Bad news:
- \`:sulk:\` a test failed`

const FOLDER: Files = {
  'tada.png': { base64: PNG },
  'yay.png': { base64: PNG },
  'cheer.png': { base64: PNG },
  'sulk.png': { base64: PNG },
}

async function viewRules($: Engine, on: On, setup: Setup, files: Files = FOLDER) {
  engine(on, files, setup)
  await start($)
  await $.command.run({ command: 'emoji-rules', ...COMMAND })
  return $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...PANE })
}

// The pane's text pieces, in order.
const textsOf = async (ui: Awaited<ReturnType<typeof viewRules>>) => (await ui.findAll({ type: 'Text' })).map(t => t.text)
const titlesOf = async (ui: Awaited<ReturnType<typeof viewRules>>) =>
  (await ui.findAll({ type: 'Text' })).filter(t => t.props.bold).map(t => t.text)

describe('the emoji rules viewer', () => {
  test('shows the active output style\'s rules in their groups, beside the pictures of the emoji they name', async ($, on) => {
    const ui = await viewRules($, on, { styles: { 'test-voice.md': { text: guide(RULES) } } })
    expect(await titlesOf(ui)).toEqual(['Good news', 'Bad news'])
    expect((await ui.findAll({ type: 'Svg' })).map(svg => svg.props.alt)).toEqual([':tada:', ':yay:', ':cheer:', ':sulk:'])
    expect(await ui.find({ type: 'Text', text: 'something worked' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /one now and then/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Keep it short/ })).toBeUndefined()
  })

  test('flags rules that name an emoji the folder lacks, and taught contexts no rule has merged', async ($, on) => {
    const files = { ...FOLDER, 'nod.png': { base64: PNG }, 'emojis.json': { text: '{"nod": "agreeing", "tada": "it worked"}' } }
    const ui = await viewRules($, on, { styles: { 'test-voice.md': { text: guide(`${RULES}\n- \`:nope:\` never`) } } }, files)
    const texts = await textsOf(ui)
    expect(texts.some(text => text.includes(':nope:') && !text.startsWith(':nope:'))).toBe(true)
    const unmerged = texts.find(text => text.includes(':nod:'))
    expect(unmerged).toBeDefined()
    expect(unmerged).not.toContain(':tada:')
  })

  const whyNothing = async ($: Engine, on: On, setup: Setup, why: RegExp) => {
    const ui = await viewRules($, on, setup)
    expect(await ui.find({ type: 'Text', text: why })).toBeDefined()
  }

  test('says so when the output style has no Emoji section', ($, on) =>
    whyNothing($, on, { styles: { 'test-voice.md': { text: guide('').replace('## Emoji', '## Other') } } }, /no "## Emoji" section/))

  test('says so when no output style file has the chosen name', ($, on) =>
    whyNothing($, on, { styles: {} }, /No file .* is the output style "Test voice"/))

  test('says so when no output style is chosen', ($, on) => whyNothing($, on, { outputStyle: '' }, /No output style is chosen/))

  test('a style with no name in its frontmatter is found by its file name', async ($, on) => {
    const ui = await viewRules($, on, { outputStyle: 'terse', styles: { 'terse.md': { text: guide(RULES, '') } } })
    expect(await titlesOf(ui)).toEqual(['Good news', 'Bad news'])
  })

  test('a style in the project\'s own output-styles folder is shown', async ($, on) => {
    const ui = await viewRules($, on, { projectStyles: { 'test-voice.md': { text: guide('Mine:\n- `:tada:` a build passed') } } })
    expect(await ui.find({ type: 'Text', text: 'a build passed' })).toBeDefined()
  })

  test('Reload reads the output style again', async ($, on) => {
    const styles = { 'test-voice.md': { text: guide(RULES) } }
    const ui = await viewRules($, on, { styles })
    styles['test-voice.md'] = { text: guide(`${RULES}\n- \`:tada:\` a build passed`) }
    await ui.press({ key: 'reload' })
    expect(await ui.find({ type: 'Text', text: 'a build passed' })).toBeDefined()
  })

  test('the terminal shows the names without pictures', async ($, on) => {
    engine(on, FOLDER, { styles: { 'test-voice.md': { text: guide(RULES) } } })
    await start($)
    await $.command.run({ command: 'emoji-rules', ...COMMAND })
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'terminal', ...PANE })
    expect(await ui.find({ type: 'Text', text: ':tada:' })).toBeDefined()
  })

  test('Claude can open the viewer with its tool', async ($, on) => {
    const seen = engine(on, FOLDER, { styles: { 'test-voice.md': { text: guide(RULES) } } })
    await start($)
    await $.tool.call({ tool: 'mcp__inline-emoji__open_emoji_rules', input: {} })
    expect(seen.opened).toContain('emoji-rules')
  })
})

describe('reading the Emoji section', () => {
  const section = (emoji: string): Setup => ({ styles: { 'test-voice.md': { text: guide(emoji) } } })

  test('### headings are group titles, and + and numbered items are rules', async ($, on) => {
    const ui = await viewRules($, on, section('### Good news\n1. `:tada:` something worked\n\n### Bad news\n+ `:sulk:` a test failed'))
    expect(await titlesOf(ui)).toEqual(['Good news', 'Bad news'])
    expect((await ui.findAll({ type: 'Svg' })).map(svg => svg.props.alt)).toEqual([':tada:', ':sulk:'])
  })

  test('a rule keeps its words before and between the names it gives', async ($, on) => {
    const ui = await viewRules($, on, section('Wins:\n- `:tada:` when a release ships; `:yay:` for smaller wins'))
    expect(await ui.find({ type: 'Text', text: 'when a release ships; for smaller wins' })).toBeDefined()
  })

  test('a rule that wraps onto an indented line is read whole', async ($, on) => {
    const ui = await viewRules($, on, section('Wins:\n- `:tada:` a long build finished, or a flaky\n  test passed at last:\n- `:yay:` small wins'))
    expect(await titlesOf(ui)).toEqual(['Wins'])
    expect(await ui.find({ type: 'Text', text: 'a long build finished, or a flaky test passed at last:' })).toBeDefined()
  })

  test('a bullet ending in a colon is the title of the bullets under it', async ($, on) => {
    const ui = await viewRules($, on, section('- Good news:\n  - `:tada:` something worked\n- Bad news:\n  - `:sulk:` a test failed'))
    expect(await titlesOf(ui)).toEqual(['Good news', 'Bad news'])
    expect(await ui.find({ type: 'Text', text: /^Good news:/ })).toBeUndefined()
  })

  test('a paragraph after the groups is shown', async ($, on) => {
    const ui = await viewRules($, on, section(`${RULES}\n\nNever more than one per reply.`))
    expect(await ui.find({ type: 'Text', text: 'Never more than one per reply.' })).toBeDefined()
  })

  test('a heading inside a code fence neither ends the section nor reads as a rule', async ($, on) => {
    const ui = await viewRules($, on, section('Like this:\n```md\n# Result\n- `:yay:` example\n```\n\nGood news:\n- `:tada:` something worked'))
    expect(await titlesOf(ui)).toEqual(['Like this', 'Good news'])
    expect((await ui.findAll({ type: 'Svg' })).map(svg => svg.props.alt)).toEqual([':tada:'])
  })
})
