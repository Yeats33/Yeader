export interface LegacyBookSource {
  book_source_url: string;
  book_source_name: string;
  book_source_group: string;
  enabled: boolean;
  enabled_explore?: boolean;
  explore_url?: string;
  login_check_js?: string;
  book_source_type?: number;
  rule_search?: SearchRule;
  rule_book_info?: BookInfoRule;
  rule_toc?: TocRule;
  rule_content?: ContentRule;
}

export interface SearchRule {
  book_list?: string;
  name?: string;
  author?: string;
  intro?: string;
  kind?: string;
  last_chapter?: string;
  update_time?: string;
  book_url?: string;
  cover_url?: string;
  word_count?: string;
  check_key_word?: string;
}

export interface BookInfoRule {
  init?: string;
  name?: string;
  author?: string;
  intro?: string;
  kind?: string;
  last_chapter?: string;
  update_time?: string;
  cover_url?: string;
  toc_url?: string;
  word_count?: string;
  can_re_name?: string;
  download_urls?: string;
}

export interface TocRule {
  chapter_list?: string;
  chapter_name?: string;
  chapter_url?: string;
  format_js?: string;
  is_volume?: string;
  is_vip?: string;
  is_pay?: string;
  update_time?: string;
  next_toc_url?: string;
  pre_update_js?: string;
}

export interface ContentRule {
  content?: string;
  title?: string;
  next_content_url?: string;
  web_js?: string;
  source_regex?: string;
  replace_regex?: string;
  image_style?: string;
  image_decode?: string;
  pay_action?: string;
}

export interface LegacyRssSource {
  rss_source_url: string;
  rss_source_name: string;
  rss_source_group: string;
  enabled: boolean;
  rule_articles?: string;
  rule_title?: string;
  rule_link?: string;
  rule_content?: string;
}

export interface LegacyReplaceRule {
  id: number;
  name: string;
  enabled: boolean;
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
}

export interface Chapter {
  title: string;
  url: string;
  is_volume: boolean;
  is_vip: boolean;
}

export interface SearchResult {
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
