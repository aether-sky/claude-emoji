// A reply's emoji drawn as pictures, for the surfaces that draw Svg. Blocks naming no emoji stay the engine's
// markdown; a block that names one is drawn line by line. The desktop draws no Svg inside a run of text, so
// each line is a wrapping row of its words and pictures.
import type { Elements } from 'claude-code'

import { PLAIN, groupBlocks, isOnlyEmoji, lineItems, parseInline, toAtoms } from './markdown'
import type { Atom, Item, Known } from './markdown'

export type ReplyElements = Pick<Elements['desktop'], 'Box' | 'Text' | 'Svg' | 'Link' | 'Markdown'>

const INLINE_PX = 22
// A paragraph of nothing but emoji draws them large, as Discord does.
const JUMBO_PX = 48

export function drawReply({ Box, Text, Svg, Link, Markdown }: ReplyElements, text: string, known: Known) {
  const drawAtom = (atom: Atom, px: number) => {
    if (atom.kind === 'emoji') {
      const { name, source, isAnimated } = atom.emoji
      return <Svg source={source} alt={`:${name}:`} width={px} height={px} isInteractive={isAnimated || undefined} />
    }
    const { style } = atom
    if (style.href) return <Link href={style.href}>{atom.text}</Link>
    return (
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
