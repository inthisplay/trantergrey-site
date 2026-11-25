const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const localName = (node: Element) => node.localName || node.nodeName.split(':').at(-1) || '';
const child = (node: Element, name: string) => Array.from(node.children).find(item => localName(item) === name) || null;
const children = (node: Element, name: string) => Array.from(node.children).filter(item => localName(item) === name);
const has = (node: Element | null, name: string) => {
  const property = node && child(node, name);
  return Boolean(property && property.getAttribute('w:val') !== '0' && property.getAttribute('w:val') !== 'false');
};

function renderRun(run: Element): string {
  const properties = child(run, 'rPr');
  const parts = Array.from(run.children).flatMap(node => {
    const name = localName(node);
    if (name === 't' || name === 'delText') return [escapeHtml(node.textContent || '').replace(/\s{2,}/g, value => '&nbsp;'.repeat(value.length))];
    if (name === 'tab') return ['&emsp;'];
    if (name === 'br' || name === 'cr') return ['<br>'];
    return [];
  });
  let output = parts.join('');
  if (!output) return '';
  if (has(properties, 'b')) output = `<strong>${output}</strong>`;
  if (has(properties, 'i')) output = `<em>${output}</em>`;
  if (has(properties, 'u')) output = `<u>${output}</u>`;
  if (has(properties, 'strike') || has(properties, 'dstrike')) output = `<del>${output}</del>`;
  return output;
}

function renderParagraph(paragraph: Element): string {
  const properties = child(paragraph, 'pPr');
  const style = child(properties || paragraph, 'pStyle')?.getAttribute('w:val')?.toLowerCase() || '';
  const alignment = child(properties || paragraph, 'jc')?.getAttribute('w:val');
  const align = ['center', 'right', 'both', 'distribute'].includes(alignment || '') ? ` style="text-align:${alignment === 'both' || alignment === 'distribute' ? 'justify' : alignment}"` : '';
  const content = Array.from(paragraph.children).flatMap(node => {
    if (localName(node) === 'r') return [renderRun(node)];
    if (localName(node) === 'hyperlink') return Array.from(node.children).filter(run => localName(run) === 'r').map(renderRun);
    return [];
  }).join('');
  const tag = /^(title|heading1|heading2|heading3)$/.test(style) ? (style === 'title' || style === 'heading1' ? 'h2' : 'h3') : 'p';
  if (child(properties || paragraph, 'numPr')) return `<ul><li>${content || '<br>'}</li></ul>`;
  return `<${tag}${align}>${content || '<br>'}</${tag}>`;
}

/** Converts basic WordprocessingML text and inline formatting to safe, editable HTML. */
export async function docxToHtml(file: Blob): Promise<string> {
  if (file.size > 20 * 1024 * 1024) throw new Error('Word files must be 20 MB or smaller to import.');
  const { BlobReader, TextWriter, ZipReader } = await import('@zip.js/zip.js');
  const reader = new ZipReader(new BlobReader(file), { useWebWorkers: false });
  try {
    const documentEntry = (await reader.getEntries()).find(entry => entry.filename === 'word/document.xml');
    if (!documentEntry || documentEntry.directory) throw new Error('This file does not contain a readable Word document.');
    if (documentEntry.uncompressedSize > 12_000_000) throw new Error('This Word document is too large to convert.');
    const xml = await documentEntry.getData(new TextWriter());
    if (xml.length > 12_000_000) throw new Error('This Word document is too large to convert.');
    const parsed = new DOMParser().parseFromString(xml, 'application/xml');
    if (parsed.querySelector('parsererror')) throw new Error('This Word document could not be read.');
    const body = Array.from(parsed.getElementsByTagName('*')).find(node => localName(node) === 'body');
    if (!body) throw new Error('This Word document has no script text to import.');
    const html = Array.from(body.children).flatMap(node => {
      const name = localName(node);
      if (name === 'p') return [renderParagraph(node)];
      if (name === 'tbl') return Array.from(node.children).filter(row => localName(row) === 'tr').map(row => {
        const cells = Array.from(row.children).filter(cell => localName(cell) === 'tc').map(cell => Array.from(cell.children).filter(block => localName(block) === 'p').map(renderParagraph).join(''));
        return `<p>${cells.join(' &emsp; ') || '<br>'}</p>`;
      });
      return [];
    }).join('');
    if (!html.replace(/<[^>]*>/g, '').trim()) throw new Error('No editable text was found in this Word document.');
    return html;
  } finally {
    await reader.close();
  }
}

type ImportedText = { text: string; bold?: boolean; italic?: boolean; underline?: boolean };
type ImportedBlock = { type: string; align?: 'left' | 'center' | 'right' | 'justify'; children: Array<ImportedText | ImportedBlock> };

/** Converts the constrained HTML produced above into the Deck comment editor's block model. */
export function docxHtmlToCommentValue(html: string): unknown[] {
  const template = document.createElement('template');
  template.innerHTML = html;
  const inline = (node: Node, marks: Omit<ImportedText, 'text'> = {}): Array<ImportedText | ImportedBlock> => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ? [{ text: node.textContent, ...marks }] : [];
    if (!(node instanceof Element)) return [];
    if (node.tagName.toLowerCase() === 'br') return [{ text: '\n', ...marks }];
    const tag = node.tagName.toLowerCase();
    const next = {
      ...marks,
      ...(tag === 'strong' || tag === 'b' ? { bold: true } : {}),
      ...(tag === 'em' || tag === 'i' ? { italic: true } : {}),
      ...(tag === 'u' ? { underline: true } : {}),
    };
    return Array.from(node.childNodes).flatMap(childNode => inline(childNode, next));
  };
  const block = (element: Element): ImportedBlock => {
    const tag = element.tagName.toLowerCase();
    const alignValue = (element as HTMLElement).style.textAlign;
    const align = ['left', 'center', 'right', 'justify'].includes(alignValue) ? alignValue as ImportedBlock['align'] : undefined;
    if (tag === 'ul' || tag === 'ol') return {
      type: tag === 'ol' ? 'numbered-list' : 'bulleted-list',
      children: Array.from(element.children).filter(child => child.tagName.toLowerCase() === 'li').map(item => ({ type: 'list-item', children: Array.from(item.childNodes).flatMap(node => inline(node)) })),
    };
    const type = tag === 'h2' ? 'heading-one' : tag === 'h3' ? 'heading-two' : tag === 'blockquote' ? 'block-quote' : 'paragraph';
    const children = Array.from(element.childNodes).flatMap(node => inline(node));
    return { type, ...(align ? { align } : {}), children: children.length ? children : [{ text: '' }] };
  };
  const blocks = Array.from(template.content.children).flatMap(element => {
    const tag = element.tagName.toLowerCase();
    return ['p', 'h2', 'h3', 'blockquote', 'ul', 'ol'].includes(tag) ? [block(element)] : [];
  });
  return blocks.length ? blocks : [{ type: 'paragraph', children: [{ text: '' }] }];
}
