// A reply's emoji drawn as pictures, for the surfaces that draw Svg. Blocks naming no emoji stay the engine's
// markdown; a block that names one is drawn line by line. The desktop draws no Svg inside a run of text, so
// each line is a wrapping row of its words and pictures.
import type { Elements } from 'claude-code'

import { NBSP, PLAIN, groupBlocks, isOnlyEmoji, lineItems, parseInline, toAtoms } from './markdown'
import type { Atom, Item, Known } from './markdown'

export type ReplyElements = Pick<Elements['desktop'], 'Box' | 'Text' | 'Svg' | 'Link' | 'Markdown'>

const INLINE_PX = 22
// A paragraph of nothing but emoji draws them large, as Discord does.
const JUMBO_PX = 48

export function drawReply({ Box, Text, Svg, Link, Markdown }: ReplyElements, text: string, known: Known) {
  const drawAtom = (atom: Atom, px: number) => {
    if (atom.kind === 'emoji') {
      const { name, source, isAnimated } = atom.emoji
      const svg = <Svg source={source} alt={`:${name}:`} width={px} height={px} isInteractive={isAnimated || undefined} />
      if (!atom.isSpaced) return svg
      return (
        <Box flexDirection="row" alignItems="center">
          {svg}
          <Text>{NBSP}</Text>
        </Box>
      )
    }
    const { style } = atom
    // The desktop's Link opens https: alone; markdown keeps any other link, like a localhost one, clickable.
    if (style.href && !style.href.startsWith('https:')) return <Markdown text={`[${escaped(atom.text)}](<${style.href}>)`} />
    const text = (
      <Text
        bold={style.bold || undefined}
        italic={style.italic || undefined}
        strikethrough={style.strike || undefined}
        dimColor={style.dim || undefined}
        color={style.isCode ? 'suggestion' : undefined}
      >
        {atom.text}
      </Text>
    )
    return style.href ? <Link href={style.href}>{text}</Link> : text
  }

  const drawItem = (item: Item, px: number) => (
    <Box flexDirection="row" flexWrap="wrap" alignItems="center" marginLeft={item.indent}>
      {item.marker ? <Text dimColor={item.isQuote || undefined}>{item.marker}</Text> : null}
      {toAtoms(parseInline(item.text, known), { ...PLAIN, bold: item.isHeading, dim: item.isQuote }).map(atom =>
        drawAtom(atom, px),
      )}
    </Box>
  )

  const parts = groupBlocks(text, known).map(group => {
    if (group.kind === 'markdown') return <Markdown text={group.text} />
    const px = isOnlyEmoji(group.text, known) ? JUMBO_PX : INLINE_PX
    return <Box flexDirection="column">{lineItems(group.text).map(item => drawItem(item, px))}</Box>
  })
  return (
    <Box flexDirection="column" rowGap={1}>
      {parts}
    </Box>
  )
}

// The text with markdown's inline punctuation escaped, to stand as a link's text.
function escaped(text: string): string {
  return text.replace(/[\\`*_[\]<>~]/g, '\\$&')
}
