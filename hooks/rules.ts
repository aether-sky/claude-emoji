// Reading the emoji rules out of an output style: its "## Emoji" section is an opening paragraph, then groups,
// each a line ending in a colon followed by bullets that name emoji in backticks and say when to use them:
//   Happy, proud, done:
//   - `:garf:` or `:mikudab:` satisfied, accomplished
import type { Emoji, EmojiRuleGroup, EmojiRules } from '../types'

const NAMED = /`:([a-z0-9_]{2,32}):`/g

// The `name:` in a markdown file's frontmatter.
export function frontmatterName(markdown: string): string | undefined {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)?.[1]
  const name = frontmatter ? /^name:\s*(.+?)\s*$/m.exec(frontmatter)?.[1] : undefined
  return name?.replace(/^["']|["']$/g, '')
}

// The lines between "## Emoji" and the next heading of that level, or undefined without one.
export function emojiSection(markdown: string): string | undefined {
  const lines = markdown.split(/\r?\n/)
  const start = lines.findIndex(line => /^##\s+Emoji\s*$/i.test(line))
  if (start < 0) return undefined
  const end = lines.findIndex((line, i) => i > start && /^#{1,2}\s/.test(line))
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n')
}

export function parseEmojiRules(section: string): Pick<EmojiRules, 'intro' | 'groups'> {
  const intro: string[] = []
  const groups: EmojiRuleGroup[] = []
  for (const raw of section.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const bullet = /^[-*]\s+(.*)$/.exec(line)?.[1]
    if (bullet !== undefined) {
      const names = [...bullet.matchAll(NAMED)].map(m => m[1] ?? '')
      const last = [...bullet.matchAll(NAMED)].pop()
      const text = last?.index === undefined ? bullet : bullet.slice(last.index + last[0].length).trim()
      if (!groups.length) groups.push({ title: '', rules: [] })
      groups[groups.length - 1]?.rules.push({ names, text })
    } else if (line.endsWith(':')) {
      groups.push({ title: line.slice(0, -1), rules: [] })
    } else if (!groups.length) {
      intro.push(line)
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
