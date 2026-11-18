export function normalizeColumnColor(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toLowerCase() : undefined;
}

function contrastInk(color: string) {
  const channels = [1, 3, 5].map((offset) => {
    const channel = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  return luminance > .179 ? '#000000' : '#ffffff';
}

// Keep the preset highlights in the same family as the brand colors.
const selectedColors: Record<string, string> = {
  '#e6e6e6': '#4b4949', '#e6d9e7': '#805387', '#c7dee1': '#287b83',
  '#f9f1d2': '#f5cd38', '#edd9db': '#98333d', '#d7eadb': '#35794a',
};

function colorHsl(color: string) {
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const lightness = (max + min) / 2;
  // Grays stay neutral; custom colors retain their hue with stronger saturation.
  const saturation = delta < .025 ? 0 : Math.min(.85, Math.max(.6, delta / (1 - Math.abs(2 * lightness - 1))));
  const hue = delta === 0 ? 0 : ((max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) + 6) % 6;
  return { hue, saturation, lightness };
}

// Design rule: orange/yellow (15–65°) stay bright and saturated, including
// custom colors and hover states. Other hues deepen; neutral grays stay neutral.
function prefersBrightHighlight(color: string) {
  const { hue, saturation } = colorHsl(color);
  return saturation > 0 && hue >= 15 / 60 && hue <= 65 / 60;
}

function selectedColor(color: string) {
  if (selectedColors[color]) return selectedColors[color];
  const { hue, saturation, lightness } = colorHsl(color);
  const bright = prefersBrightHighlight(color);
  const selectedLightness = bright ? .58 : Math.max(.12, Math.min(.36, lightness * .7));
  const chroma = (1 - Math.abs(2 * selectedLightness - 1)) * (bright ? .9 : saturation);
  const x = chroma * (1 - Math.abs(hue % 2 - 1));
  const rgb = hue < 1 ? [chroma, x, 0] : hue < 2 ? [x, chroma, 0] : hue < 3 ? [0, chroma, x] : hue < 4 ? [0, x, chroma] : hue < 5 ? [x, 0, chroma] : [chroma, 0, x];
  return '#' + rgb.map((channel) => Math.round((channel + selectedLightness - chroma / 2) * 255).toString(16).padStart(2, '0')).join('');
}

export function columnColorStyle(value: unknown) {
  const color = normalizeColumnColor(value) || '#eeeeee';
  const selected = selectedColor(color);
  const bright = prefersBrightHighlight(color);
  const hover = '#' + [1, 3, 5].map((offset) => {
    const channel = parseInt(selected.slice(offset, offset + 2), 16);
    return Math.round(bright ? channel + (255 - channel) * .08 : channel * .9).toString(16).padStart(2, '0');
  }).join('');
  return {
    '--deck-column-bg': color, '--deck-column-ink': contrastInk(color),
    '--deck-selected-bg': selected, '--deck-selected-ink': contrastInk(selected),
    '--deck-selected-hover': hover, '--deck-selected-hover-ink': contrastInk(hover),
  };
}
