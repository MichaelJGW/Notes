import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FilePlus, FileText } from 'lucide-react';
import { useLinkedNote } from '../useLinkedNote.js';
import { useWiki } from '../wiki.js';
import MarkdownView from './MarkdownView.jsx';
import { asDocument } from '../title.js';

const SHOW_DELAY = 350;
const HIDE_DELAY = 200;
const CARD_WIDTH = 380;

// Hover card for any element with data-wiki="<note title>" (editor, preview, backlinks).
// With `skipEditor` (Vim mode) links inside the editor are left to the docked LinkPeek instead.
export default function LinkPreview({ skipEditor = false }) {
  const wiki = useWiki();
  const [card, setCard] = useState(null); // { title, rect }
  const skipRef = useRef(skipEditor);
  skipRef.current = skipEditor;
  const showTimer = useRef(null);
  const hideTimer = useRef(null);
  const anchor = useRef(null);

  useEffect(() => {
    const over = (e) => {
      const el = e.target.closest?.('[data-wiki]');
      if (el && el === anchor.current) {
        clearTimeout(hideTimer.current);
        return;
      }
      if (!el || e.target.closest('.link-card') || (skipRef.current && el.closest('.md-editor'))) return;
      anchor.current = el;
      clearTimeout(hideTimer.current);
      clearTimeout(showTimer.current);
      showTimer.current = setTimeout(() => {
        if (anchor.current === el && el.isConnected) setCard({ title: el.dataset.wiki, rect: el.getBoundingClientRect() });
      }, SHOW_DELAY);
    };
    const out = (e) => {
      const el = e.target.closest?.('[data-wiki]');
      if (!el || el.contains(e.relatedTarget)) return;
      clearTimeout(showTimer.current);
      scheduleHide();
    };
    const scheduleHide = () => {
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        anchor.current = null;
        setCard(null);
      }, HIDE_DELAY);
    };
    const dismiss = () => {
      clearTimeout(showTimer.current);
      anchor.current = null;
      setCard(null);
    };
    document.addEventListener('mouseover', over);
    document.addEventListener('mouseout', out);
    const press = (e) => !e.target.closest('.link-card') && dismiss();
    document.addEventListener('mousedown', press);
    document.addEventListener('keydown', dismiss);
    return () => {
      document.removeEventListener('mouseover', over);
      document.removeEventListener('mouseout', out);
      document.removeEventListener('mousedown', press);
      document.removeEventListener('keydown', dismiss);
      clearTimeout(showTimer.current);
      clearTimeout(hideTimer.current);
    };
  }, []);

  const target = card ? wiki.resolve(card.title) : null;

  const content = useLinkedNote(target);

  if (!card) return null;

  const { rect } = card;
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - CARD_WIDTH - 8);
  const below = rect.bottom + 320 < window.innerHeight;
  const style = below ? { left, top: rect.bottom + 8 } : { left, bottom: window.innerHeight - rect.top + 8 };

  return createPortal(
    <div
      className={`link-card ${below ? 'below' : 'above'}`}
      style={style}
      onMouseEnter={() => clearTimeout(hideTimer.current)}
      onMouseLeave={() => {
        hideTimer.current = setTimeout(() => setCard(null), HIDE_DELAY);
      }}
    >
      {target ? (
        <>
          <header className="link-card-header">
            <FileText size={16} />
            <div>
              <div className="link-card-title">{target.title}</div>
              <div className="link-card-meta">{wiki.notebookName(target.notebook_id)}</div>
            </div>
          </header>
          <div className="link-card-body">
            {content ? (
              content.content.trim() ? (
                <MarkdownView content={asDocument(content.content.slice(0, 2000))} interactive={false} />
              ) : (
                <p className="muted">Empty note</p>
              )
            ) : (
              <div className="sk sk-line" style={{ width: '80%' }} />
            )}
          </div>
          <button
            className="link-card-open"
            onClick={() => {
              setCard(null);
              wiki.openNote(target);
            }}
          >
            Open note
          </button>
        </>
      ) : (
        <div className="link-card-missing">
          <FilePlus size={18} />
          <div>
            <div className="link-card-title">“{card.title}” doesn’t exist yet</div>
            <button
              className="btn primary small"
              onClick={() => {
                setCard(null);
                wiki.open(card.title);
              }}
            >
              Create note
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
