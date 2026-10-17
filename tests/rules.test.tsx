import { describe, expect, test } from 'claude-code/testing'

import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { COMMAND, PNG, engine, pane, start } from './fake-engine'
import type { Setup } from './fake-engine'

const PANE = pane('emoji-rules')

const guide = (emoji: string) => `---
name: Tadaima voice
description: test style
---

Talk softly.

## Emoji
Write them inline as \`:name:\`. At most two in a reply.

${emoji}

## Avoid
- Being formal.
`

const RULES = `Happy, proud, done:
- \`:garf:\` or \`:mikudab:\` satisfied, accomplished
- \`:nessie:\` celebrating

Saying no:
- \`:bcblep:\` refusing to do something`

const FOLDER = {
  'garf.png': { base64: PNG },
  'mikudab.png': { base64: PNG },
  'nessie.png': { base64: PNG },
  'bcblep.png': { base64: PNG },
}

describe('the emoji rules viewer', () => {
  test('shows the active output style\'s rules in their groups, beside the pictures of the emoji they name', async ($, on) => {
    engine(on, FOLDER, { styles: { 'tadaima-voice.md': { text: guide(RULES) } } })
    await start($)
    await $.command.run({ command: 'emoji-rules', ...COMMAND })
    const ui = await $.ui.mount({ plugin: 'discord-emoji', surface: 'desktop', ...PANE })
    const titles = (await ui.findAll({ type: 'Text' })).filter(t => t.props.bold).map(t => t.text)
    expect(titles).toEqual(['Happy, proud, done', 'Saying no'])
    expect((await ui.findAll({ type: 'Svg' })).map(svg => svg.props.alt)).toEqual([':garf:', ':mikudab:', ':nessie:', ':bcblep:'])
    expect(await ui.find({ type: 'Text', text: 'satisfied, accomplished' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /At most two in a reply/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Being formal/ })).toBeUndefined()
  })

  test('flags rules that name an emoji the folder lacks, and taught contexts no rule has merged', async ($, on) => {
    const files = {
      ...FOLDER,
      'smug.png': { base64: PNG },
      'emojis.json': { text: '{"smug": "feeling smug", "garf": "satisfied"}' },
    }
    engine(on, files, { styles: { 'tadaima-voice.md': { text: guide(`${RULES}\n- \`:nope:\` never`) } } })
    await start($)
    await $.command.run({ command: 'emoji-rules', ...COMMAND })
    const ui = await $.ui.mount({ plugin: 'discord-emoji', surface: 'desktop', ...PANE })
    expect((await ui.find({ type: 'Text', text: /not in the emoji folder/ }))?.text).toContain(':nope:')
    const unmerged = (await ui.find({ type: 'Text', text: /in no rule yet/ }))?.text
    expect(unmerged).toContain(':smug:')
    expect(unmerged).not.toContain(':garf:')
  })

  const whyNothing = async ($: Engine, on: On, setup: Setup, why: RegExp) => {
    engine(on, FOLDER, setup)
    await start($)
    await $.command.run({ command: 'emoji-rules', ...COMMAND })
    const ui = await $.ui.mount({ plugin: 'discord-emoji', surface: 'desktop', ...PANE })
    expect(await ui.find({ type: 'Text', text: why })).toBeDefined()
  }

  test('says so when the output style has no Emoji section', ($, on) =>
    whyNothing($, on, { styles: { 'tadaima-voice.md': { text: guide('').replace('## Emoji', '## Other') } } }, /no "## Emoji" section/))

  test('says so when no output style file has the chosen name', ($, on) =>
    whyNothing($, on, { styles: {} }, /No file .* is the output style "Tadaima voice"/))

  test('says so when no output style is chosen', ($, on) => whyNothing($, on, { outputStyle: '' }, /No output style is chosen/))

  test('Reload reads the output style again', async ($, on) => {
    const styles = { 'tadaima-voice.md': { text: guide(RULES) } }
    engine(on, FOLDER, { styles })
    await start($)
    await $.command.run({ command: 'emoji-rules', ...COMMAND })
    const ui = await $.ui.mount({ plugin: 'discord-emoji', surface: 'desktop', ...PANE })
    styles['tadaima-voice.md'] = { text: guide(`${RULES}\n- \`:garf:\` lasagna`) }
    await ui.press({ key: 'reload' })
    expect(await ui.find({ type: 'Text', text: 'lasagna' })).toBeDefined()
  })

  test('the terminal shows the names without pictures', async ($, on) => {
    engine(on, FOLDER, { styles: { 'tadaima-voice.md': { text: guide(RULES) } } })
    await start($)
    await $.command.run({ command: 'emoji-rules', ...COMMAND })
    const ui = await $.ui.mount({ plugin: 'discord-emoji', surface: 'terminal', ...PANE })
    expect(await ui.find({ type: 'Text', text: ':garf:' })).toBeDefined()
  })

  test('Claude can open the viewer with its tool', async ($, on) => {
    const seen = engine(on, FOLDER, { styles: { 'tadaima-voice.md': { text: guide(RULES) } } })
    await start($)
    const call = await $.tool.call({ tool: 'mcp__discord-emoji__open_emoji_rules', input: {} })
    expect(call.result).toBe('Opened the emoji rules viewer.')
    expect(seen.opened).toContain('emoji-rules')
  })
})
