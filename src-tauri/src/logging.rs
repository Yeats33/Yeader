//! Level-split logging with size-based truncation.
//!
//! - ERROR/WARN → yeader-errors.log (no truncation, unlimited)
//! - INFO/DEBUG → yeader.log.YYYY-MM-DD (max 5 MB, truncated)
//!
//! Replaces `env_logger`.

use std::fs::{File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use tracing_subscriber::{
    EnvFilter,
    fmt::{self, MakeWriter, format::FmtSpan},
    prelude::*,
};

const LOG_DIR_NAME: &str = "logs";
const MAX_MAIN_SIZE: usize = 5 * 1024 * 1024; // 5 MB for info/debug log

/// Whether this is a debug/dev build (true) or release build (false).
pub const IS_DEV_MODE_AVAILABLE: bool = cfg!(debug_assertions);

// ---------------------------------------------------------------------------
// Size tracker
// ---------------------------------------------------------------------------

struct SizeTracker(AtomicUsize);

impl SizeTracker {
    fn new() -> Self {
        Self(AtomicUsize::new(0))
    }
    fn add(&self, n: usize) {
        self.0.fetch_add(n, Ordering::Relaxed);
    }
    fn get(&self) -> usize {
        self.0.load(Ordering::Relaxed)
    }
    fn set(&self, v: usize) {
        self.0.store(v, Ordering::Relaxed);
    }
}

// ---------------------------------------------------------------------------
// Truncating writer for main log
// ---------------------------------------------------------------------------

struct TruncatingWriter {
    file: Arc<Mutex<File>>,
    path: PathBuf,
    tracker: Arc<SizeTracker>,
}

impl TruncatingWriter {
    fn new(path: PathBuf, tracker: Arc<SizeTracker>) -> io::Result<Self> {
        let file = OpenOptions::new().create(true).append(true).open(&path)?;
        let size = file.metadata()?.len() as usize;
        tracker.set(size);
        Ok(Self {
            file: Arc::new(Mutex::new(file)),
            path,
            tracker,
        })
    }

    fn truncate_if_needed(&self) -> io::Result<()> {
        if self.tracker.get() <= MAX_MAIN_SIZE {
            return Ok(());
        }

        let mut f = OpenOptions::new().read(true).open(&self.path)?;
        let file_size = f.metadata()?.len() as usize;
        if file_size == 0 {
            self.tracker.set(0);
            return Ok(());
        }

        // Keep second half of the file.
        let keep_start = file_size / 2;
        let mut content = vec![0u8; file_size];
        f.read_exact(&mut content)?;
        drop(f);

        let remaining = content[keep_start..].to_vec();
        let mut out = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&self.path)?;
        out.write_all(&remaining)?;
        out.flush()?;
        self.tracker.set(remaining.len());
        Ok(())
    }
}

impl Write for TruncatingWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        // Check before writing.
        if self.tracker.get() + buf.len() > MAX_MAIN_SIZE {
            self.truncate_if_needed()?;
        }

        let mut file = self.file.lock().unwrap();
        let written = file.write(buf)?;
        self.tracker.add(written);
        Ok(written)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.file.lock().unwrap().flush()
    }
}

// ---------------------------------------------------------------------------
// Error-only writer (no truncation)
// ---------------------------------------------------------------------------

struct ErrorWriter {
    file: Arc<Mutex<File>>,
}

impl ErrorWriter {
    fn new(path: PathBuf) -> io::Result<Self> {
        let file = OpenOptions::new().create(true).append(true).open(path)?;
        Ok(Self {
            file: Arc::new(Mutex::new(file)),
        })
    }
}

impl Write for ErrorWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.file.lock().unwrap().write(buf)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.file.lock().unwrap().flush()
    }
}

// ---------------------------------------------------------------------------
// Level-split MakeWriter (routes records to correct writer)
// ---------------------------------------------------------------------------

struct LevelSplitMakeWriter {
    main: Arc<Mutex<TruncatingWriter>>,
    error: Arc<Mutex<ErrorWriter>>,
}

impl LevelSplitMakeWriter {
    fn new(main: Arc<Mutex<TruncatingWriter>>, error: Arc<Mutex<ErrorWriter>>) -> Self {
        Self { main, error }
    }
}

impl MakeWriter<'_> for LevelSplitMakeWriter {
    type Writer = LevelSplitWriter;

    fn make_writer(&self) -> Self::Writer {
        LevelSplitWriter {
            main: Arc::clone(&self.main),
            error: Arc::clone(&self.error),
        }
    }
}

struct LevelSplitWriter {
    main: Arc<Mutex<TruncatingWriter>>,
    error: Arc<Mutex<ErrorWriter>>,
}

impl Write for LevelSplitWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        // Parse the level from the JSON line to route correctly.
        if let Some(first_char) = buf.first().copied()
            && first_char == b'{'
                && let Ok(line) = std::str::from_utf8(buf)
                    && let Some(level_start) = line.find("\"level\":\"") {
                        let after = &line[level_start + 8..];
                        let level_end = after.find('"').unwrap_or(0);
                        let level = &after[..level_end];

                        if level == "ERROR" || level == "WARN" {
                            return self.error.lock().unwrap().write(buf);
                        }
                    }
        // Default: main log (INFO, DEBUG, etc.)
        self.main.lock().unwrap().write(buf)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.main.lock().unwrap().flush()?;
        self.error.lock().unwrap().flush()?;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/// Returns YYYY-MM-DD using only std library.
fn chrono_lite_date() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap();
    let days_since_epoch = now.as_secs() / 86400;

    // Julian Day Number for 1970-01-01 is 2440588.
    let jd = 2440588i64 + days_since_epoch as i64;

    // Convert JDN to Gregorian date using Fliegel-Van Flandern.
    let l = jd + 68569;
    let n = (4 * l) / 146097;
    let l = l - (146097 * n + 3) / 4;
    let i = (4000 * (l + 1)) / 1461001;
    let l = l - (1461 * i) / 4 + 31;
    let j = (80 * l) / 2447;
    let day = (l - (2447 * j) / 80) as u8;
    let l = j / 11;
    let month = (j + 2 - 12 * l) as u8;
    let year = 100 * (n - 49) + i + l;

    format!("{:04}-{:02}-{:02}", year, month, day)
}

/// Returns the main log path: yeader.log.YYYY-MM-DD
pub fn info_log_path(log_dir: &PathBuf) -> PathBuf {
    log_dir.join(format!("yeader.log.{}", chrono_lite_date()))
}

/// Returns the error log path: yeader-errors.log
pub fn error_log_path(log_dir: &PathBuf) -> PathBuf {
    log_dir.join("yeader-errors.log")
}

/// Returns the log directory path for the given app data directory.
pub fn log_dir(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join(LOG_DIR_NAME)
}

/// Sets up the tracing subscriber with level-split file logging.
///
/// In dev mode: writes to both stderr and the rotating log files.
/// In release mode: writes to log files only.
///
/// Returns a guard that must be held for the duration of the program.
pub fn init_logging(log_dir: PathBuf) -> Result<DropGuard<()>, String> {
    std::fs::create_dir_all(&log_dir)
        .map_err(|e| format!("Failed to create log directory: {}", e))?;

    let main_path = info_log_path(&log_dir);
    let error_path = error_log_path(&log_dir);

    let tracker = Arc::new(SizeTracker::new());
    let main = Arc::new(Mutex::new(
        TruncatingWriter::new(main_path, Arc::clone(&tracker))
            .map_err(|e| format!("Failed to open main log: {}", e))?,
    ));
    let error = Arc::new(Mutex::new(
        ErrorWriter::new(error_path).map_err(|e| format!("Failed to open error log: {}", e))?,
    ));

    let make_writer = LevelSplitMakeWriter::new(Arc::clone(&main), Arc::clone(&error));

    let env_filter = if IS_DEV_MODE_AVAILABLE {
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("debug"))
    } else {
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"))
    };

    let json_layer = fmt::layer()
        .json()
        .with_target(true)
        .with_thread_ids(false)
        .with_thread_names(false)
        .with_file(true)
        .with_line_number(true)
        .with_span_events(FmtSpan::CLOSE)
        .with_writer(make_writer);

    // In dev mode: pretty stdout with extra detail (timestamps, debug/trace).
    // In release mode: no stderr output (logs go to files only).
    let stderr_layer = if IS_DEV_MODE_AVAILABLE {
        Some(
            fmt::layer()
                .pretty()
                .with_target(true)
                .with_thread_ids(false)
                .with_thread_names(false)
                .with_file(true)
                .with_line_number(true)
                .with_span_events(FmtSpan::CLOSE)
                .with_ansi(true)
                .with_writer(std::io::stderr),
        )
    } else {
        None
    };

    tracing_subscriber::registry()
        .with(env_filter)
        .with(json_layer)
        .with(stderr_layer)
        .init();

    tracing::info!(
        "Logging initialized (dev_mode_available={})",
        IS_DEV_MODE_AVAILABLE
    );

    // Dummy guard — we don't use tracing-appender so no background thread to manage.
    Ok(DropGuard {
        _phantom: std::marker::PhantomData,
    })
}

/// No-op guard for when tracing-appender is not used.
pub struct DropGuard<T> {
    _phantom: std::marker::PhantomData<T>,
}

impl<T> Drop for DropGuard<T> {
    fn drop(&mut self) {}
}
