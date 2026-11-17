'use client';

import { useRef } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';

type ProductionNotesEditorProps = {
  initialHtml: string;
  disabled?: boolean;
  onChange: (html: string) => void;
};

const format = (command: string, value?: string) => document.execCommand(command, false, value);

export function ProductionNotesEditor({ initialHtml, disabled = false, onChange }: ProductionNotesEditorProps) {
  const editor = useRef<HTMLDivElement>(null);

  const emitChange = () => {
    if (editor.current) onChange(editor.current.innerHTML);
  };

  const insertChecklist = () => {
    editor.current?.focus();
    format('insertHTML', '<ul class="production-note-checklist"><li><input type="checkbox"><span>New task</span></li></ul><p><br></p>');
    emitChange();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.metaKey || event.ctrlKey) return;
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    let block = anchor instanceof Element ? anchor.closest('p, div') : anchor?.parentElement?.closest('p, div');
    const task = anchor instanceof Element ? anchor.closest('.production-note-checklist li') : anchor?.parentElement?.closest('.production-note-checklist li');
    if (task && editor.current?.contains(task)) {
      event.preventDefault();
      const taskText = task.querySelector('span')?.textContent?.trim() || '';
      const list = task.closest('.production-note-checklist');
      if (!taskText && list) {
        const paragraph = document.createElement('p');
        paragraph.innerHTML = '<br>';
        task.remove();
        list.after(paragraph);
        if (!list.querySelector('li')) list.remove();
        const range = document.createRange();
        range.selectNodeContents(paragraph);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
        emitChange();
        return;
      }
      const nextTask = document.createElement('li');
      nextTask.innerHTML = '<input type="checkbox"><span><br></span>';
      task.after(nextTask);
      const nextText = nextTask.querySelector('span');
      if (nextText) {
        const range = document.createRange();
        range.selectNodeContents(nextText);
        range.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      emitChange();
      return;
    }
    if (block === editor.current && block?.textContent?.trim().toLowerCase() === 'todo') {
      block.innerHTML = '<p>todo</p>';
      block = block.firstElementChild;
    }
    if (!block || block === editor.current || !editor.current?.contains(block) || block.closest('li') || block.textContent?.trim().toLowerCase() !== 'todo') return;
    event.preventDefault();
    block.outerHTML = '<ul class="production-note-checklist"><li><input type="checkbox"><span><br></span></li></ul><p><br></p>';
    const firstTask = editor.current.querySelector('.production-note-checklist li span');
    if (firstTask) {
      const range = document.createRange();
      range.selectNodeContents(firstTask);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    emitChange();
  };
  const handleChecklistChange = (event: ChangeEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === 'checkbox' && target.closest('.production-note-checklist')) {
      if (target.checked) target.setAttribute('checked', '');
      else target.removeAttribute('checked');
      emitChange();
    }
  };

  const ToolbarButton = ({ label, title, command, value }: { label: string; title: string; command: string; value?: string }) => <button type="button" title={title} aria-label={title} disabled={disabled} onMouseDown={(event) => { event.preventDefault(); editor.current?.focus(); format(command, value); emitChange(); }}>{label}</button>;

  return <div className="production-notes-editor">
    <div className="production-notes-toolbar" aria-label="Notes formatting">
      <ToolbarButton label="B" title="Bold" command="bold" />
      <ToolbarButton label="I" title="Italic" command="italic" />
      <ToolbarButton label="U" title="Underline" command="underline" />
      <span aria-hidden="true" />
      <ToolbarButton label="H1" title="Large heading" command="formatBlock" value="h2" />
      <ToolbarButton label="H2" title="Small heading" command="formatBlock" value="h3" />
      <ToolbarButton label="1." title="Numbered list" command="insertOrderedList" />
      <ToolbarButton label="•" title="Bulleted list" command="insertUnorderedList" />
      <button type="button" title="Insert checklist" aria-label="Insert checklist" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={insertChecklist}>☑</button>
    </div>
    <div ref={editor} className="production-notes-editable" contentEditable={!disabled} suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: initialHtml }} onInput={emitChange} onChange={handleChecklistChange} onKeyDown={handleKeyDown} aria-label="Card notes" data-placeholder="Add notes…" />
  </div>;
}
