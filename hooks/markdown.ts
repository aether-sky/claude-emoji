// Reading a reply's markdown into the blocks, lines and words the reply drawing lays out around emoji.
import type { Emoji } from '../types'

export type Known = Record<string, Emoji>

export type Run =
  | { kind: 'text'; text: string }
  | { kind: 'emoji'; emoji: Emoji }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; runs: Run[] }
  | { kind: 'style'; style: 'bold' | 'italic' | 'strike'; runs: Run[] }

export type Item = { text: string; marker: string; indent: number; isHeading: boolean; isQuote: boolean }

export type Style = { bold: boolean; italic: boolean; strike: boolean; dim: boolean; isCode: boolean; href?: string }

// One piece of a drawn line: a word with its style (a space before it written as a no-break space, which a
// wrapping row keeps), or an emoji.
export type Atom = { kind: 'word'; text: string; style: Style } | { kind: 'emoji'; emoji: Emoji }

export const PLAIN: Style = { bold: false, italic: false, strike: false, dim: false, isCode: false }

const TOKEN = /:([A-Za-z0-9_]{2,32}):/g
const NBSP = String.fromCharCode(0xa0)

export function hasEmoji(text: string, known: Known): boolean {
  for (const m of text.matchAll(TOKEN)) if (known[group(m, 1).toLowerCase()]) return true
  return false
}

export function isOnlyEmoji(text: string, known: Known): boolean {
  const rest = text.replace(TOKEN, (token, name: string) => (known[name.toLowerCase()] ? '' : token))
  return rest.trim() === ''
}

// The text's blocks (separated by blank lines; a fenced code block is one block), with runs of blocks that hold
// no emoji joined back into one markdown text.
export function groupBlocks(text: string, known: Known) {
  const blocks: { text: string; isFenced: boolean }[] = []
  let lines: string[] = []
  let isFenced = false
  let hasFence = false
  const flush = () => {
    if (lines.length) blocks.push({ text: lines.join('\n'), isFenced: hasFence })
    lines = []
    hasFence = false
  }
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      isFenced = !isFenced
      hasFence = true
    }
    if (!isFenced && line.trim() === '') flush()
    else lines.push(line)
  }
  flush()

  const groups: { kind: 'markdown' | 'emoji'; text: string }[] = []
  for (const block of blocks) {
    const kind = !block.isFenced && hasEmoji(block.text.replace(/`[^`]*`/g, ''), known) ? 'emoji' : 'markdown'
    const last = groups[groups.length - 1]
    if (kind === 'markdown' && last?.kind === 'markdown') last.text += `\n\n${block.text}`
    else groups.push({ kind, text: block.text })
  }
  return groups
}

// A block's lines as items: list entries, headings and quotes start one; other lines continue the item above,
// as markdown joins a paragraph's lines.
export function lineItems(text: string): Item[] {
  const items: Item[] = []
  for (const line of text.split('\n')) {
    const list = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line)
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    const quote = /^>\s?(.*)$/.exec(line)
    const last = items[items.length - 1]
    if (list) {
      const marker = /\d/.test(group(list, 2)) ? `${group(list, 2)} ` : '• '
      const indent = Math.floor(group(list, 1).length / 2) * 2
      items.push({ text: group(list, 3), marker, indent, isHeading: false, isQuote: false })
    } else if (heading) {
      items.push({ text: group(heading, 1), marker: '', indent: 0, isHeading: true, isQuote: false })
    } else if (quote) {
      items.push({ text: group(quote, 1), marker: '▎ ', indent: 0, isHeading: false, isQuote: true })
    } else if (last && !last.isHeading) {
      last.text += ` ${line.trim()}`
    } else {
      items.push({ text: line.trim(), marker: '', indent: 0, isHeading: false, isQuote: false })
    }
  }
  return items
}

// Markdown's inline syntax that replies use (code, links, bold, italic, strikethrough, escapes), plus emoji.
export function parseInline(s: string, known: Known): Run[] {
  const runs: Run[] = []
  let text = ''
  let i = 0
  while (i < s.length) {
    const rest = s.slice(i)
    const before = i > 0 ? s.charAt(i - 1) : ' '
    let m: RegExpExecArray | null
    let emoji: Emoji | undefined
    if (/^\\[\\`*_{}\[\]()#+\-.!:~>|]/.test(rest)) {
      text += rest.charAt(1)
      i += 2
      continue
    }
    if ((m = /^(`+)([\s\S]*?[^`])\1(?!`)/.exec(rest))) {
      runs.push(...flushed(), { kind: 'code', text: group(m, 2) })
    } else if ((m = /^:([A-Za-z0-9_]{2,32}):/.exec(rest)) && (emoji = known[group(m, 1).toLowerCase()])) {
      runs.push(...flushed(), { kind: 'emoji', emoji })
    } else if ((m = /^\[([^\]]+)\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/.exec(rest))) {
      runs.push(...flushed(), { kind: 'link', href: group(m, 2), runs: parseInline(group(m, 1), known) })
    } else if ((m = /^https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"*_~]/.exec(rest)) && !/\w/.test(before)) {
      runs.push(...flushed(), { kind: 'link', href: m[0], runs: [{ kind: 'text', text: m[0] }] })
    } else if ((m = /^(\*\*|__)(?=\S)([\s\S]*?\S)\1/.exec(rest)) && (group(m, 1) === '**' || !/\w/.test(before))) {
      runs.push(...flushed(), { kind: 'style', style: 'bold', runs: parseInline(group(m, 2), known) })
    } else if ((m = /^~~(?=\S)([\s\S]*?\S)~~/.exec(rest))) {
      runs.push(...flushed(), { kind: 'style', style: 'strike', runs: parseInline(group(m, 1), known) })
    } else if (
      (m = /^\*(?=[^\s*])([\s\S]*?[^\s*])\*(?!\*)/.exec(rest)) ||
      (!/\w/.test(before) && (m = /^_(?=\S)([\s\S]*?\S)_(?!\w)/.exec(rest)))
    ) {
      runs.push(...flushed(), { kind: 'style', style: 'italic', runs: parseInline(group(m, 1), known) })
    } else {
      text += s.charAt(i)
      i += 1
      continue
    }
    i += m[0].length
  }
  runs.push(...flushed())
  return runs

  // The plain text gathered so far as a run, then cleared.
  function flushed(): Run[] {
    const done: Run[] = text ? [{ kind: 'text', text }] : []
    text = ''
    return done
  }
}

// A line's runs as words and emoji, each word carrying the styles around it.
export function toAtoms(runs: Run[], base: Style): Atom[] {
  const atoms: Atom[] = []
  let isSpaced = false
  const push = (atom: Atom) => {
    if (isSpaced && atoms.length) {
      if (atom.kind === 'word') atom = { ...atom, text: NBSP + atom.text }
      else atoms.push({ kind: 'word', text: NBSP, style: base })
    }
    isSpaced = false
    atoms.push(atom)
  }
  const walk = (runs: Run[], style: Style) => {
    for (const run of runs) {
      if (run.kind === 'text') {
        for (const piece of run.text.split(/(\s+)/)) {
          if (/^\s+$/.test(piece)) isSpaced = true
          else if (piece) push({ kind: 'word', text: piece, style })
        }
      } else if (run.kind === 'code') push({ kind: 'word', text: run.text, style: { ...style, isCode: true } })
      else if (run.kind === 'emoji') push({ kind: 'emoji', emoji: run.emoji })
      else if (run.kind === 'link') walk(run.runs, { ...style, href: run.href })
      else walk(run.runs, { ...style, [run.style]: true })
    }
  }
  walk(runs, base)
  return atoms
}

// A regex match's group, or '' where it took no part.
function group(m: RegExpExecArray | RegExpMatchArray, index: number): string {
  return m[index] ?? ''
}
