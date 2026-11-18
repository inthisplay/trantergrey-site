import type { SVGProps } from 'react';
import { uiIconPaths, type UiIconName } from '@/lib/ui-icons';

/** Decorative vector icon. Give icon-only controls an accessible label. */
export function UiIcon({ name, className = '', ...props }: SVGProps<SVGSVGElement> & { name: UiIconName }) {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" {...props} className={`ui-icon ${className}`} aria-hidden="true" focusable="false"><path d={uiIconPaths[name]} /></svg>;
}
