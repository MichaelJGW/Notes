import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { WIKI_LINK_RE } from '../wiki.js';

// Dispatched when the set of known notes changes, so link decorations re-resolve.
export const refreshLinks = StateEffect.define();

const hidden = Decoration.replace({});

class CheckboxWidget extends WidgetType {
  constructor(checked) {
    super();
    this.checked = checked;
  }
  eq(other) {
    return other.checked === this.checked;
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = `cm-task${this.checked ? ' checked' : ''}`;
    el.setAttribute('role', 'checkbox');
    el.setAttribute('aria-checked', String(this.checked));
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-bullet';
    return el;
  }
}

class RuleWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-rule';
    return el;
  }
}

class ImageWidget extends WidgetType {
  constructor(src, alt) {
    super();
    this.src = src;
    this.alt = alt;
  }
  eq(other) {
    return other.src === this.src && other.alt === this.alt;
  }
  toDOM() {
    const img = document.createElement('img');
    img.className = 'cm-image';
    img.src = this.src;
    img.alt = this.alt;
    return img;
  }
}

// Language label shown in place of an opening ``` fence.
class FenceWidget extends WidgetType {
  constructor(lang) {
    super();
    this.lang = lang;
  }
  eq(other) {
    return other.lang === this.lang;
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-code-lang';
    el.textContent = this.lang;
    return el;
  }
}

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const SAFE_URL = /^(https?:|mailto:|#|\/)/i;

// Minimal inline Markdown for table cells: code, [[wiki]], [links](url), bold, italic, strike.
function inlineHtml(text, resolve) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = escapeHtml(s)
    .replace(new RegExp(WIKI_LINK_RE.source, 'g'), (_, target, label) => {
      const t = target.trim();
      return `<span class="cm-wikilink${resolve(t) ? '' : ' unresolved'}" data-wiki="${t}"><span class="cm-rendered-link">${(label ?? target).trim()}</span></span>`;
    })
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) =>
      SAFE_URL.test(url) ? `<span class="cm-link" data-href="${url}"><span class="cm-rendered-link">${label}</span></span>` : m
    )
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escapeHtml(codes[i])}</code>`);
}

function splitRow(line) {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  return t.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

// A GFM table rendered like Preview mode, shown while the cursor is outside it.
class TableWidget extends WidgetType {
  constructor(source, resolve) {
    super();
    this.source = source;
    this.resolve = resolve;
  }
  eq(other) {
    return other.source === this.source;
  }
  toDOM() {
    const [head, delim, ...body] = this.source.split('\n');
    const aligns = splitRow(delim ?? '').map((c) =>
      c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : ''
    );
    const cell = (tag, text, i) =>
      `<${tag}${aligns[i] ? ` style="text-align:${aligns[i]}"` : ''}>${inlineHtml(text, this.resolve)}</${tag}>`;
    const wrap = document.createElement('div');
    wrap.className = 'cm-table-widget markdown-body';
    wrap.innerHTML =
      `<table><thead><tr>${splitRow(head).map((c, i) => cell('th', c, i)).join('')}</tr></thead>` +
      `<tbody>${body.map((row) => `<tr>${splitRow(row).map((c, i) => cell('td', c, i)).join('')}</tr>`).join('')}</tbody></table>`;
    return wrap;
  }
  ignoreEvent() {
    return false;
  }
}

const bullet = Decoration.replace({ widget: new BulletWidget() });
const rule = Decoration.replace({ widget: new RuleWidget() });
const mark = (cls, attributes) => Decoration.mark({ class: cls, attributes });
const lineClass = (cls) => Decoration.line({ class: cls });

const CODE_NODES = new Set(['InlineCode', 'FencedCode', 'CodeBlock', 'CodeText']);

function insideCode(tree, pos) {
  for (let n = tree.resolveInner(pos, 1); n; n = n.parent) if (CODE_NODES.has(n.name)) return true;
  return false;
}

// Lines that hold a cursor/selection show raw Markdown; every other line renders.
function activeLines(view) {
  const lines = new Set();
  if (!view.hasFocus) return lines;
  const { doc } = view.state;
  for (const r of view.state.selection.ranges) {
    const last = doc.lineAt(r.to).number;
    for (let i = doc.lineAt(r.from).number; i <= last; i++) lines.add(i);
  }
  return lines;
}

function buildLive(view) {
  const { state } = view;
  const { doc } = state;
  const active = activeLines(view);
  const isActive = (from, to = from) => {
    const last = doc.lineAt(to).number;
    for (let i = doc.lineAt(from).number; i <= last; i++) if (active.has(i)) return true;
    return false;
  };
  const decos = [];
  const add = (deco, from, to = from) => decos.push(deco.range(from, to));
  const eachLine = (from, to, cls) => {
    for (let l = doc.lineAt(from); ; l = doc.line(l.number + 1)) {
      add(lineClass(cls), l.from);
      if (l.to >= to || l.number === doc.lines) break;
    }
  };
  const tree = syntaxTree(state);

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        const { name } = node;
        const render = !isActive(node.from, node.to);

        const heading = name.match(/^ATXHeading(\d)$/);
        if (heading) {
          add(lineClass(`cm-h cm-h${heading[1]}`), doc.lineAt(node.from).from);
          return;
        }
        switch (name) {
          case 'HeaderMark': {
            if (!render) return;
            const end = doc.sliceString(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to;
            if (end > node.from) add(hidden, node.from, end);
            return;
          }
          case 'Emphasis':
            add(mark('cm-em'), node.from, node.to);
            return;
          case 'StrongEmphasis':
            add(mark('cm-strong'), node.from, node.to);
            return;
          case 'Strikethrough':
            add(mark('cm-strike'), node.from, node.to);
            return;
          case 'InlineCode':
            add(mark('cm-inline-code'), node.from, node.to);
            return;
          case 'EmphasisMark':
          case 'StrikethroughMark':
            if (render) add(hidden, node.from, node.to);
            return;
          case 'CodeMark':
            if (node.node.parent?.name === 'InlineCode') {
              if (render) add(hidden, node.from, node.to);
            } else add(mark('cm-fence'), node.from, node.to);
            return;
          case 'CodeInfo':
            add(mark('cm-fence'), node.from, node.to);
            return;
          case 'FencedCode': {
            eachLine(node.from, node.to, 'cm-codeblock');
            const open = doc.lineAt(node.from);
            const close = doc.lineAt(node.to);
            add(lineClass('cm-codeblock-first'), open.from);
            add(lineClass('cm-codeblock-last'), close.from);
            // Off the cursor, fences turn into a language label and a thin closing edge.
            if (render) {
              const lang = node.node.getChild('CodeInfo');
              add(lineClass('cm-fence-open'), open.from);
              add(Decoration.replace({ widget: new FenceWidget(lang ? doc.sliceString(lang.from, lang.to) : '') }), open.from, open.to);
              if (close.number > open.number && /^\s*(`{3,}|~{3,})\s*$/.test(close.text)) {
                add(lineClass('cm-fence-close'), close.from);
                if (close.to > close.from) add(hidden, close.from, close.to);
              }
              return false;
            }
            return;
          }
          case 'Blockquote':
            eachLine(node.from, node.to, 'cm-quote');
            return;
          case 'QuoteMark': {
            if (!render) return;
            const end = doc.sliceString(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to;
            add(hidden, node.from, end);
            return;
          }
          case 'Table':
            eachLine(node.from, node.to, 'cm-table'); // raw (cursor inside); otherwise tableField replaces it
            return false;
          case 'HorizontalRule':
            if (render) add(rule, node.from, node.to);
            return;
          case 'Link': {
            const marks = node.node.getChildren('LinkMark');
            const url = node.node.getChild('URL');
            if (marks.length < 2 || !url) return;
            const href = doc.sliceString(url.from, url.to);
            const textFrom = marks[0].to;
            const textTo = marks[1].from;
            add(mark('cm-link', { 'data-href': href }), textFrom, textTo);
            if (render && textTo > textFrom) {
              add(hidden, node.from, textFrom);
              add(hidden, textTo, node.to);
              add(mark('cm-rendered-link'), textFrom, textTo);
            }
            return;
          }
          case 'Image': {
            const url = node.node.getChild('URL');
            if (!render || !url) return;
            const marks = node.node.getChildren('LinkMark');
            const alt = marks.length >= 2 ? doc.sliceString(marks[0].to, marks[1].from) : '';
            add(Decoration.replace({ widget: new ImageWidget(doc.sliceString(url.from, url.to), alt) }), node.from, node.to);
            return false;
          }
          case 'ListMark': {
            const item = node.node.parent;
            const list = item?.parent;
            const end = doc.sliceString(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to;
            if (list?.name === 'BulletList') {
              const isTask = !!item.getChild('Task');
              if (isTask) {
                if (render) add(hidden, node.from, end);
              } else if (render) add(bullet, node.from, node.to);
            } else add(mark('cm-list-number'), node.from, node.to);
            return;
          }
          case 'TaskMarker': {
            const checked = /x/i.test(doc.sliceString(node.from, node.to));
            add(Decoration.replace({ widget: new CheckboxWidget(checked) }), node.from, node.to);
            if (checked) add(lineClass('cm-task-done'), doc.lineAt(node.from).from);
            return;
          }
        }
      },
    });

    // Hide [[ ]] (and "Target|" for aliased links) on rendered lines.
    for (let pos = from; pos <= to; ) {
      const line = doc.lineAt(pos);
      pos = line.to + 1;
      if (!line.text.includes('[[') || active.has(line.number)) continue;
      for (const m of line.text.matchAll(WIKI_LINK_RE)) {
        const start = line.from + m.index;
        if (insideCode(tree, start)) continue;
        const end = start + m[0].length;
        const labelFrom = m[2] ? start + m[0].indexOf('|') + 1 : start + 2;
        add(hidden, start, labelFrom);
        add(hidden, end - 2, end);
        add(mark('cm-rendered-link'), labelFrom, end - 2);
      }
    }
  }

  return Decoration.set(decos, true);
}

// Always on (live and source): style [[links]] and tag them for hover previews and clicks.
function buildWikiMarks(view, resolve) {
  const { doc } = view.state;
  const tree = syntaxTree(view.state);
  const decos = [];
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = doc.lineAt(pos);
      pos = line.to + 1;
      if (!line.text.includes('[[')) continue;
      for (const m of line.text.matchAll(WIKI_LINK_RE)) {
        const start = line.from + m.index;
        if (insideCode(tree, start)) continue;
        const target = m[1].trim();
        const cls = `cm-wikilink${resolve(target) ? '' : ' unresolved'}`;
        decos.push(mark(cls, { 'data-wiki': target }).range(start, start + m[0].length));
      }
    }
  }
  return Decoration.set(decos, true);
}

function decorationPlugin(build) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = build(view);
      }
      update(u) {
        if (
          u.docChanged ||
          u.viewportChanged ||
          u.selectionSet ||
          u.focusChanged ||
          syntaxTree(u.startState) !== syntaxTree(u.state) ||
          u.transactions.some((tr) => tr.effects.some((e) => e.is(refreshLinks)))
        ) {
          this.decorations = build(u.view);
        }
      }
    },
    { decorations: (v) => v.decorations }
  );
}

function toggleCheckbox(view, el) {
  const pos = view.posAtDOM(el);
  const text = view.state.sliceDoc(pos, pos + 3);
  if (!/^\[[ xX]\]$/.test(text)) return;
  view.dispatch({ changes: { from: pos + 1, to: pos + 2, insert: text[1] === ' ' ? 'x' : ' ' }, userEvent: 'input' });
}

// Click handling shared by both modes. `callbacks.current.openWiki(title)` opens/creates notes.
function linkClicks(callbacks) {
  return EditorView.domEventHandlers({
    mousedown(e, view) {
      const task = e.target.closest('.cm-task');
      if (task) {
        e.preventDefault();
        toggleCheckbox(view, task);
        return true;
      }
      const rendered = e.target.closest('.cm-rendered-link');
      const modClick = e.ctrlKey || e.metaKey;
      if (!rendered && !modClick) return false;
      const wiki = e.target.closest('[data-wiki]');
      const link = e.target.closest('[data-href]');
      if (wiki) {
        e.preventDefault();
        callbacks.current.openWiki(wiki.dataset.wiki);
        return true;
      }
      if (link) {
        e.preventDefault();
        window.open(link.dataset.href, '_blank', 'noopener');
        return true;
      }
      return false;
    },
  });
}

// Line 1 is the note's title in every mode (it always starts at position 0, so the set never needs mapping).
export const titleLine = EditorView.decorations.of(Decoration.set([Decoration.line({ class: 'cm-title-line' }).range(0)]));

// Tables span several lines, so their replacement must come from a state field (not a view plugin).
function tableField(callbacks) {
  const build = (state) => {
    const decos = [];
    const sel = state.selection.ranges;
    syntaxTree(state).iterate({
      enter: (node) => {
        if (node.name !== 'Table') return;
        const from = state.doc.lineAt(node.from).from;
        const to = state.doc.lineAt(node.to).to;
        if (sel.some((r) => r.to >= from && r.from <= to)) return false; // editing: show raw
        const widget = new TableWidget(state.doc.sliceString(from, to), (t) => callbacks.current.resolve(t));
        decos.push(Decoration.replace({ widget, block: true }).range(from, to));
        return false;
      },
    });
    return Decoration.set(decos);
  };
  return StateField.define({
    create: build,
    update: (value, tr) =>
      tr.docChanged || tr.selection || syntaxTree(tr.startState) !== syntaxTree(tr.state) ? build(tr.state) : value,
    provide: (f) => EditorView.decorations.from(f),
  });
}

export function livePreview(callbacks) {
  return [decorationPlugin(buildLive), tableField(callbacks), EditorView.editorAttributes.of({ class: 'cm-live' })];
}

export function wikiLinks(callbacks) {
  return [decorationPlugin((view) => buildWikiMarks(view, (t) => callbacks.current.resolve(t))), linkClicks(callbacks)];
}
