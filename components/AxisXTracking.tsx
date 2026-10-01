'use client';

import { useEffect } from 'react';

const axisFamily = 'Axis ExtraBold';
const trackedGlyphs = /[xX]|(?<![tT])[tT](?=[tT])/g;

function trackAxisX(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node: Node | null;

  while ((node = walker.nextNode())) nodes.push(node as Text);

  nodes.forEach((textNode) => {
    const parent = textNode.parentElement;
    const value = textNode.nodeValue || '';
    trackedGlyphs.lastIndex = 0;
    if (!parent || parent.closest('.axis-tracked-glyph, .axis-tracked-text') || !trackedGlyphs.test(value)) return;
    if (!getComputedStyle(parent).fontFamily.includes(axisFamily)) return;

    // Keep a text run as one inline child. Splitting a text node directly inside a
    // CSS grid turns every fragment into its own grid item.
    const wrapper = document.createElement('span');
    wrapper.className = 'axis-tracked-text';
    let end = 0;
    trackedGlyphs.lastIndex = 0;
    for (const match of value.matchAll(trackedGlyphs)) {
      const start = match.index || 0;
      if (start > end) wrapper.append(document.createTextNode(value.slice(end, start)));
      const glyph = document.createElement('span');
      glyph.className = `axis-tracked-glyph ${match[0].toLowerCase() === 'x' ? 'axis-x-tracked' : 'axis-double-t-tracked'}`;
      glyph.textContent = match[0];
      wrapper.append(glyph);
      end = start + match[0].length;
    }
    if (end < value.length) wrapper.append(document.createTextNode(value.slice(end)));
    textNode.replaceWith(wrapper);
  });
}

export function AxisXTracking() {
  useEffect(() => {
    trackAxisX(document.body);
    const observer = new MutationObserver((entries) => {
      entries.forEach((entry) => entry.addedNodes.forEach((node) => trackAxisX(node)));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
