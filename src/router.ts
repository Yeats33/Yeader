export type Route = {
  path: string;
  params?: Record<string, string>;
};

export type Router = {
  currentRoute: Route;
  navigate(path: string): void;
};

const listeners: Set<() => void> = new Set();

function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, "") || "/";
  return { path };
}

function getCurrentRoute(): Route {
  return parseHash(window.location.hash);
}

function notify() {
  listeners.forEach((fn) => fn());
}

export function navigate(path: string) {
  window.location.hash = path;
  notify();
}

export function onRouteChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (typeof window !== "undefined") {
  window.addEventListener("hashchange", notify);
}

export function getRoute(): Route {
  return getCurrentRoute();
}

export function matchRoute(pattern: string, route: Route): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = route.path.split("/").filter(Boolean);

  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      params[patternParts[i].slice(1)] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}
