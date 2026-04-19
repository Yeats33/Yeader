export interface LegacyBookSource {
  bookSourceUrl: string;
  bookSourceName: string;
  bookSourceGroup?: string;
  subscriptionUrl?: string;
  searchUrl?: string;
  enabled: boolean;
  lastTestAvailable?: boolean;
  lastTestedAt?: string;
  lastTestDetail?: string;
  enabledExplore?: boolean;
  exploreUrl?: string;
  loginCheckJs?: string;
  bookSourceType?: number;
  ruleSearch?: SearchRule;
  ruleBookInfo?: BookInfoRule;
  ruleToc?: TocRule;
  ruleContent?: ContentRule;
}

export interface SearchRule {
  bookList?: string;
  name?: string;
  author?: string;
  intro?: string;
  kind?: string;
  lastChapter?: string;
  updateTime?: string;
  bookUrl?: string;
  coverUrl?: string;
  wordCount?: string;
  checkKeyWord?: string;
}

export interface BookInfoRule {
  init?: string;
  name?: string;
  author?: string;
  intro?: string;
  kind?: string;
  lastChapter?: string;
  updateTime?: string;
  coverUrl?: string;
  tocUrl?: string;
  wordCount?: string;
  canReName?: string;
  downloadUrls?: string;
}

export interface TocRule {
  chapterList?: string;
  chapterName?: string;
  chapterUrl?: string;
  formatJs?: string;
  isVolume?: string;
  isVip?: string;
  isPay?: string;
  updateTime?: string;
  nextTocUrl?: string;
  preUpdateJs?: string;
}

export interface ContentRule {
  content?: string;
  title?: string;
  nextContentUrl?: string;
  webJs?: string;
  sourceRegex?: string;
  replaceRegex?: string;
  imageStyle?: string;
  imageDecode?: string;
  payAction?: string;
}

export interface LegacyRssSource {
  sourceUrl: string;
  sourceName: string;
  sourceIcon: string;
  enabled: boolean;
  ruleArticles?: string;
}

export interface LegacyReplaceRule {
  id: number;
  name: string;
  isEnabled: boolean;
  pattern: string;
  replacement: string;
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
  reading_chapter?: number;
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
  scroll_progress: number;
  updated_at: string;
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

export interface BookSourceAvailability {
  sourceUrl: string;
  available: boolean;
  detail?: string;
  testedAt?: string;
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
