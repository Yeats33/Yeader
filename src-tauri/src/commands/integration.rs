use std::collections::HashMap;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_mini::{DebouncedEventKind, new_debouncer};
use tauri::{AppHandle, Emitter, Manager};

use crate::data::resolve_data_dir;

static SO_NOVEL_PROCESS: OnceLock<Mutex<Option<Child>>> = OnceLock::new();
static SO_NOVEL_WATCHER_RUNNING: AtomicBool = AtomicBool::new(false);

// Deprecated compatibility integration. New site-specific acquisition should
// move to YeaderHub plugins and local source rules instead of expanding
// so-novel-specific host behavior.
fn so_novel_process() -> &'static Mutex<Option<Child>> {
    SO_NOVEL_PROCESS.get_or_init(|| Mutex::new(None))
}

fn update_process_running(process: &mut Option<Child>) -> bool {
    let Some(child) = process.as_mut() else {
        return false;
    };

    match child.try_wait() {
        Ok(Some(_)) | Err(_) => {
            *process = None;
            false
        }
        Ok(None) => true,
    }
}

fn get_so_novel_dir() -> &'static str {
    if cfg!(target_os = "macos") {
        "/opt/homebrew/Cellar/so-novel/1.10.1"
    } else if cfg!(target_os = "windows") {
        r"C:\Program Files\so-novel"
    } else {
        "/usr/local/bin/so-novel"
    }
}

fn get_java_bin() -> &'static str {
    if cfg!(target_os = "macos") {
        "/opt/homebrew/opt/openjdk@21/bin/java"
    } else {
        "/usr/bin/java"
    }
}

#[tauri::command]
pub fn check_command_exists(name: &str) -> Result<bool, String> {
    let output = if cfg!(target_os = "windows") {
        Command::new("where").arg(name).output()
    } else {
        Command::new("which").arg(name).output()
    };
    match output {
        Ok(out) => Ok(out.status.success()),
        Err(e) => Err(format!("Failed to run command check: {}", e)),
    }
}

#[tauri::command]
pub fn get_command_version(name: &str) -> Result<String, String> {
    let output = if cfg!(target_os = "windows") {
        Command::new(name).arg("-V").output()
    } else {
        Command::new(name).arg("-V").output()
    };
    match output {
        Ok(out) => {
            if out.status.success() {
                let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if stdout.is_empty() {
                    Ok(String::from_utf8_lossy(&out.stderr).trim().to_string())
                } else {
                    Ok(stdout)
                }
            } else {
                Err("命令执行失败".to_string())
            }
        }
        Err(e) => Err(format!("Failed to run {} -V: {}", name, e)),
    }
}

#[tauri::command]
pub fn open_url_cmd(url: &str) -> Result<(), String> {
    tauri_plugin_opener::open_url(url, None::<&str>)
        .map_err(|e| format!("Failed to open URL: {}", e))
}

const ALLOWED_COMMANDS: &[&str] = &["which", "java", "java.exe"];

#[tauri::command]
pub fn run_command(name: &str, args: Vec<String>) -> Result<(), String> {
    if !ALLOWED_COMMANDS.contains(&name) {
        return Err(format!("Command not allowed: {}", name));
    }
    let mut cmd = std::process::Command::new(name);
    cmd.args(&args);
    cmd.spawn()
        .map_err(|e| format!("Failed to run {}: {}", name, e))?;
    Ok(())
}

#[tauri::command]
pub async fn start_so_novel_webui(app: AppHandle) -> Result<(), String> {
    let mut process = so_novel_process().lock().map_err(|e| e.to_string())?;
    if update_process_running(&mut process) {
        return Ok(());
    }

    let app_dir = resolve_data_dir(&app).map_err(|e| format!("Failed to get data dir: {}", e))?;

    let so_novel_dir = PathBuf::from(get_so_novel_dir());
    let config_dir = app_dir.join("so-novel");
    let download_dir = config_dir.join("downloads");
    std::fs::create_dir_all(&download_dir)
        .map_err(|e| format!("Failed to create download dir: {}", e))?;

    let config_path = config_dir.join("config.ini");
    if !config_path.exists() {
        std::fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config dir: {}", e))?;
        std::fs::write(&config_path, so_novel_default_config())
            .map_err(|e| format!("Failed to write config: {}", e))?;
    }

    let java_bin = get_java_bin();
    let jar_path = so_novel_dir.join("app.jar");

    let child = std::process::Command::new(java_bin)
        .args([
            "-XX:+UseZGC",
            "-XX:+ZGenerational",
            &format!("-Dconfig.file={}", config_path.to_string_lossy()),
            "-Dmode=web",
            "-jar",
        ])
        .arg(&jar_path)
        .current_dir(&config_dir)
        .spawn()
        .map_err(|e| format!("Failed to start so-novel: {}", e))?;
    *process = Some(child);

    if SO_NOVEL_WATCHER_RUNNING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_ok()
    {
        let download_dir_clone = download_dir.clone();
        let app_clone = app.clone();
        std::thread::spawn(move || {
            watch_download_dir(download_dir_clone, app_clone);
        });
    }

    Ok(())
}

fn is_ebook_file(path: &std::path::Path, download_dir: &PathBuf) -> bool {
    // Only accept .epub files directly in download_dir root (skip "Book EPUB/" subdirectories)
    let Some(parent) = path.parent() else {
        return false;
    };
    if parent != download_dir {
        return false;
    }
    if let Some(ext) = path.extension() {
        let ext = ext.to_string_lossy().to_lowercase();
        matches!(ext.as_str(), "epub")
    } else {
        false
    }
}

fn watch_download_dir(download_dir: PathBuf, app: AppHandle) {
    let (tx, rx) = std::sync::mpsc::channel();
    // Deduplicate: skip same filename within 60 seconds
    let mut recent: HashMap<String, std::time::Instant> = HashMap::new();

    let mut debouncer = match new_debouncer(Duration::from_secs(2), tx) {
        Ok(d) => d,
        Err(e) => {
            tracing::error!("Failed to create debouncer: {}", e);
            SO_NOVEL_WATCHER_RUNNING.store(false, Ordering::SeqCst);
            return;
        }
    };

    if let Err(e) = debouncer
        .watcher()
        .watch(&download_dir, RecursiveMode::Recursive)
    {
        tracing::error!("Failed to watch directory: {}", e);
        SO_NOVEL_WATCHER_RUNNING.store(false, Ordering::SeqCst);
        return;
    }

    tracing::info!(
        "Watching so-novel download directory: {}",
        download_dir.display()
    );

    for res in rx {
        match res {
            Ok(events) => {
                for event in events {
                    if event.kind == DebouncedEventKind::Any
                        && is_ebook_file(&event.path, &download_dir)
                    {
                        let filename = event
                            .path
                            .file_name()
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or_default();

                        let now = std::time::Instant::now();
                        if let Some(last) = recent.get(&filename)
                            && now.duration_since(*last).as_secs() < 60
                        {
                            continue;
                        }
                        recent.insert(filename.clone(), now);

                        let path = event.path.clone();
                        let app_clone = app.clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(Duration::from_secs(2));
                            let path_str = path.to_string_lossy().to_string();
                            tracing::info!("so-novel downloaded file ready: {}", path_str);
                            let _ = app_clone.emit("so-novel-download-ready", path_str);
                        });
                    }
                }
            }
            Err(e) => tracing::error!("Watch error: {:?}", e),
        }
    }
    SO_NOVEL_WATCHER_RUNNING.store(false, Ordering::SeqCst);
}

#[tauri::command]
pub fn is_so_novel_running() -> bool {
    let Ok(mut process) = so_novel_process().lock() else {
        return false;
    };
    update_process_running(&mut process)
}

#[tauri::command]
pub fn stop_so_novel() -> Result<(), String> {
    let mut process = so_novel_process().lock().map_err(|e| e.to_string())?;
    let Some(child) = process.as_mut() else {
        return Ok(());
    };

    if child
        .try_wait()
        .map_err(|e| format!("Failed to query so-novel process: {}", e))?
        .is_some()
    {
        *process = None;
        return Ok(());
    }

    child
        .kill()
        .map_err(|e| format!("Failed to stop so-novel: {}", e))?;
    let _ = child.wait();
    *process = None;
    Ok(())
}

fn so_novel_config_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_dir = resolve_data_dir(app).map_err(|e| format!("Failed to get data dir: {}", e))?;
    Ok(app_dir.join("so-novel"))
}

fn so_novel_bundle_config(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path()
        .resource_dir()
        .ok()
        .map(|res| res.join("integration").join("so-novel").join("config.ini"))
}

fn ensure_user_config(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let config_dir = so_novel_config_dir(app)?;
    let config_path = config_dir.join("config.ini");

    if !config_path.exists() {
        std::fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config dir: {}", e))?;
        let default_content = if let Some(bundle_path) = so_novel_bundle_config(app) {
            if bundle_path.exists() {
                std::fs::read_to_string(&bundle_path)
                    .unwrap_or_else(|_| so_novel_default_config().to_string())
            } else {
                so_novel_default_config().to_string()
            }
        } else {
            so_novel_default_config().to_string()
        };
        std::fs::write(&config_path, default_content)
            .map_err(|e| format!("Failed to write config: {}", e))?;
    }
    Ok(config_path)
}

fn so_novel_default_config() -> &'static str {
    r#"[global]
# 启动时自动更新 (1 开，0 关)
auto-update = 0
# GitHub 代理加速地址，无法从 GitHub 获取更新时设置
gh-proxy =
# 绕过 Cloudflare 保护的服务地址，用法详见 https://github.com/sarperavci/CloudflareBypassForScraping
cf-bypass =

[download]
# 下载路径
download-path = downloads
# 下载格式 (可选 epub, txt, html, pdf，默认 epub)
extname = epub
# 当下载格式为 txt 时，可设置其编码为 GBK 以兼容旧设备 (默认 UTF-8)
txt-encoding =
# 下载完成后保留章节缓存目录 (1 开，0 关)
preserve-chapter-cache = 0

[source]
# 书籍内容语言 (可选 zh_CN, zh_TW, zh_Hant，默认自动)
language =
# 激活规则文件路径
active-rules = main.json
# 指定当前激活规则中的某个书源，用于指定搜索、批量下载 (填写书源 ID)
source-id =
# 每个书源只显示前 N 条搜索记录 (不指定则为全部)
search-limit = 30
# 优化搜索结果 (过滤低相似度并排序。1 开，0 关)
search-filter = 1

[crawl]
# 并发上限 (默认 50)
concurrency =
# 最小间隔 (毫秒)
min-interval = 200
# 最大间隔 (毫秒)
max-interval = 400
# 启用重试，不启用则下载出错时立即中断 (1 开，0 关)
enable-retry = 1
# 最大重试次数 (针对首次下载失败的章节)
max-retries = 3
# 重试最小间隔 (毫秒)
retry-min-interval = 2000
# 重试最大间隔 (毫秒)
retry-max-interval = 4000

[web]
# 启用 Web 服务 (1 开，0 关)
enabled = 1
# Web 服务端口
port = 7765

[cookie]
# 此处填写 qidian cookie (w_tsfp=xxx) 以获取最新封面
qidian =

[proxy]
# 启用 HTTP 代理 (针对需要代理的书源。1 开，0 关)
enabled = 0
host = 127.0.0.1
port = your port
"#
}

#[tauri::command]
pub fn get_so_novel_config(app: tauri::AppHandle) -> Result<String, String> {
    let config_path = ensure_user_config(&app)?;
    std::fs::read_to_string(&config_path).map_err(|e| format!("Failed to read config: {}", e))
}

#[tauri::command]
pub fn save_so_novel_config(app: tauri::AppHandle, content: String) -> Result<(), String> {
    let config_path = ensure_user_config(&app)?;
    std::fs::write(&config_path, content).map_err(|e| format!("Failed to write config: {}", e))
}

#[tauri::command]
pub fn reset_so_novel_config(app: tauri::AppHandle) -> Result<(), String> {
    let config_path = ensure_user_config(&app)?;
    std::fs::write(&config_path, so_novel_default_config())
        .map_err(|e| format!("Failed to reset config: {}", e))
}

fn so_novel_rules_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(so_novel_config_dir(app)?.join("rules"))
}

#[tauri::command]
pub fn list_so_novel_rules(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let rules_dir = so_novel_rules_dir(&app)?;
    if !rules_dir.exists() {
        return Ok(vec![]);
    }
    let mut rules = vec![];
    for entry in
        std::fs::read_dir(&rules_dir).map_err(|e| format!("Failed to read rules dir: {}", e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        if path.extension().map(|e| e == "json").unwrap_or(false)
            && let Some(name) = path.file_stem()
        {
            rules.push(name.to_string_lossy().to_string());
        }
    }
    rules.sort();
    Ok(rules)
}

fn validate_rule_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Rule name cannot be empty".to_string());
    }
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err("Rule name must contain only [A-Za-z0-9_-] characters".to_string());
    }
    Ok(())
}

fn validate_rule_file_name(name: &str) -> Result<(), String> {
    let Some(rule_name) = name.strip_suffix(".json") else {
        return Err("Rule file name must end with .json".to_string());
    };
    validate_rule_name(rule_name)
}

#[tauri::command]
pub fn import_so_novel_rule(
    app: tauri::AppHandle,
    name: String,
    content: String,
) -> Result<(), String> {
    validate_rule_name(&name)?;
    let rules_dir = so_novel_rules_dir(&app)?;
    std::fs::create_dir_all(&rules_dir)
        .map_err(|e| format!("Failed to create rules dir: {}", e))?;
    let rule_path = rules_dir.join(format!("{}.json", name));
    std::fs::write(&rule_path, content).map_err(|e| format!("Failed to write rule: {}", e))
}

#[tauri::command]
pub fn delete_so_novel_rule(app: tauri::AppHandle, name: String) -> Result<(), String> {
    validate_rule_name(&name)?;
    let rules_dir = so_novel_rules_dir(&app)?;
    let rule_path = rules_dir.join(format!("{}.json", name));
    if rule_path.exists() {
        std::fs::remove_file(&rule_path).map_err(|e| format!("Failed to delete rule: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_so_novel_active_rule(app: tauri::AppHandle) -> Result<String, String> {
    let config = get_so_novel_config(app)?;
    for line in config.lines() {
        let line = line.trim();
        if line.starts_with("active-rules") && line.contains('=') {
            return Ok(line.split('=').nth(1).unwrap_or("").trim().to_string());
        }
    }
    Ok("main.json".to_string())
}

#[tauri::command]
pub fn set_so_novel_active_rule(app: tauri::AppHandle, name: String) -> Result<(), String> {
    validate_rule_file_name(&name)?;
    let config = get_so_novel_config(app.clone())?;
    let new_config: String = config
        .lines()
        .map(|line| {
            let line = line.trim();
            if line.starts_with("active-rules") && line.contains('=') {
                format!("active-rules = {}", name)
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    save_so_novel_config(app, new_config)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn ebook_file_must_be_epub_directly_under_download_dir() {
        let download_dir = PathBuf::from("/tmp/yeader-downloads");

        assert!(is_ebook_file(
            Path::new("/tmp/yeader-downloads/book.epub"),
            &download_dir,
        ));
        assert!(!is_ebook_file(
            Path::new("/tmp/yeader-downloads/book.txt"),
            &download_dir,
        ));
        assert!(!is_ebook_file(
            Path::new("/tmp/yeader-downloads/nested/book.epub"),
            &download_dir,
        ));
    }

    #[test]
    fn rule_file_names_must_be_safe_json_files() {
        assert!(validate_rule_file_name("main.json").is_ok());
        assert!(validate_rule_file_name("no-search.json").is_ok());
        assert!(validate_rule_file_name("nested/main.json").is_err());
        assert!(validate_rule_file_name("../main.json").is_err());
        assert!(validate_rule_file_name("main.toml").is_err());
        assert!(validate_rule_file_name(".json").is_err());
    }
}
