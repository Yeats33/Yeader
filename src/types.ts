export interface YeaderSourcePack {
  format: "yeader.source-pack";
  version: number;
  name?: string;
  sources: YeaderSource[];
}

export interface YeaderSource {
  id: string;
  name: string;
  mediaType: "novel" | "rss" | "comic" | "audio" | "video" | "generic";
  version?: string;
  homepage?: string;
  publisher?: string;
  donateUrl?: string;
  tags?: string[];
  enabled: boolean;
  requestDefaults?: YeaderRequestDefaults;
  variables?: Record<string, string>;
  exploreCategories?: YeaderExploreCategory[];
  capabilities?: YeaderCapability[];
}

export interface YeaderExploreCategory {
  key: string;
  label: string;
  group?: string;
  variables?: Record<string, string>;
  orderOptions?: YeaderExploreOrder[];
}

export interface YeaderExploreOrder {
  key: string;
  label: string;
  variables?: Record<string, string>;
}

export interface YeaderRequestDefaults {
  headers?: Record<string, string>;
  encoding?: string;
  timeoutMs?: number;
}

export interface YeaderCapability {
  kind: "search" | "detail" | "toc" | "content" | "feed" | "list" | "asset";
  request?: YeaderRequest;
  item?: YeaderSelector;
  fields?: Record<string, YeaderSelector>;
  actions?: YeaderAction[];
}

export interface YeaderRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: string;
  pagination?: {
    variable: string;
    firstPage?: number;
    step?: number;
  };
}

export interface YeaderSelector {
  engine: "css" | "jsonPath" | "xPath" | "regex" | "text" | "javaScript" | "legacyLegado";
  query: string;
  output?: string;
  all?: boolean;
  fallback?: YeaderSelector[];
}

export interface YeaderAction {
  kind: "beforeRequest" | "beforeExtract" | "afterExtract";
  script: string;
}

export interface Book {
  url: string;
  name: string;
  author: string;
  cover_url?: string;
  source_url: string;
  toc_url?: string;
  last_read_at?: string;
  group_id?: number;
  type?: number;
  intro?: string;
  total_chapters?: number;
  reading_chapter?: string;
  reading_progress?: number;
  extra?: Record<string, unknown>;
}

export interface Chapter {
  title: string;
  url: string;
  is_volume: boolean;
  is_vip: boolean;
}

export interface SearchResult {
  source_id: string;
  name: string;
  author: string;
  book_url: string;
  cover_url?: string;
  intro?: string;
  kind?: string;
  last_chapter?: string;
  word_count?: string;
}

export interface ReadingProgress {
  book_id: string;
  chapter_index: number;
  chapter_title: string;
  offset: number;
}

export interface BookInfo {
  name: string;
  author: string;
  intro?: string;
  kind?: string;
  last_chapter?: string;
  update_time?: string;
  cover_url?: string;
  toc_url?: string;
  word_count?: string;
  chapters?: Chapter[];
}

export interface ImportSummary {
  book_sources_count: number;
  rss_sources_count: number;
  replace_rules_count: number;
}

export interface DevModeStatus {
  enabled: boolean;
  available: boolean;
}

export interface LogLine {
  timestamp: string;
  level: string;
  target: string;
  message: string;
}

export interface ReaderStyle {
  font_family: string;
  font_size: number;
  line_height: number;
  theme: string;
}

export interface Mark {
  page: number;
  content: string;
  width: number;
  height: number;
  cfi: string;
  offset?: number;
}

export interface BookMark {
  book_path: string;
  list: Mark[];
}

export interface AuthResult {
  verified: boolean;
  wallet_address: string;
  chain_id: number;
}

export interface AuthSessionInfo {
  wallet_address: string;
  chain_id: number;
  created_at: string;
  expires_at: string;
}
