use std::process::Command;
use tauri_plugin_shell::ShellExt;

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
pub fn open_url(app: tauri::AppHandle, url: &str) -> Result<(), String> {
    app.shell()
        .open(url, None)
        .map_err(|e| format!("Failed to open URL: {}", e))
}
