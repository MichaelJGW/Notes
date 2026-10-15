import { useRef } from 'react';
import { FilePlus, FolderPlus, Upload } from 'lucide-react';
import Tree from './Tree.jsx';

export default function Sidebar({ notebook: current, actions, readOnly, ...treeProps }) {
  const fileInput = useRef(null);

  return (
    <aside className="sidebar">
      {current && (
        <section className="side-card contents-card" key={current.id}>
          <header className="section-header">
            <h2>Contents</h2>
            {!readOnly && <>
            <button className="icon-btn" title="New note" onClick={() => actions.createNote(null)}>
              <FilePlus size={16} />
            </button>
            <button className="icon-btn" title="New group" onClick={() => actions.createGroup(null)}>
              <FolderPlus size={16} />
            </button>
            <button className="icon-btn" title="Import .md files" onClick={() => fileInput.current.click()}>
              <Upload size={16} />
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              accept=".md,.markdown,.txt,text/markdown"
              onChange={(e) => {
                actions.importFiles([...e.target.files], null);
                e.target.value = '';
              }}
            />
            </>}
          </header>
          <Tree {...treeProps} actions={actions} readOnly={readOnly} />
          <div className="tree-keys" aria-hidden="true">
            <span><kbd>j</kbd><kbd>k</kbd> move</span>
            <span><kbd>l</kbd> open</span>
            <span><kbd>h</kbd> close</span>
            {!readOnly && <>
              <span><kbd>a</kbd> note</span>
              <span><kbd>A</kbd> group</span>
              <span><kbd>r</kbd> rename</span>
              <span><kbd>d</kbd> delete</span>
            </>}
            <span><kbd>Esc</kbd> editor</span>
          </div>
        </section>
      )}
    </aside>
  );
}
