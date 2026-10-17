# claude-emoji

A Claude Code mod that gives Claude custom emoji, the way Discord does. Put emoji images in a folder, say when each one fits, and Claude writes `:name:` in its replies; the desktop Code tab draws the picture in the line.

## Install

In Claude Code, add this repo as a marketplace, then install the mod from it:

```
/plugin marketplace add aether-sky/claude-emoji
/plugin install inline-emoji@claude-emoji
```

## The emoji folder

The mod reads `~/.claude/emojis` (or the folder set in the plugin's `folder` option):

- One image per emoji, named after it: `hmph.png`. Names are 2-32 lowercase letters, digits or underscores. PNG, GIF, WebP, JPEG and SVG load; animated GIF and WebP move.
- `emojis.json`, optional: by file name without its extension, the name to use when it is not the file's, and when to use the emoji. A plain string is read as the "when".

  ```json
  { "party-cat": { "name": "partycat", "use": "a party" }, "hmph": "grumpy" }
  ```

- `thumbs/<file>.png`, optional: a still picture of an animated emoji for the panes.

Keep each image small: the mod skips one whose picture is over about 96 KB, and the desktop stops drawing new pictures after a session has drawn about 750 KB of them. 48 px images are plenty.

## Commands

- `/emoji-teach` opens a pane listing every emoji with its picture, a name field and a "use it when" field. What you type saves on Enter, on moving to another field, on a page turn and when the pane closes. **Done, teach Claude** asks Claude to merge what you wrote into your output style.
- `/emoji-rules` opens a viewer of the emoji rules Claude follows: the `## Emoji` section of the output style your settings choose, each rule beside the pictures of the emoji it names. It flags rules that name an emoji missing from the folder, and emoji you gave a context that no rule mentions yet.
- `/emoji-reload` reads the emoji folder again and says which files it skipped.

Claude can open either pane for you when you ask.

## The Emoji section

The viewer reads this shape from the output style's markdown: an opening paragraph, then groups, each a line ending in a colon followed by bullets that name emoji in backticks.

```markdown
## Emoji
Use them inline as `:name:`, one now and then.

Good news:
- `:tada:` or `:yay:` something worked
```

## What draws where

Pictures appear on the surfaces that draw SVG: the desktop Code tab, the mobile app and VS Code. The desktop draws no picture inside a run of text, so a paragraph that names an emoji is laid out as a wrapping row of its words and pictures; bold, italic, links, lists, headings and quotes keep their look, inline code shows as colored text. In the terminal `:name:` stays text.

## Developing

Run the tests with `claude plugin test <this folder>` and check the mod with `claude plugin validate <this folder>`. To run a working copy, name its folder in `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`.
