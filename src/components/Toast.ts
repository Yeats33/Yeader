type ToastKind = "success" | "error" | "info" | "loading";

type ToastItem = {
  id: number;
  kind: ToastKind;
  message: string;
  duration: number;
};

let toastCounter = 0;
const toasts: ToastItem[] = [];

export function showToast(kind: ToastKind, message: string, duration = 3000): number {
  const id = ++toastCounter;
  toasts.push({ id, kind, message, duration });
  renderToasts();
  if (kind !== "loading" && duration > 0) {
    setTimeout(() => dismissToast(id), duration);
  }
  return id;
}

export function dismissToast(id: number): void {
  const idx = toasts.findIndex((t) => t.id === id);
  if (idx >= 0) {
    toasts.splice(idx, 1);
    renderToasts();
  }
}

function renderToasts(): void {
  let container = document.querySelector<HTMLElement>("#toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }

  container.innerHTML = toasts
    .map(
      (t) => `
      <div class="toast toast-${t.kind}" role="alert" aria-live="polite">
        <span class="toast-icon">${describeToastIcon(t.kind)}</span>
        <span class="toast-message">${escapeHtml(t.message)}</span>
        ${t.kind !== "loading" ? `<button class="toast-close" aria-label="关闭">×</button>` : ""}
      </div>
    `,
    )
    .join("");

  container.querySelectorAll<HTMLButtonElement>(".toast-close").forEach((btn) => {
    btn.addEventListener("click", () => {
      const toastEl = btn.closest<HTMLElement>(".toast");
      if (toastEl) {
        const id = Number(toastEl.dataset.id);
        dismissToast(id);
      }
    });
  });
}

function describeToastIcon(kind: ToastKind): string {
  switch (kind) {
    case "success":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
    case "error":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
    case "info":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`;
    case "loading":
      return `<svg class="toast-spinner" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
