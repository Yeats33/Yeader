import { useEffect, useRef } from "react";

export type LegacyPageDefinition = {
  render: () => Promise<string> | string;
  init?: (container: HTMLElement) => Promise<void> | void;
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

    async function renderPage() {
      const html = await page.render();
      if (cancelled) return;

      pageHost.innerHTML = html;
      const mainContent = pageHost.querySelector<HTMLElement>(".page");
      if (mainContent && page.init) {
        await page.init(mainContent);
      }
    }

    void renderPage();

    return () => {
      cancelled = true;
      pageHost.innerHTML = "";
    };
  }, [page, routeKey]);

  return <div ref={ref} />;
}
