/**
 * Interface language. Mini Seoul pairs every label with its Korean name by
 * default; English mode drops the Korean from the interface (prompts,
 * toasts, directory, panels, map, HUD) so it reads in one language. Signs in
 * the 3D city stay Korean either way: they are part of the place.
 *
 * Korean text is marked with `lang="ko"` throughout the UI, so English mode
 * is one class on the root and one CSS rule, plus the few labels that are a
 * single string mixing both (quality, weather).
 */
export type Lang = 'ko' | 'en';

const KEY = 'mini-seoul-lang';
let current: Lang = localStorage.getItem(KEY) === 'en' ? 'en' : 'ko';
const listeners: ((l: Lang) => void)[] = [];

export function getLang(): Lang {
  return current;
}

export function setLang(l: Lang): void {
  current = l;
  localStorage.setItem(KEY, l);
  document.documentElement.classList.toggle('lang-en', l === 'en');
  for (const cb of listeners) cb(l);
}

export function onLangChange(cb: (l: Lang) => void): void {
  listeners.push(cb);
}

/**
 * A combined label like "높음 HIGH" or "맑음 CLEAR": Korean plus lowercase
 * English by default, English only in English mode.
 */
export function bilingual(label: string): string {
  const m = label.match(/^(.*?)\s*([A-Z][A-Z ]*)$/);
  if (!m) return label;
  const en = m[2].toLowerCase();
  return current === 'en' ? en : `${m[1]} ${en}`;
}

document.documentElement.classList.toggle('lang-en', current === 'en');
