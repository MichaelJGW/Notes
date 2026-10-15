import { ExternalLink, FilePlus, FileText } from 'lucide-react';
import { useWiki } from '../wiki.js';
import { asDocument } from '../title.js';
import { useLinkedNote } from '../useLinkedNote.js';
import MarkdownView from './MarkdownView.jsx';

// Docked preview of the link under the Vim cursor, shown below the note instead of over it.
export default function LinkPeek({ link }) {
  const wiki = useWiki();
  const target = link.type === 'wiki' ? wiki.resolve(link.target) : null;
  const note = useLinkedNote(target);

  let icon;
  let heading;
  let meta;
  let body;
  if (link.type === 'url') {
    icon = <ExternalLink size={15} />;
    heading = link.target;
    meta = 'External link';
    body = null;
  } else if (!target) {
    icon = <FilePlus size={15} />;
    heading = link.target;
    meta = 'No note with this title yet';
    body = <p className="muted">Press <kbd>g</kbd><kbd>d</kbd> to create it.</p>;
  } else {
    icon = <FileText size={15} />;
    heading = target.title;
    meta = wiki.notebookName(target.notebook_id);
    body = note ? (
      note.content.trim() ? (
        <MarkdownView content={asDocument(note.content.slice(0, 4000))} interactive={false} />
      ) : (
        <p className="muted">Empty note</p>
      )
    ) : (
      <div className="sk sk-line" style={{ width: '70%' }} />
    );
  }

  return (
    <aside className={`link-peek${target || link.type === 'url' ? '' : ' unresolved'}`} aria-label="Link preview">
      <header className="peek-header" key={link.target}>
        <span className="peek-icon">{icon}</span>
        <span className="peek-title">{heading}</span>
        <span className="peek-meta">{meta}</span>
        <span className="peek-hint">
          <kbd>g</kbd>
          <kbd>d</kbd> {link.type === 'url' ? 'open in browser' : target ? 'open' : 'create'}
        </span>
      </header>
      {body && (
        <div className="peek-body" key={`b-${link.target}`}>
          {body}
        </div>
      )}
    </aside>
  );
}
