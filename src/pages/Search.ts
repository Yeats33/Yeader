import type { LegacyBookSource } from "../types.ts";

const SEARCH_TAG_UNTAGGED = "__untagged";

export function parseSearchSourceTags(rawValue?: string): string[] {
  if (!rawValue) {
    return [];
  }

  const seen = new Set<string>();
  const tags: string[] = [];

  rawValue
    .split(/[,\uff0c]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((tag) => {
      if (seen.has(tag)) {
        return;
      }
      seen.add(tag);
      tags.push(tag);
    });

  return tags;
}

export function resolveSearchSourceSelection(
  value: string,
  sources: LegacyBookSource[],
): LegacyBookSource[] {
  const enabledSources = sources.filter((source) => source.enabled);

  if (!value) {
    return enabledSources;
  }

  if (value.startsWith("tag:")) {
    const tag = value.slice("tag:".length);
    if (tag === SEARCH_TAG_UNTAGGED) {
      return enabledSources.filter((source) => parseSearchSourceTags(source.bookSourceGroup).length === 0);
    }
    return enabledSources.filter((source) => parseSearchSourceTags(source.bookSourceGroup).includes(tag));
  }

  if (value.startsWith("source:")) {
    const sourceUrl = value.slice("source:".length);
    return enabledSources.filter((source) => source.bookSourceUrl === sourceUrl);
  }

  return enabledSources.filter((source) => source.bookSourceUrl === value);
}

export function resolveSearchSources(
  selectedTag: string,
  selectedSource: string,
  sources: LegacyBookSource[],
): LegacyBookSource[] {
  if (selectedSource) {
    return resolveSearchSourceSelection(selectedSource, sources);
  }

  if (selectedTag) {
    return resolveSearchSourceSelection(selectedTag, sources);
  }

  return resolveSearchSourceSelection("", sources);
}
