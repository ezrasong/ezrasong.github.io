/** Keeps Tab / Shift+Tab cycling inside an open dialog. Shared by Panel and MenuOverlay. */
export function trapFocus(root: HTMLElement, e: KeyboardEvent): void {
  const focusables = root.querySelectorAll<HTMLElement>(
    'button, a[href], [tabindex]:not([tabindex="-1"])'
  );
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const inside = root.contains(document.activeElement);
  if (e.shiftKey && (document.activeElement === first || !inside)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
    e.preventDefault();
    first.focus();
  }
}
