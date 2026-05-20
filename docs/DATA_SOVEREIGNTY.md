# Yeader Data Sovereignty

Yeader stores user-owned reading data in a visible folder, similar to an
Obsidian vault.

## Data Folder

- If `YEADER_DATA_DIR` is set, Yeader uses that folder as the data root.
- Otherwise Yeader uses `Documents/Yeader`.
- The folder contains `yeader.db`, `epub_library/`, `so-novel/`, and `logs/`.

This makes the user's sources, subscriptions, reading state, local books, and
integration downloads inspectable and portable instead of hiding them in the
operating system application-support directory.

## Migration

On startup, Yeader copies existing data from the old Tauri app data directory
when the corresponding file or folder does not already exist in the data root.
It does not delete old data.

## Vault Format Direction

SQLite is an implementation detail for the current runtime index, not the final
user-owned data format. The target format is a file-first Yeader vault that is
readable, diffable, and easy to sync:

```text
Yeader/
  sources/
    rss/*.json
    rules/*.json
    plugins/*.json
  subscriptions/
    items/*.json
  reading/
    progress.jsonl
    bookmarks.jsonl
  content/
    books/*.json
    articles/*.json
  files/
    epub/
  plugins/
    installed/*.toml
  logs/
```

Format rules:

- Prefer JSON or JSONL for user data that changes over time.
- Keep binary assets under `files/`, referenced by relative paths.
- Keep plugin manifests separate from user reading data.
- Treat `yeader.db` as rebuildable cache/index once the vault format is
  implemented.
- Do not add new hidden app-private storage for sources, subscriptions, reading
  progress, bookmarks, or local content.

The deprecated `so-novel/` folder is retained only for compatibility while that
bridge exists.
