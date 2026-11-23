import sanitizeHtml from 'sanitize-html';

// Shared by the import/write paths and the API read boundary. Existing Basecamp
// originals stay intact in storage; no data migration is needed for protection.
const color = [/^#[\da-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i, /^[a-z]+$/i];
const size = [/^\d+(?:\.\d+)?(?:px|em|rem|%)$/i];

export function sanitizeProductionHtml(value: unknown): string {
  if (typeof value !== 'string') return '';
  return sanitizeHtml(value, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      'img', 'video', 'audio', 'source', 'iframe', 'input', 'button',
      'bc-attachment', 'bc-mention', 'svg', 'path', 'del', 'ins',
    ],
    allowedAttributes: {
      '*': ['class', 'style', 'title', 'aria-label'],
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'loading'],
      video: ['src', 'poster', 'controls', 'preload', 'width', 'height'],
      audio: ['src', 'controls', 'preload'],
      source: ['src', 'type'],
      iframe: ['src', 'width', 'height', 'allow', 'allowfullscreen'],
      input: ['type', 'checked', 'disabled'],
      button: ['type', 'data-copy-public-link'],
      ol: ['start', 'reversed', 'type'], li: ['value'],
      td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan', 'scope'],
      'bc-attachment': ['content-type'],
      svg: ['viewbox', 'width', 'height', 'fill', 'aria-hidden', 'focusable'],
      path: ['d', 'fill'],
    },
    allowedClasses: {
      '*': [
        /^production-(?:imported-attachment|comment-|note-checklist)[\w-]*$/,
        /^attachment(?:--[\w-]+|-gallery(?:--\d+)?)?$/,
        'mentionable-person', 'avatar', 'autolinked', 'lexxy-nested-listitem',
        'margin-top-8', 'margin-bottom-24', 'boosts', 'boosts-small', 'boost',
        'boost__avatar', 'boost__content', 'ui-icon',
      ],
    },
    allowedStyles: {
      '*': {
        color, 'background-color': color,
        'text-align': [/^(?:left|right|center|justify)$/],
        'font-weight': [/^(?:normal|bold|[1-9]00)$/],
        'font-style': [/^(?:normal|italic|oblique)$/],
        'text-decoration': [/^(?:none|underline|line-through)(?: (?:underline|line-through))*$/],
        'font-size': size,
      },
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: {
      img: ['https', 'http'], video: ['https', 'http'], audio: ['https', 'http'],
      source: ['https', 'http'], iframe: ['https'],
    },
    allowProtocolRelative: false,
    allowedIframeHostnames: ['player.mux.com', 'player.vimeo.com', 'www.youtube.com', 'www.youtube-nocookie.com'],
    allowIframeRelativeUrls: false,
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, rel: 'noreferrer noopener' } }),
      input: (_tag, attribs) => attribs.type?.toLowerCase() === 'checkbox'
        ? { tagName: 'input', attribs: { ...attribs, type: 'checkbox' } }
        : { tagName: 'span', attribs: {} },
      button: (_tag, attribs) => ({ tagName: 'button', attribs: {
        ...attribs, type: 'button',
        'data-copy-public-link': /^\/watch\/(?:collection\/)?[A-Za-z0-9_-]+$/.test(attribs['data-copy-public-link'] || '')
          ? attribs['data-copy-public-link'] : '',
      } }),
      // Only the inert vector subset used by app-generated icons is retained.
      svg: () => ({ tagName: 'svg', attribs: { class: 'ui-icon', viewbox: '0 0 24 24', width: '16', height: '16', fill: 'currentColor', 'aria-hidden': 'true', focusable: 'false' } }),
      path: (_tag, attribs) => ({ tagName: 'path', attribs: {
        d: /^[MmZzLlHhVvCcSsQqTtAaEe\d\s.,+-]*$/.test(attribs.d || '') ? attribs.d : '',
      } }),
    },
  });
}
