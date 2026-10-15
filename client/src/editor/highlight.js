import { HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

// Token classes are styled in styles.css so they follow the light/dark tokens.
export const markdownHighlight = HighlightStyle.define([
  { tag: t.heading, class: 'tok-heading' },
  { tag: t.emphasis, class: 'tok-em' },
  { tag: t.strong, class: 'tok-strong' },
  { tag: t.strikethrough, class: 'tok-strike' },
  { tag: t.link, class: 'tok-link' },
  { tag: t.url, class: 'tok-url' },
  { tag: t.monospace, class: 'tok-code' },
  { tag: t.quote, class: 'tok-quote' },
  { tag: t.list, class: 'tok-list' },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], class: 'tok-mark' },
  { tag: [t.keyword, t.modifier, t.controlKeyword], class: 'tok-keyword' },
  { tag: [t.string, t.special(t.string), t.regexp], class: 'tok-string' },
  { tag: [t.comment, t.lineComment, t.blockComment], class: 'tok-comment' },
  { tag: [t.number, t.bool, t.null, t.atom], class: 'tok-number' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], class: 'tok-function' },
  { tag: [t.typeName, t.className, t.tagName], class: 'tok-type' },
  { tag: [t.propertyName, t.attributeName], class: 'tok-property' },
  { tag: t.operator, class: 'tok-operator' },
]);
