import { parseHash, matchRoute as matchRoutePattern, type Route } from "./routing/matchRoute.ts";

export type { Route };

export type Router = {
  currentRoute: Route;
  navigate(path: string): void;
};

const listeners: Set<() => void> = new Set();

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
  return matchRoutePattern(pattern, route);
}
