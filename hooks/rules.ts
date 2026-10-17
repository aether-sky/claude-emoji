// Reading the emoji rules out of an output style: its "## Emoji" section is an opening paragraph, then groups,
// each a title (a line ending in a colon, or a "###" heading) followed by bullets that name emoji in backticks:
//   Good news:
//   - `:tada:` or `:yay:` something worked
import type { Emoji, EmojiRuleGroup, EmojiRules } from '../types'

const NAMED = /`:([a-z0-9_]{2,32}):`/g
const BULLET = /^(?:[-*+]|\d+[.)])\s+(.*)$/
const SUBHEADING = /^#{3,6}\s+(.*?):?\s*$/
const FENCE = /^\s*(```|~~~)/
// What joins the names in a rule ("`:a:`, `:b:` or `:c:` ..."), left at the ends of its text once they are out.
const JOINERS = /^(?:\s*(?:(?:or|and)\b|[,;/&]))+\s*|(?:\s*(?:(?:or|and)\b|[,;/&]))+\s*$/gi

// The `name:` in a markdown file's frontmatter.
export function frontmatterName(markdown: string): string | undefined {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)?.[1]
  const name = frontmatter ? /^name:\s*(.+?)\s*$/m.exec(frontmatter)?.[1] : undefined
  return name?.replace(/^["']|["']$/g, '')
}

// The lines between "## Emoji" and the next heading of that level, or undefined without one; a heading inside a
// code fence is not one.
export function emojiSection(markdown: string): string | undefined {
  const lines = markdown.split(/\r?\n/)
  let isFenced = false
  let start = -1
  for (const [i, line] of lines.entries()) {
    if (FENCE.test(line)) isFenced = !isFenced
    if (isFenced) continue
    if (start < 0 && /^##\s+Emoji\s*$/i.test(line)) start = i
    else if (start >= 0 && /^#{1,2}\s/.test(line)) return lines.slice(start + 1, i).join('\n')
  }
  return start < 0 ? undefined : lines.slice(start + 1).join('\n')
}

export function parseEmojiRules(section: string): Pick<EmojiRules, 'intro' | 'groups'> {
  const intro: string[] = []
  const groups: EmojiRuleGroup[] = []
  const current = () => {
    if (!groups.length) groups.push({ title: '', rules: [], notes: [] })
    return groups[groups.length - 1] as EmojiRuleGroup
  }
  // What the line before was, which an indented line or a paragraph's next line continues.
  let previous: 'rule' | 'note' | 'intro' | undefined
  let isFenced = false
  for (const raw of section.split('\n')) {
    // An example in a code fence is not a rule.
    const isFence = FENCE.test(raw)
    if (isFence) isFenced = !isFenced
    if (isFenced || isFence) continue
    const line = raw.trim()
    const bullet = BULLET.exec(line)?.[1]
    const subheading = SUBHEADING.exec(line)?.[1]
    if (!line) {
      previous = undefined
    } else if (previous === 'rule' && /^\s/.test(raw) && bullet === undefined) {
      const rule = current().rules[current().rules.length - 1]
      if (rule) rule.text = `${rule.text} ${line}`.trim()
    } else if (subheading !== undefined || (line.endsWith(':') && !line.match(NAMED))) {
      groups.push({ title: (subheading ?? bullet ?? line).replace(/:$/, ''), rules: [], notes: [] })
      previous = undefined
    } else if (bullet !== undefined) {
      const names = [...bullet.matchAll(NAMED)].map(m => m[1] ?? '')
      const text = bullet.replace(NAMED, ' ').replace(JOINERS, '').replace(/\s+/g, ' ').trim()
      current().rules.push({ names, text })
      previous = 'rule'
    } else if (!groups.length) {
      if (previous === 'intro') intro[intro.length - 1] += ` ${line}`
      else intro.push(line)
      previous = 'intro'
    } else {
      const notes = current().notes
      if (previous === 'note') notes[notes.length - 1] += ` ${line}`
      else notes.push(line)
      previous = 'note'
    }
  }
  return { intro: intro.join(' '), groups }
}

// Names the rules use that the emoji folder lacks, and emoji with a context from the teaching pane that no
// rule names yet.
export function ruleProblems(rules: EmojiRules, emojis: Record<string, Emoji>) {
  const named = new Set(rules.groups.flatMap(group => group.rules.flatMap(rule => rule.names)))
  return {
    missing: [...named].filter(name => !emojis[name]).sort(),
    unmerged: Object.values(emojis).filter(emoji => emoji.use && !named.has(emoji.name)).map(emoji => emoji.name).sort(),
  }
}
