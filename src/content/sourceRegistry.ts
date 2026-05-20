export interface SourceRegistry {
  format: "yeader.source-registry";
  version: number;
  sources: SourceRegistryEntry[];
}

export interface SourceRegistryEntry {
  id: string;
  name: string;
  description: string;
  mediaType: string;
  homepage: string;
  packUrl: string;
  tags: string[];
  review: {
    status: "example" | "pending" | "approved" | "rejected" | "removed";
    notes: string;
  };
}

export const SOURCE_REGISTRY_REPOSITORY_URL = "https://github.com/Yeats33/YeaderPlugins";
export const SOURCE_REGISTRY_URL = "https://raw.githubusercontent.com/Yeats33/YeaderPlugins/main/registry/sources.json";

const SOURCE_REGISTRY_FORMAT = "yeader.source-registry";

export function parseSourceRegistry(value: unknown): SourceRegistry | null {
  if (!isObject(value)) {
    return null;
  }

  const registry = value as Partial<SourceRegistry>;
  if (
    registry.format !== SOURCE_REGISTRY_FORMAT ||
    typeof registry.version !== "number" ||
    !Array.isArray(registry.sources)
  ) {
    return null;
  }

  return {
    format: registry.format,
    version: registry.version,
    sources: registry.sources,
  };
}

export function sourceRegistryEntries(registry: SourceRegistry): SourceRegistryEntry[] {
  return registry.sources;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
