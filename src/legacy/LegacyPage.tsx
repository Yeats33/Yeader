import { useEffect, useRef } from "react";

export type LegacyPageDefinition = {
  render: () => Promise<string> | string;
  init?: (container: HTMLElement) => Promise<(() => void) | void> | (() => void) | void;
};

type LegacyPageProps = {
  page: LegacyPageDefinition;
  routeKey: string;
};

export function LegacyPage({ page, routeKey }: LegacyPageProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const host = ref.current;
    if (!host) return;
    const pageHost = host;
    let cleanup: (() => void) | undefined;

    async function renderPage() {
      const html = await page.render();
      if (cancelled) return;

      pageHost.innerHTML = html;
      const mainContent = pageHost.querySelector<HTMLElement>(".page");
      if (mainContent && page.init) {
        const initCleanup = await page.init(mainContent);
        if (!cancelled) {
          cleanup = typeof initCleanup === "function" ? initCleanup : undefined;
        } else {
          if (typeof initCleanup === "function") {
            initCleanup();
          }
        }
      }
    }

    void renderPage();

    return () => {
      cancelled = true;
      cleanup?.();
      pageHost.innerHTML = "";
    };
  }, [page, routeKey]);

  return <div ref={ref} />;
}
