//! Tests for the unified source registry.

use yeader_library::{Database, SourceKind, SourceRegistry, UnifiedSource};

fn test_db() -> Database {
    Database::open_in_memory().expect("in-memory db")
}

// ---------------------------------------------------------------------------
// SourceKind
// ---------------------------------------------------------------------------

#[test]
fn source_kind_parse_valid() {
    assert_eq!(
        SourceKind::parse("booksource"),
        Some(SourceKind::BookSource)
    );
    assert_eq!(SourceKind::parse("rss"), Some(SourceKind::Rss));
    assert_eq!(SourceKind::parse("plugin"), Some(SourceKind::Plugin));
    assert_eq!(
        SourceKind::parse("BOOKSOURCE"),
        Some(SourceKind::BookSource)
    );
    assert_eq!(SourceKind::parse("RSS"), Some(SourceKind::Rss));
    assert_eq!(SourceKind::parse("PLUGIN"), Some(SourceKind::Plugin));
}

#[test]
fn source_kind_parse_unknown() {
    assert_eq!(SourceKind::parse("unknown"), None);
    assert_eq!(SourceKind::parse(""), None);
}

#[test]
fn source_kind_as_str() {
    assert_eq!(SourceKind::BookSource.as_str(), "booksource");
    assert_eq!(SourceKind::Rss.as_str(), "rss");
    assert_eq!(SourceKind::Plugin.as_str(), "plugin");
}

// ---------------------------------------------------------------------------
// SourceRegistry::list_sources
// ---------------------------------------------------------------------------

#[test]
fn list_sources_empty_db() {
    let db = test_db();
    let registry = SourceRegistry::new(&db);
    let all = registry.list_sources(None);
    assert!(all.is_empty());
}

#[test]
fn list_sources_filter_booksource() {
    use serde_json::Map;
    use yeader_models::LegacyBookSource;
    let db = test_db();

    let src = LegacyBookSource {
        book_source_url: "https://book.example.com".into(),
        book_source_name: "Book Source".into(),
        book_source_group: None,
        search_url: None,
        book_url_pattern: None,
        login_check_js: None,
        book_source_type: None,
        enabled_explore: None,
        explore_url: None,
        rule_search: None,
        rule_book_info: None,
        rule_toc: None,
        rule_content: None,
        enabled: true,
        last_test_available: None,
        last_tested_at: None,
        last_test_detail: None,
        extra: Map::new(),
        login_url: None,
        header: None,
        custom_order: None,
        weight: None,
        last_update_time: None,
        book_source_comment: None,
    };

    yeader_library::BookSourceRepo::new(&db)
        .upsert(&src)
        .unwrap();
    let registry = yeader_library::SourceRegistry::new(&db);

    let all = registry.list_sources(None);
    assert_eq!(all.len(), 1);
    let filtered = registry.list_sources(Some(SourceKind::BookSource));
    assert_eq!(filtered.len(), 1);
    let rss_only = registry.list_sources(Some(SourceKind::Rss));
    assert!(rss_only.is_empty());
    let plugin_only = registry.list_sources(Some(SourceKind::Plugin));
    assert!(plugin_only.is_empty());
}

#[test]
fn list_sources_filter_rss() {
    use serde_json::Map;
    use yeader_models::LegacyRssSource;
    let db = test_db();

    let src = LegacyRssSource {
        source_url: "https://rss.example.com".into(),
        source_name: "RSS Feed".into(),
        source_icon: "".into(),
        rule_articles: None,
        enabled: true,
        extra: Map::new(),
    };

    yeader_library::RssSourceRepo::new(&db)
        .upsert(&src)
        .unwrap();
    let registry = yeader_library::SourceRegistry::new(&db);

    let all = registry.list_sources(None);
    assert_eq!(all.len(), 1);
    let filtered = registry.list_sources(Some(SourceKind::Rss));
    assert_eq!(filtered.len(), 1);
    let booksource_only = registry.list_sources(Some(SourceKind::BookSource));
    assert!(booksource_only.is_empty());
}

#[test]
fn list_sources_filter_plugin() {
    use serde_json::Map;
    use yeader_models::{YeaderMediaType, YeaderRequestDefaults, YeaderSource};
    let db = test_db();

    let source = YeaderSource {
        id: "plugin.example".into(),
        name: "Plugin Source".into(),
        media_type: YeaderMediaType::Novel,
        version: None,
        homepage: None,
        publisher: None,
        donate_url: None,
        tags: Vec::new(),
        enabled: true,
        request_defaults: YeaderRequestDefaults::default(),
        variables: Default::default(),
        explore_categories: Vec::new(),
        capabilities: Vec::new(),
        extra: Map::new(),
    };

    yeader_library::YeaderSourceRepo::new(&db)
        .upsert(&source)
        .unwrap();
    let registry = yeader_library::SourceRegistry::new(&db);

    let all = registry.list_sources(None);
    assert_eq!(all.len(), 1);
    let filtered = registry.list_sources(Some(SourceKind::Plugin));
    assert_eq!(filtered.len(), 1);
}

// ---------------------------------------------------------------------------
// SourceRegistry::import_source
// ---------------------------------------------------------------------------

#[test]
fn import_source_book_sources() {
    let db = test_db();
    let registry = SourceRegistry::new(&db);

    let json = r#"[
      {
        "bookSourceUrl": "https://import.book.com",
        "bookSourceName": "Imported Book",
        "enabled": true
      }
    ]"#;

    let result = registry.import_source(json);
    assert!(result.is_ok());
    match result.unwrap() {
        UnifiedSource::BookSource(s) => {
            assert_eq!(s.book_source_url, "https://import.book.com");
            assert_eq!(s.book_source_name, "Imported Book");
        }
        _ => panic!("expected BookSource"),
    }

    // Verify persisted
    let all = registry.list_sources(Some(SourceKind::BookSource));
    assert_eq!(all.len(), 1);
}

#[test]
fn import_source_rss_sources() {
    let db = test_db();
    let registry = SourceRegistry::new(&db);

    let json = r#"[
      {
        "sourceUrl": "https://import.rss.com",
        "sourceName": "Imported RSS",
        "sourceIcon": "",
        "enabled": true
      }
    ]"#;

    let result = registry.import_source(json);
    assert!(result.is_ok());
    match result.unwrap() {
        UnifiedSource::Rss(s) => {
            assert_eq!(s.source_url, "https://import.rss.com");
            assert_eq!(s.source_name, "Imported RSS");
        }
        _ => panic!("expected Rss"),
    }
}

#[test]
fn import_source_yeader_pack() {
    let db = test_db();
    let registry = SourceRegistry::new(&db);

    let json = r#"{
      "format": "yeader.source-pack",
      "version": 1,
      "sources": [
        {
          "id": "import.plugin.com",
          "name": "Imported Plugin",
          "mediaType": "novel"
        }
      ]
    }"#;

    let result = registry.import_source(json);
    assert!(result.is_ok());
    match result.unwrap() {
        UnifiedSource::Plugin(s) => {
            assert_eq!(s.id, "import.plugin.com");
            assert_eq!(s.name, "Imported Plugin");
        }
        _ => panic!("expected Plugin"),
    }
}

#[test]
fn import_source_invalid_json() {
    let db = test_db();
    let registry = SourceRegistry::new(&db);
    let result = registry.import_source("not json");
    assert!(result.is_err());
    assert!(result.unwrap_err().starts_with("invalid JSON"));
}

#[test]
fn import_source_unrecognized_format() {
    let db = test_db();
    let registry = SourceRegistry::new(&db);
    let result = registry.import_source(r#"[{ "unknownField": "value" }]"#);
    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), "unrecognized source format");
}

// ---------------------------------------------------------------------------
// SourceRegistry::delete_source
// ---------------------------------------------------------------------------

#[test]
fn delete_source_booksource() {
    use serde_json::Map;
    use yeader_models::LegacyBookSource;
    let db = test_db();
    let registry = SourceRegistry::new(&db);

    let src = LegacyBookSource {
        book_source_url: "https://delete.book.com".into(),
        book_source_name: "To Delete".into(),
        book_source_group: None,
        search_url: None,
        book_url_pattern: None,
        login_check_js: None,
        book_source_type: None,
        enabled_explore: None,
        explore_url: None,
        rule_search: None,
        rule_book_info: None,
        rule_toc: None,
        rule_content: None,
        enabled: true,
        last_test_available: None,
        last_tested_at: None,
        last_test_detail: None,
        extra: Map::new(),
        login_url: None,
        header: None,
        custom_order: None,
        weight: None,
        last_update_time: None,
        book_source_comment: None,
    };

    yeader_library::BookSourceRepo::new(&db)
        .upsert(&src)
        .unwrap();
    assert_eq!(registry.list_sources(Some(SourceKind::BookSource)).len(), 1);

    let deleted = registry.delete_source("https://delete.book.com", SourceKind::BookSource);
    assert!(deleted.is_ok());
    assert!(deleted.unwrap());
    assert!(
        registry
            .list_sources(Some(SourceKind::BookSource))
            .is_empty()
    );

    // Delete non-existent returns false
    let result = registry.delete_source("https://nope.com", SourceKind::BookSource);
    assert!(result.is_ok());
    assert!(!result.unwrap());
}

#[test]
fn delete_source_rss() {
    use serde_json::Map;
    use yeader_models::LegacyRssSource;
    let db = test_db();
    let registry = SourceRegistry::new(&db);

    let src = LegacyRssSource {
        source_url: "https://delete.rss.com".into(),
        source_name: "Delete RSS".into(),
        source_icon: "".into(),
        rule_articles: None,
        enabled: true,
        extra: Map::new(),
    };

    yeader_library::RssSourceRepo::new(&db)
        .upsert(&src)
        .unwrap();
    assert_eq!(registry.list_sources(Some(SourceKind::Rss)).len(), 1);

    let deleted = registry.delete_source("https://delete.rss.com", SourceKind::Rss);
    assert!(deleted.is_ok());
    assert!(deleted.unwrap());
    assert!(registry.list_sources(Some(SourceKind::Rss)).is_empty());
}

#[test]
fn delete_source_plugin() {
    use serde_json::Map;
    use yeader_models::{YeaderMediaType, YeaderRequestDefaults, YeaderSource};
    let db = test_db();
    let registry = SourceRegistry::new(&db);

    let source = YeaderSource {
        id: "delete.plugin.com".into(),
        name: "Delete Plugin".into(),
        media_type: YeaderMediaType::Novel,
        version: None,
        homepage: None,
        publisher: None,
        donate_url: None,
        tags: Vec::new(),
        enabled: true,
        request_defaults: YeaderRequestDefaults::default(),
        variables: Default::default(),
        explore_categories: Vec::new(),
        capabilities: Vec::new(),
        extra: Map::new(),
    };

    yeader_library::YeaderSourceRepo::new(&db)
        .upsert(&source)
        .unwrap();
    assert_eq!(registry.list_sources(Some(SourceKind::Plugin)).len(), 1);

    let deleted = registry.delete_source("delete.plugin.com", SourceKind::Plugin);
    assert!(deleted.is_ok());
    assert!(deleted.unwrap());
    assert!(registry.list_sources(Some(SourceKind::Plugin)).is_empty());
}

// ---------------------------------------------------------------------------
// SourceRegistry::toggle_source
// ---------------------------------------------------------------------------

#[test]
fn toggle_source_booksource() {
    use serde_json::Map;
    use yeader_models::LegacyBookSource;
    let db = test_db();
    let registry = SourceRegistry::new(&db);

    let src = LegacyBookSource {
        book_source_url: "https://toggle.book.com".into(),
        book_source_name: "Toggle Book".into(),
        book_source_group: None,
        search_url: None,
        book_url_pattern: None,
        login_check_js: None,
        book_source_type: None,
        enabled_explore: None,
        explore_url: None,
        rule_search: None,
        rule_book_info: None,
        rule_toc: None,
        rule_content: None,
        enabled: true,
        last_test_available: None,
        last_tested_at: None,
        last_test_detail: None,
        extra: Map::new(),
        login_url: None,
        header: None,
        custom_order: None,
        weight: None,
        last_update_time: None,
        book_source_comment: None,
    };

    yeader_library::BookSourceRepo::new(&db)
        .upsert(&src)
        .unwrap();
    let registry = yeader_library::SourceRegistry::new(&db);

    // Disable
    let toggled = registry.toggle_source("https://toggle.book.com", SourceKind::BookSource, false);
    assert!(toggled.is_ok());
    assert!(toggled.unwrap());

    let all = registry.list_sources(Some(SourceKind::BookSource));
    assert_eq!(all[0].enabled(), false);

    // Re-enable
    let toggled = registry.toggle_source("https://toggle.book.com", SourceKind::BookSource, true);
    assert!(toggled.is_ok());

    let all = registry.list_sources(Some(SourceKind::BookSource));
    assert_eq!(all[0].enabled(), true);

    // Toggle non-existent
    let result = registry.toggle_source("https://nope.com", SourceKind::BookSource, true);
    assert!(result.is_ok());
    assert!(!result.unwrap());
}

#[test]
fn toggle_source_rss() {
    use serde_json::Map;
    use yeader_models::LegacyRssSource;
    let db = test_db();
    let registry = SourceRegistry::new(&db);

    let src = LegacyRssSource {
        source_url: "https://toggle.rss.com".into(),
        source_name: "Toggle RSS".into(),
        source_icon: "".into(),
        rule_articles: None,
        enabled: true,
        extra: Map::new(),
    };

    yeader_library::RssSourceRepo::new(&db)
        .upsert(&src)
        .unwrap();

    let toggled = registry.toggle_source("https://toggle.rss.com", SourceKind::Rss, false);
    assert!(toggled.is_ok());
    assert!(toggled.unwrap());

    let all = registry.list_sources(Some(SourceKind::Rss));
    assert_eq!(all[0].enabled(), false);
}

#[test]
fn toggle_source_plugin() {
    use serde_json::Map;
    use yeader_models::{YeaderMediaType, YeaderRequestDefaults, YeaderSource};
    let db = test_db();
    let registry = SourceRegistry::new(&db);

    let source = YeaderSource {
        id: "toggle.plugin.com".into(),
        name: "Toggle Plugin".into(),
        media_type: YeaderMediaType::Novel,
        version: None,
        homepage: None,
        publisher: None,
        donate_url: None,
        tags: Vec::new(),
        enabled: true,
        request_defaults: YeaderRequestDefaults::default(),
        variables: Default::default(),
        explore_categories: Vec::new(),
        capabilities: Vec::new(),
        extra: Map::new(),
    };

    yeader_library::YeaderSourceRepo::new(&db)
        .upsert(&source)
        .unwrap();
    let registry = yeader_library::SourceRegistry::new(&db);

    let toggled = registry.toggle_source("toggle.plugin.com", SourceKind::Plugin, false);
    assert!(toggled.is_ok());
    assert!(toggled.unwrap());

    let all = registry.list_sources(Some(SourceKind::Plugin));
    assert_eq!(all[0].enabled(), false);
}

// ---------------------------------------------------------------------------
// UnifiedSource helpers
// ---------------------------------------------------------------------------

#[test]
fn unified_source_id_and_name() {
    use serde_json::Map;
    use yeader_models::{
        LegacyBookSource, LegacyRssSource, YeaderMediaType, YeaderRequestDefaults, YeaderSource,
    };

    let book = UnifiedSource::BookSource(LegacyBookSource {
        book_source_url: "https://book.id.com".into(),
        book_source_name: "Book Name".into(),
        book_source_group: None,
        search_url: None,
        book_url_pattern: None,
        login_check_js: None,
        book_source_type: None,
        enabled_explore: None,
        explore_url: None,
        rule_search: None,
        rule_book_info: None,
        rule_toc: None,
        rule_content: None,
        enabled: true,
        last_test_available: None,
        last_tested_at: None,
        last_test_detail: None,
        extra: Map::new(),
        login_url: None,
        header: None,
        custom_order: None,
        weight: None,
        last_update_time: None,
        book_source_comment: None,
    });
    assert_eq!(book.id(), "https://book.id.com");
    assert_eq!(book.name(), "Book Name");

    let rss = UnifiedSource::Rss(LegacyRssSource {
        source_url: "https://rss.id.com".into(),
        source_name: "RSS Name".into(),
        source_icon: "".into(),
        rule_articles: None,
        enabled: false,
        extra: Map::new(),
    });
    assert_eq!(rss.id(), "https://rss.id.com");
    assert_eq!(rss.name(), "RSS Name");
    assert!(!rss.enabled());

    let plugin = UnifiedSource::Plugin(YeaderSource {
        id: "plugin.id.com".into(),
        name: "Plugin Name".into(),
        media_type: YeaderMediaType::Novel,
        version: None,
        homepage: None,
        publisher: None,
        donate_url: None,
        tags: Vec::new(),
        enabled: true,
        request_defaults: YeaderRequestDefaults::default(),
        variables: Default::default(),
        explore_categories: Vec::new(),
        capabilities: Vec::new(),
        extra: Map::new(),
    });
    assert_eq!(plugin.id(), "plugin.id.com");
    assert_eq!(plugin.name(), "Plugin Name");
    assert!(plugin.enabled());
}

// ---------------------------------------------------------------------------
// Mixed sources
// ---------------------------------------------------------------------------

#[test]
fn list_sources_mixed_all_kinds() {
    use serde_json::Map;
    use yeader_models::{
        LegacyBookSource, LegacyRssSource, YeaderMediaType, YeaderRequestDefaults, YeaderSource,
    };
    let db = test_db();
    let registry = SourceRegistry::new(&db);

    yeader_library::BookSourceRepo::new(&db)
        .upsert(&LegacyBookSource {
            book_source_url: "https://book1.com".into(),
            book_source_name: "Book 1".into(),
            book_source_group: None,
            search_url: None,
            book_url_pattern: None,
            login_check_js: None,
            book_source_type: None,
            enabled_explore: None,
            explore_url: None,
            rule_search: None,
            rule_book_info: None,
            rule_toc: None,
            rule_content: None,
            enabled: true,
            last_test_available: None,
            last_tested_at: None,
            last_test_detail: None,
            extra: Map::new(),
            login_url: None,
            header: None,
            custom_order: None,
            weight: None,
            last_update_time: None,
            book_source_comment: None,
        })
        .unwrap();

    yeader_library::RssSourceRepo::new(&db)
        .upsert(&LegacyRssSource {
            source_url: "https://rss1.com".into(),
            source_name: "RSS 1".into(),
            source_icon: "".into(),
            rule_articles: None,
            enabled: true,
            extra: Map::new(),
        })
        .unwrap();

    yeader_library::YeaderSourceRepo::new(&db)
        .upsert(&YeaderSource {
            id: "plugin1.com".into(),
            name: "Plugin 1".into(),
            media_type: YeaderMediaType::Novel,
            version: None,
            homepage: None,
            publisher: None,
            donate_url: None,
            tags: Vec::new(),
            enabled: true,
            request_defaults: YeaderRequestDefaults::default(),
            variables: Default::default(),
            explore_categories: Vec::new(),
            capabilities: Vec::new(),
            extra: Map::new(),
        })
        .unwrap();

    let registry = yeader_library::SourceRegistry::new(&db);

    let all = registry.list_sources(None);
    assert_eq!(all.len(), 3);
    assert_eq!(registry.list_sources(Some(SourceKind::BookSource)).len(), 1);
    assert_eq!(registry.list_sources(Some(SourceKind::Rss)).len(), 1);
    assert_eq!(registry.list_sources(Some(SourceKind::Plugin)).len(), 1);
}
