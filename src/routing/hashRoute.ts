import { useCallback, useEffect, useState } from "react";
import { parseHash, type Route } from "./matchRoute.ts";

function currentRoute(): Route {
  return parseHash(window.location.hash);
}

export function navigate(path: string): void {
  window.location.hash = path;
}

export function useHashRoute(): { route: Route; navigate: (path: string) => void } {
  const [route, setRoute] = useState<Route>(() => currentRoute());

  useEffect(() => {
    if (!window.location.hash) {
      window.location.hash = "/";
    }

    const onHashChange = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onHashChange);
    onHashChange();

    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return {
    route,
    navigate: useCallback((path: string) => navigate(path), []),
  };
}
