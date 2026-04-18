export function $<T extends HTMLElement>(parent: HTMLElement, selector: string): T {
  const el = parent.querySelector<T>(selector);
  if (!el) throw new Error(`Selector "${selector}" not found`);
  return el;
}
