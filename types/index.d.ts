// One custom emoji as the mod draws and lists it.
export type Emoji = {
  // The name written between colons: lowercase letters, digits and underscores.
  name: string;
  // The image's file name without its extension: the emoji's key in emojis.json.
  file: string;
  // An SVG document wrapping the image, ready for an Svg element.
  source: string;
  // Drawn in an interactive frame so an animated GIF or WebP moves.
  isAnimated: boolean;
  // A still SVG of an animated emoji for the teaching pane, from thumbs/<file>.png; absent for a still one.
  thumb?: string;
  // When the person wants it used, from emojis.json.
  use?: string;
};

// What the person typed into the teaching pane for one emoji and has not saved yet.
export type EmojiDraft = { name?: string; use?: string };

// One bullet of the voice guide's Emoji section: the emoji it names and when to use them.
export type EmojiRule = { names: string[]; text: string };

// A run of rules under one heading line of the Emoji section ("Happy, proud, done:").
export type EmojiRuleGroup = { title: string; rules: EmojiRule[] };

// The Emoji section of the active output style, as the rules viewer shows it.
export type EmojiRules = {
  // The output style's name, from settings.
  style?: string;
  // The output style's file.
  guide?: string;
  // The section's opening paragraph: how emoji are used in general.
  intro: string;
  groups: EmojiRuleGroup[];
  // Why there are no rules to show, when there are none.
  problem?: string;
};

declare module 'claude-code' {
  interface PluginState {
    'discord-emoji': {
      // By name.
      emojis: Record<string, Emoji>;
      // The emoji folder the emojis were read from.
      folder: string;
      // The teaching pane's page, its filter, unsaved typing by file, and its last message.
      page: number;
      isUndescribedOnly: boolean;
      drafts: Record<string, EmojiDraft>;
      notice: string;
      // The drafts as the pane last drew them: copied from `drafts` on Enter, a page turn or the filter, so
      // typing never redraws a field under the person's cursor.
      shownDrafts: Record<string, EmojiDraft>;
      // The key of the pane's field that last took the focus, so moving away from it saves it.
      focused: string;
      // The rules viewer's content, read when it opens or reloads.
      rules: EmojiRules;
    };
  }
}
