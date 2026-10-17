// The rules viewer's drawing: the Emoji section of the active output style, each rule beside the pictures of the
// emoji it names, and what is out of step between the rules and the emoji folder.
import type { Elements } from 'claude-code'

import type { Emoji, EmojiRule, EmojiRules } from '../types'
import { ruleProblems } from './rules'

export type RulesElements = Pick<Elements['desktop'], 'Box' | 'Text' | 'Button'> & {
  Svg?: Elements['desktop']['Svg']
}

const PICTURE_PX = 28

export function drawRulesPane(
  { Box, Text, Button, Svg }: RulesElements,
  rules: EmojiRules,
  emojis: Record<string, Emoji>,
  reload: () => unknown,
) {
  const { missing, unmerged } = ruleProblems(rules, emojis)
  const listOf = (names: string[]) => names.map(name => `:${name}:`).join(', ')

  const picture = (name: string) => {
    const emoji = emojis[name]
    if (!Svg || !emoji) return <Text dimColor>:{name}:</Text>
    return <Svg source={emoji.thumb ?? emoji.source} alt={`:${name}:`} width={PICTURE_PX} height={PICTURE_PX} />
  }

  const row = (rule: EmojiRule) => (
    <Box flexDirection="row" alignItems="center" gap={1}>
      <Box flexDirection="row" alignItems="center" gap={1} minWidth={12}>
        {rule.names.map(picture)}
      </Box>
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        <Text dimColor>{listOf(rule.names)}</Text>
        <Text>{rule.text}</Text>
      </Box>
    </Box>
  )

  return (
    <Box flexDirection="column" gap={1}>
      {rules.style ? (
        <Text dimColor>
          From the output style "{rules.style}"{rules.guide ? ` (${rules.guide})` : ''}.
        </Text>
      ) : null}
      {rules.problem ? <Text color="warning">{rules.problem}</Text> : null}
      {rules.intro ? <Text>{rules.intro}</Text> : null}
      {missing.length ? (
        <Text color="warning">Named in the rules but not in the emoji folder: {listOf(missing)}.</Text>
      ) : null}
      {unmerged.length ? (
        <Text color="warning">
          Given a context in /emoji-teach but in no rule yet: {listOf(unmerged)}. Press Done in the teaching pane to
          have Claude merge them.
        </Text>
      ) : null}
      {rules.groups.map(group => (
        <Box flexDirection="column">
          {group.title ? <Text bold>{group.title}</Text> : null}
          {group.rules.map(row)}
        </Box>
      ))}
      <Box flexDirection="row">
        <Button key="reload" label="Reload" onPress={() => reload()} />
      </Box>
    </Box>
  )
}
