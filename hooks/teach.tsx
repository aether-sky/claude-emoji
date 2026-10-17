// The teaching pane's drawing: each emoji with its name and a field for when the person wants it used, a page at
// a time. What its fields and buttons do is the hooks module's (TeachActions).
import type { Elements } from 'claude-code'

import type { Emoji, EmojiDraft } from '../types'

export type TeachElements = Pick<Elements['desktop'], 'Box' | 'Text' | 'Button' | 'Input'> & {
  Svg?: Elements['desktop']['Svg']
}

export type TeachView = {
  all: Emoji[]
  drafts: Record<string, EmojiDraft>
  pageStart: number
  isUndescribedOnly: boolean
  notice: string
}

export type TeachActions = {
  draft: (file: string, change: EmojiDraft) => unknown
  // Drafts the change, then saves the emoji.
  submit: (file: string, change: EmojiDraft) => unknown
  // Saves the given emoji, then turns to the page starting at the anchor emoji.
  goTo: (anchor: string | undefined, files: string[]) => unknown
  toggleFilter: () => unknown
  finish: () => unknown
}

export const PER_PAGE = 6
const PICTURE_PX = 44

// The emoji the pane lists, in file order; with the filter, those without a saved context.
export function listed(all: Emoji[], isUndescribedOnly: boolean): Emoji[] {
  const sorted = [...all].sort((a, b) => a.file.localeCompare(b.file))
  return isUndescribedOnly ? sorted.filter(emoji => !emoji.use?.trim()) : sorted
}

function useOf(view: TeachView, emoji: Emoji): string {
  return view.drafts[emoji.file]?.use ?? emoji.use ?? ''
}

export function drawTeachPane({ Box, Text, Button, Input, Svg }: TeachElements, view: TeachView, actions: TeachActions) {
  const shown = listed(view.all, view.isUndescribedOnly)
  const start = Math.min(view.pageStart, Math.max(0, Math.ceil(shown.length / PER_PAGE) - 1) * PER_PAGE)
  const onPage = shown.slice(start, start + PER_PAGE)
  const files = onPage.map(emoji => emoji.file)
  const described = view.all.filter(emoji => emoji.use?.trim()).length

  const row = (emoji: Emoji) => (
    <Box flexDirection="row" alignItems="center" gap={2}>
      {Svg ? (
        <Svg source={emoji.thumb ?? emoji.source} alt={`:${emoji.name}:`} width={PICTURE_PX} height={PICTURE_PX} />
      ) : null}
      <Box flexDirection="column" flexGrow={1}>
        <Input
          key={`name:${emoji.file}`}
          label="Name"
          value={view.drafts[emoji.file]?.name ?? emoji.name}
          submitLabel="save"
          onInput={value => actions.draft(emoji.file, { name: value })}
          onSubmit={value => actions.submit(emoji.file, { name: value })}
        />
        <Input
          key={`use:${emoji.file}`}
          label="Use it when"
          placeholder="e.g. something breaks and you laugh it off"
          value={useOf(view, emoji)}
          submitLabel="save"
          onInput={value => actions.draft(emoji.file, { use: value })}
          onSubmit={value => actions.submit(emoji.file, { use: value })}
        />
      </Box>
    </Box>
  )

  return (
    <Box flexDirection="column" gap={1}>
      <Text>
        {described} of {view.all.length} emoji have a "use it when". Type, then press Enter to save.
      </Text>
      {view.notice ? <Text color={view.notice.startsWith('Saved') ? 'success' : 'warning'}>{view.notice}</Text> : null}
      {view.all.length === 0 ? (
        <Text dimColor>No emoji loaded. Put images in the emoji folder and run /emoji-reload.</Text>
      ) : null}
      {onPage.map(row)}
      <Box flexDirection="row" gap={1} alignItems="center">
        <Button
          key="back"
          label="Back"
          onPress={() => actions.goTo(start > 0 ? shown[Math.max(0, start - PER_PAGE)]?.file : undefined, files)}
        />
        <Text dimColor>
          {onPage.length ? `${start + 1}-${start + onPage.length}` : 0} of {shown.length}
        </Text>
        <Button key="next" label="Next" onPress={() => actions.goTo(shown[start + PER_PAGE]?.file, files)} />
        <Button
          key="filter"
          label={view.isUndescribedOnly ? 'Show all' : 'Only ones without a context'}
          onPress={() => actions.toggleFilter()}
        />
        <Button key="done" variant="primary" label="Done, teach Claude" onPress={() => actions.finish()} />
      </Box>
    </Box>
  )
}
