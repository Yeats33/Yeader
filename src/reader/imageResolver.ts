import { invoke } from "@tauri-apps/api/core";
import { extractImageUrls } from "./contentSource.ts";

export class ImageResolver {
  constructor(private basePath: string = "") {}

  async resolveImageUrl(imgUrl: string): Promise<string> {
    if (!imgUrl) return imgUrl;

    // Already a data URL or blob URL - pass through
    if (imgUrl.startsWith("data:") || imgUrl.startsWith("blob:")) {
      return imgUrl;
    }

    // Absolute URL with correct protocol - pass through
    if (imgUrl.startsWith("//")) {
      return `https:${imgUrl}`;
    }

    if (imgUrl.startsWith("http://")) {
      // Mixed content - proxy through Tauri backend
      try {
        const proxied = await invoke<string>("proxy_image_url", { url: imgUrl });
        return proxied;
      } catch {
        return imgUrl;
      }
    }

    if (imgUrl.startsWith("https://") || imgUrl.startsWith("/")) {
      return imgUrl;
    }

    // Relative path - resolve against basePath
    if (this.basePath) {
      const lastSlash = this.basePath.lastIndexOf("/");
      const baseDir = lastSlash >= 0 ? this.basePath.slice(0, lastSlash + 1) : this.basePath;
      return baseDir + imgUrl;
    }

    return imgUrl;
  }

  async resolveAll(content: string): Promise<string> {
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    const matches: Array<{ match: string; url: string; index: number }> = [];

    let match;
    while ((match = imgRegex.exec(content)) !== null) {
      matches.push({ match: match[0], url: match[1], index: match.index });
    }

    if (matches.length === 0) return content;

    const resolvedUrls = await Promise.all(
      matches.map(async (m) => ({
        original: m,
        resolved: await this.resolveImageUrl(m.url),
      })),
    );

    let result = content;
    // Process in reverse order to preserve indices
    for (let i = resolvedUrls.length - 1; i >= 0; i--) {
      const { original, resolved } = resolvedUrls[i];
      const newTag = original.match.replace(original.url, resolved);
      result = result.slice(0, original.index) + newTag + result.slice(original.index + original.match.length);
    }

    return result;
  }

  static async proxyFetchImage(url: string): Promise<string> {
    try {
      return await invoke<string>("proxy_image_url", { url });
    } catch {
      return url;
    }
  }
}

export async function resolveEpubImages(content: string, epubPath: string): Promise<string> {
  const resolver = new ImageResolver(epubPath);
  return resolver.resolveAll(content);
}

export async function extractAndProxyImages(content: string): Promise<Array<{ original: string; proxied: string }>> {
  const urls = extractImageUrls(content);
  const results = await Promise.all(
    urls.map(async (url) => ({
      original: url,
      proxied: await ImageResolver.proxyFetchImage(url),
    })),
  );
  return results.filter((r) => r.original !== r.proxied);
}