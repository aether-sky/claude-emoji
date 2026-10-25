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

// One piece of a drawn line: a word with its style, or an emoji. A space after either belongs to it (as a
// no-break space for a word), so a wrapped line starts with no space.
export type Atom = { kind: 'word'; text: string; style: Style } | { kind: 'emoji'; emoji: Emoji; isSpaced?: boolean }

export const PLAIN: Style = { bold: false, italic: false, strike: false, dim: false, isCode: false }

const TOKEN = /:([A-Za-z0-9_]{2,32}):/g
export const NBSP = String.fromCharCode(0xa0)
const FENCE = /^\s*(```|~~~)/
// A table's delimiter row, which markdown draws and a line of words cannot.
const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/m

export function hasEmoji(text: string, known: Known): boolean {
  for (const m of text.matchAll(TOKEN)) if (known[group(m, 1).toLowerCase()]) return true
  return false
}

export function isOnlyEmoji(text: string, known: Known): boolean {
  const rest = text.replace(TOKEN, (token, name: string) => (known[name.toLowerCase()] ? '' : token))
  return rest.trim() === ''
}

// The text's blocks (separated by blank lines; a fenced code block is a block of its own), with runs of blocks
// that hold no emoji, or are code or a table, joined back into one markdown text.
export function groupBlocks(text: string, known: Known) {
  const blocks: { text: string; isFenced: boolean }[] = []
  let lines: string[] = []
  let isFenced = false
  const flush = (isFence: boolean) => {
    if (lines.length) blocks.push({ text: lines.join('\n'), isFenced: isFence })
    lines = []
  }
  for (const line of text.split('\n')) {
    if (FENCE.test(line) && !isFenced) {
      flush(false)
      lines.push(line)
      isFenced = true
    } else if (FENCE.test(line)) {
      lines.push(line)
      flush(true)
      isFenced = false
    } else if (!isFenced && line.trim() === '') flush(false)
    else lines.push(line)
  }
  flush(isFenced)

  const groups: { kind: 'markdown' | 'emoji'; text: string }[] = []
  // Whether the block is indented under a list item drawn above as emoji, where on its own it would read as code.
  let isUnderEmoji = false
  for (const block of blocks) {
    const isMarkdownOnly = block.isFenced || TABLE_RULE.test(block.text)
    const kind = !isMarkdownOnly && hasEmoji(block.text.replace(/`[^`]*`/g, ''), known) ? 'emoji' : 'markdown'
    isUnderEmoji = kind === 'markdown' && (groups[groups.length - 1]?.kind === 'emoji' || isUnderEmoji) && /^\s/.test(block.text)
    const text = isUnderEmoji ? dedented(block.text) : block.text
    const last = groups[groups.length - 1]
    if (kind === 'markdown' && last?.kind === 'markdown') last.text += `\n\n${text}`
    else groups.push({ kind, text })
  }
  return groups
}

// The lines with the indentation they all share removed.
function dedented(text: string): string {
  const lines = text.split('\n')
  const indent = Math.min(...lines.filter(line => line.trim()).map(line => /^\s*/.exec(line)?.[0].length ?? 0))
  return lines.map(line => line.slice(Math.min(indent, /^\s*/.exec(line)?.[0].length ?? 0))).join('\n')
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
    } else if ((m = /^(\*\*\*|___)(?=\S)([\s\S]*?\S)\1/.exec(rest)) && (group(m, 1) === '***' || !/\w/.test(before))) {
      const italic: Run = { kind: 'style', style: 'italic', runs: parseInline(group(m, 2), known) }
      runs.push(...flushed(), { kind: 'style', style: 'bold', runs: [italic] })
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
    const last = atoms[atoms.length - 1]
    if (isSpaced && last) {
      atoms[atoms.length - 1] = last.kind === 'word' ? { ...last, text: last.text + NBSP } : { ...last, isSpaced: true }
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
