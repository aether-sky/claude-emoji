import { describe, expect, test } from 'claude-code/testing'

import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { COMMAND, PNG, engine, pane, start } from './fake-engine'
import type { Setup } from './fake-engine'

const PANE = pane('emoji-rules')

const guide = (emoji: string) => `---
name: Test voice
description: test style
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

const FOLDER = {
  'tada.png': { base64: PNG },
  'yay.png': { base64: PNG },
  'cheer.png': { base64: PNG },
  'sulk.png': { base64: PNG },
}

describe('the emoji rules viewer', () => {
  test('shows the active output style\'s rules in their groups, beside the pictures of the emoji they name', async ($, on) => {
    engine(on, FOLDER, { styles: { 'test-voice.md': { text: guide(RULES) } } })
    await start($)
    await $.command.run({ command: 'emoji-rules', ...COMMAND })
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...PANE })
    const titles = (await ui.findAll({ type: 'Text' })).filter(t => t.props.bold).map(t => t.text)
    expect(titles).toEqual(['Good news', 'Bad news'])
    expect((await ui.findAll({ type: 'Svg' })).map(svg => svg.props.alt)).toEqual([':tada:', ':yay:', ':cheer:', ':sulk:'])
    expect(await ui.find({ type: 'Text', text: 'something worked' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /one now and then/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Keep it short/ })).toBeUndefined()
  })

  test('flags rules that name an emoji the folder lacks, and taught contexts no rule has merged', async ($, on) => {
    const files = {
      ...FOLDER,
      'nod.png': { base64: PNG },
      'emojis.json': { text: '{"nod": "agreeing", "tada": "it worked"}' },
    }
    engine(on, files, { styles: { 'test-voice.md': { text: guide(`${RULES}\n- \`:nope:\` never`) } } })
    await start($)
    await $.command.run({ command: 'emoji-rules', ...COMMAND })
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...PANE })
    expect((await ui.find({ type: 'Text', text: /not in the emoji folder/ }))?.text).toContain(':nope:')
    const unmerged = (await ui.find({ type: 'Text', text: /in no rule yet/ }))?.text
    expect(unmerged).toContain(':nod:')
    expect(unmerged).not.toContain(':tada:')
  })

  const whyNothing = async ($: Engine, on: On, setup: Setup, why: RegExp) => {
    engine(on, FOLDER, setup)
    await start($)
    await $.command.run({ command: 'emoji-rules', ...COMMAND })
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...PANE })
    expect(await ui.find({ type: 'Text', text: why })).toBeDefined()
  }

  test('says so when the output style has no Emoji section', ($, on) =>
    whyNothing($, on, { styles: { 'test-voice.md': { text: guide('').replace('## Emoji', '## Other') } } }, /no "## Emoji" section/))

  test('says so when no output style file has the chosen name', ($, on) =>
    whyNothing($, on, { styles: {} }, /No file .* is the output style "Test voice"/))

  test('says so when no output style is chosen', ($, on) => whyNothing($, on, { outputStyle: '' }, /No output style is chosen/))

  test('Reload reads the output style again', async ($, on) => {
    const styles = { 'test-voice.md': { text: guide(RULES) } }
    engine(on, FOLDER, { styles })
    await start($)
    await $.command.run({ command: 'emoji-rules', ...COMMAND })
    const ui = await $.ui.mount({ plugin: 'inline-emoji', surface: 'desktop', ...PANE })
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
    const call = await $.tool.call({ tool: 'mcp__inline-emoji__open_emoji_rules', input: {} })
    expect(call.result).toBe('Opened the emoji rules viewer.')
    expect(seen.opened).toContain('emoji-rules')
  })
})
