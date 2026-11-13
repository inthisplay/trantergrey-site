'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DragEvent, KeyboardEvent, ReactNode } from 'react';
import { BaseEditor, createEditor, Editor, Element as SlateElement, Transforms, type Descendant } from 'slate';
import { Editable, ReactEditor, Slate, withReact, type RenderElementProps, type RenderLeafProps } from 'slate-react';

type ProductionCommentEditorProps = { client?: string | null; initialValue?: Descendant[]; onChange: (value: Descendant[]) => void };
type TextAlign = 'left' | 'center' | 'right' | 'justify';
type MuxItemKind = 'video' | 'ratio-group' | 'collection';
type MuxEmbedVideo = { id: string; title: string; client: string | null; thumbnailUrl: string | null; playerUrl: string | null };
type CommentElement = { type: 'paragraph' | 'heading-one' | 'heading-two' | 'block-quote' | 'bulleted-list' | 'numbered-list' | 'list-item' | 'mux-asset' | 'attachment'; align?: TextAlign; assetId?: string; attachmentId?: string; filename?: string; contentType?: string; byteSize?: number; title?: string; client?: string | null; duration?: number; thumbnailUrl?: string | null; itemKind?: MuxItemKind; href?: string; ratioCount?: number; videoCount?: number; media?: MuxEmbedVideo[]; children: Descendant[] };
type CommentText = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; code?: boolean };
type MuxPickerAsset = { id: string; kind: MuxItemKind; title: string; client: string | null; duration: number; thumbnailUrl: string | null; playerUrl: string | null; href: string; ratioCount?: number; videoCount?: number; clients?: string[]; children?: MuxPickerAsset[] };

declare module 'slate' {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor;
    Element: CommentElement;
    Text: CommentText;
  }
}
const emptyValue: Descendant[] = [{ type: 'paragraph', children: [{ text: '' }] }];
const isEmptyComment = (value: Descendant[]) => value.length === 1 && SlateElement.isElement(value[0]) && value[0].type === 'paragraph' && value[0].children.every((child) => 'text' in child && child.text === '');
const duration = (value: number) => `${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, '0')}`;
const withMuxAssets = (editor: BaseEditor & ReactEditor) => {
  const { isVoid } = editor;
  editor.isVoid = (element) => element.type === 'mux-asset' || element.type === 'attachment' || isVoid(element);
  return editor;
};

const isMarkActive = (editor: Editor, format: 'bold' | 'italic' | 'underline' | 'code') => Boolean(Editor.marks(editor)?.[format]);
const toggleMark = (editor: Editor, format: 'bold' | 'italic' | 'underline' | 'code') => {
  if (isMarkActive(editor, format)) Editor.removeMark(editor, format);
  else Editor.addMark(editor, format, true);
};
const isBlockActive = (editor: Editor, format: CommentElement['type']) => {
  const [match] = Editor.nodes(editor, { match: (node) => !Editor.isEditor(node) && SlateElement.isElement(node) && node.type === format });
  return Boolean(match);
};
const toggleBlock = (editor: Editor, format: CommentElement['type']) => {
  const isList = format === 'bulleted-list' || format === 'numbered-list';
  const active = isBlockActive(editor, format);
  Transforms.unwrapNodes(editor, { match: (node) => !Editor.isEditor(node) && SlateElement.isElement(node) && (node.type === 'bulleted-list' || node.type === 'numbered-list'), split: true });
  Transforms.setNodes<CommentElement>(editor, { type: active ? 'paragraph' : isList ? 'list-item' : format });
  if (!active && isList) Transforms.wrapNodes(editor, { type: format, children: [] });
};
const isAlignActive = (editor: Editor, align: TextAlign) => {
  const [match] = Editor.nodes(editor, { match: (node) => !Editor.isEditor(node) && SlateElement.isElement(node) && node.align === align });
  return Boolean(match);
};
const toggleAlignment = (editor: Editor, align: TextAlign) => {
  Transforms.setNodes<CommentElement>(editor, { align: isAlignActive(editor, align) ? undefined : align });
};

function Leaf({ attributes, children, leaf }: RenderLeafProps) {
  let output = children;
  if (leaf.bold) output = <strong>{output}</strong>;
  if (leaf.italic) output = <em>{output}</em>;
  if (leaf.underline) output = <u>{output}</u>;
  if (leaf.code) output = <code>{output}</code>;
  return <span {...attributes}>{output}</span>;
}
function Element({ attributes, children, element }: RenderElementProps) {
  const style = element.align ? { textAlign: element.align } : undefined;
  if (element.type === 'heading-one') return <h2 {...attributes} style={style}>{children}</h2>;
  if (element.type === 'heading-two') return <h3 {...attributes} style={style}>{children}</h3>;
  if (element.type === 'block-quote') return <blockquote {...attributes} style={style}>{children}</blockquote>;
  if (element.type === 'bulleted-list') return <ul {...attributes}>{children}</ul>;
  if (element.type === 'numbered-list') return <ol {...attributes}>{children}</ol>;
  if (element.type === 'list-item') return <li {...attributes}>{children}</li>;
  if (element.type === 'mux-asset') {
    const typeLabel = element.itemKind === 'collection' ? 'Collection' : element.itemKind === 'ratio-group' ? `${element.ratioCount || 0} ratio group` : Number.isFinite(element.duration) ? duration(element.duration || 0) : 'Video';
    const media = element.media?.length ? element.media : [{ id: element.assetId || '', title: element.title || 'Mux video', client: element.client || null, thumbnailUrl: element.thumbnailUrl || null, playerUrl: null }];
    return <div {...attributes} className="production-comment-mux-embed"><div contentEditable={false}><div className="production-comment-mux-videos">{media.map((video) => video.playerUrl ? <iframe key={video.id} src={video.playerUrl} title={video.title} allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;" allowFullScreen /> : <div className="production-comment-mux-unavailable" key={video.id}>{video.thumbnailUrl && <img src={video.thumbnailUrl} alt="" />}<span>Preview unavailable</span></div>)}</div><div className="production-comment-mux-caption">{element.client && <small>{element.client}</small>}<strong>{element.title || 'Mux video'}</strong><em>{typeLabel}</em></div><a className="production-comment-mux-public-link" href={element.href || `/watch/${encodeURIComponent(element.assetId || '')}`} target="_blank" rel="noreferrer">Open public page ↗</a></div>{children}</div>;
  }
  if (element.type === 'attachment') {
    const url = typeof element.attachmentId === 'string' ? `/api/admin/production-board/attachments/${encodeURIComponent(element.attachmentId)}` : '';
    const label = element.filename || 'Attachment';
    const type = element.contentType || '';
    return <figure {...attributes} className="production-comment-upload"><div contentEditable={false}>{type.startsWith('image/') && url ? <img src={url} alt={label} /> : type.startsWith('video/') && url ? <video controls preload="metadata" src={url} /> : type.startsWith('audio/') && url ? <audio controls preload="metadata" src={url} /> : null}<figcaption><a href={url} target="_blank" rel="noreferrer">{label}</a>{element.byteSize ? <small>{Math.ceil(element.byteSize / 1024)} KB</small> : null}</figcaption></div>{children}</figure>;
  }
  return <p {...attributes} style={style}>{children}</p>;
}

export function ProductionCommentEditor({ client, initialValue = emptyValue, onChange, cardId }: ProductionCommentEditorProps & { cardId?: string }) {
  const editor = useMemo(() => withMuxAssets(withReact(createEditor())), []);
  const renderElement = useCallback((props: RenderElementProps) => <Element {...props} />, []);
  const renderLeaf = useCallback((props: RenderLeafProps) => <Leaf {...props} />, []);
  const [isEmpty, setIsEmpty] = useState(() => isEmptyComment(initialValue));
  const update = (nextValue: Descendant[]) => { setIsEmpty(isEmptyComment(nextValue)); onChange(nextValue); };
  const [muxPickerOpen, setMuxPickerOpen] = useState(false);
  const [muxAssets, setMuxAssets] = useState<MuxPickerAsset[]>([]);
  const [muxSearch, setMuxSearch] = useState(client || '');
  const [expandedMuxItems, setExpandedMuxItems] = useState<string[]>([]);
  const [muxLoading, setMuxLoading] = useState(false);
  const [muxRequested, setMuxRequested] = useState(false);
  const [muxError, setMuxError] = useState('');
  const [dragDepth, setDragDepth] = useState(0);
  const [uploading, setUploading] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState('');
  useEffect(() => {
    if (!muxPickerOpen || muxRequested) return;
    setMuxRequested(true);
    setMuxLoading(true); setMuxError('');
    fetch('/api/mux/library', { cache: 'no-store' }).then(async (response) => {
      const payload = await response.json() as { commentItems?: MuxPickerAsset[]; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Unable to load the Mux library.');
      setMuxAssets(payload.commentItems || []);
    }).catch((error: unknown) => setMuxError(error instanceof Error ? error.message : 'Unable to load the Mux library.')).finally(() => setMuxLoading(false));
  }, [muxPickerOpen, muxRequested]);
  useEffect(() => { setMuxSearch(client || ''); }, [client]);
  const visibleMuxAssets = muxAssets.filter((asset) => `${asset.title} ${asset.client || ''} ${asset.clients?.join(' ') || ''} ${asset.id} ${asset.kind}`.toLowerCase().includes(muxSearch.trim().toLowerCase())).slice(0, 8);
  const insertMuxAsset = (asset: MuxPickerAsset) => {
    const selectedMedia = (asset.children?.length ? asset.children : [asset]).map((item) => ({ id: item.id, title: item.title, client: item.client, thumbnailUrl: item.thumbnailUrl, playerUrl: item.playerUrl }));
    Transforms.insertNodes(editor, { type: 'mux-asset', assetId: asset.id, itemKind: asset.kind, href: asset.href, title: asset.title, client: asset.client, duration: asset.duration, thumbnailUrl: asset.thumbnailUrl, ratioCount: asset.ratioCount, videoCount: asset.videoCount, media: selectedMedia, children: [{ text: '' }] });
    Transforms.insertNodes(editor, { type: 'paragraph', children: [{ text: '' }] });
    setMuxPickerOpen(false); setMuxSearch(client || '');
  };
  const muxItemLabel = (item: MuxPickerAsset) => item.kind === 'collection' ? `Collection · ${item.videoCount || 0} videos` : item.kind === 'ratio-group' ? `Ratio group · ${item.ratioCount || 0} ratios` : duration(item.duration);
  const toggleMuxItem = (id: string) => setExpandedMuxItems((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!event.metaKey && !event.ctrlKey) return;
    if (['b', 'i', 'u', '`'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      const shortcutFormats = { b: 'bold', i: 'italic', u: 'underline', '`': 'code' } as const;
      toggleMark(editor, shortcutFormats[event.key.toLowerCase() as keyof typeof shortcutFormats]);
    }
  };
  const uploadFiles = async (files: File[]) => {
    if (!cardId || !files.length) return;
    setUploadError('');
    setUploading(files.map((file) => file.name));
    try {
      for (const file of files) {
        const response = await fetch(`/api/admin/production-board/${encodeURIComponent(cardId)}/attachments`, { method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream', 'x-file-name': file.name, 'x-file-size': String(file.size) }, body: file });
        const payload = await response.json() as { attachment?: { sourceId: string; filename: string; contentType: string; byteSize: number }; error?: string };
        if (!response.ok || !payload.attachment) throw new Error(payload.error || `Unable to upload ${file.name}.`);
        Transforms.insertNodes(editor, { type: 'attachment', attachmentId: payload.attachment.sourceId, filename: payload.attachment.filename, contentType: payload.attachment.contentType, byteSize: payload.attachment.byteSize, children: [{ text: '' }] });
        Transforms.insertNodes(editor, { type: 'paragraph', children: [{ text: '' }] });
      }
    } catch (error) { setUploadError(error instanceof Error ? error.message : 'Unable to upload this file.'); }
    finally { setUploading([]); }
  };
  const onDrop = (event: DragEvent<HTMLElement>) => { event.preventDefault(); setDragDepth(0); void uploadFiles(Array.from(event.dataTransfer.files)); };
  const ToolbarButton = ({ label, title, active, onMouseDown }: { label: ReactNode; title: string; active?: boolean; onMouseDown: () => void }) => <button type="button" title={title} aria-label={title} className={active ? 'is-active' : ''} onMouseDown={(event) => { event.preventDefault(); onMouseDown(); }}>{label}</button>;

  return <section className={`production-comment-composer${dragDepth > 0 ? ' is-dropping' : ''}`} aria-label="Comment composer" onDragEnter={(event) => { event.preventDefault(); setDragDepth((depth) => depth + 1); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { event.preventDefault(); setDragDepth((depth) => Math.max(0, depth - 1)); }} onDrop={onDrop}>
    <div className="production-comment-composer-bar"><div className="production-comment-tools" aria-label="Text formatting">
      <ToolbarButton label={<b>B</b>} title="Bold" active={isMarkActive(editor, 'bold')} onMouseDown={() => toggleMark(editor, 'bold')} />
      <ToolbarButton label={<i>I</i>} title="Italic" active={isMarkActive(editor, 'italic')} onMouseDown={() => toggleMark(editor, 'italic')} />
      <ToolbarButton label={<u>U</u>} title="Underline" active={isMarkActive(editor, 'underline')} onMouseDown={() => toggleMark(editor, 'underline')} />
      <ToolbarButton label="&lt;/&gt;" title="Code" active={isMarkActive(editor, 'code')} onMouseDown={() => toggleMark(editor, 'code')} />
      <span className="production-comment-tool-divider" />
      <ToolbarButton label="H1" title="Large heading" active={isBlockActive(editor, 'heading-one')} onMouseDown={() => toggleBlock(editor, 'heading-one')} />
      <ToolbarButton label="H2" title="Small heading" active={isBlockActive(editor, 'heading-two')} onMouseDown={() => toggleBlock(editor, 'heading-two')} />
      <ToolbarButton label="❝" title="Quote" active={isBlockActive(editor, 'block-quote')} onMouseDown={() => toggleBlock(editor, 'block-quote')} />
      <ToolbarButton label="1." title="Numbered list" active={isBlockActive(editor, 'numbered-list')} onMouseDown={() => toggleBlock(editor, 'numbered-list')} />
      <ToolbarButton label="•" title="Bulleted list" active={isBlockActive(editor, 'bulleted-list')} onMouseDown={() => toggleBlock(editor, 'bulleted-list')} />
      <span className="production-comment-tool-divider" />
      <ToolbarButton label={<><span className="production-comment-mux-play">▶</span><span>MUX</span></>} title="Attach Mux video" active={muxPickerOpen} onMouseDown={() => setMuxPickerOpen((open) => !open)} />
      <span className="production-comment-tool-divider" />
      <ToolbarButton label="≡" title="Align left" active={isAlignActive(editor, 'left')} onMouseDown={() => toggleAlignment(editor, 'left')} />
      <ToolbarButton label="≡" title="Align center" active={isAlignActive(editor, 'center')} onMouseDown={() => toggleAlignment(editor, 'center')} />
      <ToolbarButton label="≡" title="Align right" active={isAlignActive(editor, 'right')} onMouseDown={() => toggleAlignment(editor, 'right')} />
      <ToolbarButton label="☰" title="Justify" active={isAlignActive(editor, 'justify')} onMouseDown={() => toggleAlignment(editor, 'justify')} />
    </div></div>{muxPickerOpen && <div className="production-mux-picker"><input autoFocus value={muxSearch} onChange={(event) => setMuxSearch(event.target.value)} placeholder="Search Mux title, client, or ID…" aria-label="Search Mux library" />{muxLoading && <p>Loading Mux library…</p>}{muxError && <p>{muxError}</p>}{!muxLoading && !muxError && <div>{visibleMuxAssets.map((asset) => <div className="production-mux-picker-item" key={asset.id}><div><button type="button" className="production-mux-picker-select" onMouseDown={(event) => { event.preventDefault(); insertMuxAsset(asset); }}><>{asset.thumbnailUrl ? <img src={asset.thumbnailUrl} alt="" /> : <span className="production-mux-picker-placeholder" />}</><span>{asset.client && <small>{asset.client}</small>}<b>{asset.title}</b><em>{muxItemLabel(asset)}</em></span></button>{asset.children && asset.children.length > 0 && <button type="button" className="production-mux-picker-twirl" aria-label={`Show videos in ${asset.title}`} aria-expanded={expandedMuxItems.includes(asset.id)} onMouseDown={(event) => { event.preventDefault(); toggleMuxItem(asset.id); }}>{expandedMuxItems.includes(asset.id) ? '⌄' : '›'}</button>}</div>{expandedMuxItems.includes(asset.id) && asset.children && <div className="production-mux-picker-children">{asset.children.map((child) => <button type="button" key={child.id} onMouseDown={(event) => { event.preventDefault(); insertMuxAsset(child); }}>{child.thumbnailUrl ? <img src={child.thumbnailUrl} alt="" /> : <span className="production-mux-picker-placeholder" />}<span>{child.client && <small>{child.client}</small>}<b>{child.title}</b><em>{muxItemLabel(child)}</em></span></button>)}</div>}</div>)}{muxAssets.length > 0 && visibleMuxAssets.length === 0 && <p>No Mux videos match that search.</p>}</div>}</div>}
    <Slate editor={editor} initialValue={initialValue} onValueChange={update}><div className="production-comment-editor-wrap"><Editable className="production-comment-editor" renderElement={renderElement} renderLeaf={renderLeaf} onKeyDown={onKeyDown} aria-label="Add an update, question, or useful context" />{isEmpty && <span className="production-comment-placeholder" aria-hidden="true">Add an update, question, or useful context…</span>}</div></Slate>{dragDepth > 0 && <div className="production-comment-drop-message">Drop files to attach them</div>}{uploading.length > 0 && <p className="production-comment-upload-status">Uploading {uploading.join(', ')}…</p>}{uploadError && <p className="production-comment-upload-error">{uploadError}</p>}
  </section>;
}
