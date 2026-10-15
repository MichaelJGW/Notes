import { memo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import { WIKI_HREF_PREFIX, remarkWikiLinks, useWiki } from '../wiki.js';

// remark-breaks keeps single line breaks, so Preview shows lines exactly as Live mode does.
const remarkPlugins = [remarkGfm, remarkBreaks, remarkWikiLinks];
const rehypePlugins = [rehypeHighlight];

function WikiAnchor({ target, children, interactive }) {
  const wiki = useWiki();
  const resolved = wiki.resolve(target);
  return (
    <a
      href={WIKI_HREF_PREFIX + encodeURIComponent(target)}
      className={`wikilink${resolved ? '' : ' unresolved'}`}
      data-wiki={target}
      onClick={(e) => {
        e.preventDefault();
        if (interactive) wiki.open(target);
      }}
    >
      {children}
    </a>
  );
}

// Rendered Markdown with [[wiki links]]. `interactive` = links navigate on click;
// `onToggleTask(line)` makes task checkboxes clickable (line = 1-based source line).
function MarkdownView({ content, interactive = true, onToggleTask }) {
  const components = {
    // Code blocks carry the same language label as Live mode.
    pre: ({ node, children, ...props }) => {
      const cls = node?.children?.[0]?.properties?.className ?? [];
      const lang = cls.find((c) => String(c).startsWith('language-'))?.slice(9);
      return (
        <pre {...props}>
          {lang && <span className="cm-code-lang pre-lang">{lang}</span>}
          {children}
        </pre>
      );
    },
    // Task items get the same round checkbox as Live mode.
    li: ({ node, className, children, ...props }) => {
      if (!className?.includes('task-list-item')) return <li {...props}>{children}</li>;
      const line = node.position?.start.line;
      return (
        <li {...props} className={className} data-line={line}>
          {children}
        </li>
      );
    },
    input: ({ node, type, checked }) =>
      type === 'checkbox' ? (
        <span
          className={`cm-task${checked ? ' checked' : ''}${onToggleTask ? ' clickable' : ''}`}
          role="checkbox"
          aria-checked={!!checked}
          onClick={(e) => {
            const line = Number(e.currentTarget.closest('li')?.dataset.line);
            if (onToggleTask && line) onToggleTask(line);
          }}
        />
      ) : (
        <input type={type} />
      ),
    a: ({ node, href = '', children, ...props }) =>
      href.startsWith(WIKI_HREF_PREFIX) ? (
        <WikiAnchor target={decodeURIComponent(href.slice(WIKI_HREF_PREFIX.length))} interactive={interactive}>
          {children}
        </WikiAnchor>
      ) : (
        <a href={href} {...props} target="_blank" rel="noreferrer">
          {children}
        </a>
      ),
  };
  return (
    <div className="markdown-body">
      <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {content}
      </Markdown>
    </div>
  );
}

export default memo(MarkdownView);
