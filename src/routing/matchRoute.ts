export type Route = {
  path: string;
  params?: Record<string, string>;
};

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, "") || "/";
  return { path };
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
