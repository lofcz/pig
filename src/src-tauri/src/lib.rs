// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use mail_builder::MessageBuilder;
use mail_send::SmtpClientBuilder;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;
use std::collections::HashMap;
use std::process::{Command as ProcessCommand, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, State};

#[cfg(windows)]
mod win_watcher;

#[cfg(windows)]
use win_watcher::WinWatcher;

#[cfg(not(windows))]
use notify::{RecursiveMode, Watcher, RecommendedWatcher};

// Platform-specific watcher storage
#[cfg(windows)]
#[derive(Default)]
struct WatcherState {
    watchers: Mutex<HashMap<String, WinWatcher>>,
}

#[cfg(not(windows))]
#[derive(Default)]
struct WatcherState {
    watchers: Mutex<HashMap<String, RecommendedWatcher>>,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SmtpConfig {
    pub host: String,
    pub port: u16,
    pub secure: bool, // true = implicit TLS (465), false = STARTTLS (587)
    pub username: String,
    pub password: String,
    pub from_email: String,
    pub from_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EmailAttachment {
    pub filename: String,
    pub content_base64: String,
    pub content_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SendEmailRequest {
    pub smtp: SmtpConfig,
    pub to_email: String,
    pub to_name: Option<String>,
    pub subject: String,
    pub body_html: String,
    pub body_text: Option<String>,
    pub attachments: Option<Vec<EmailAttachment>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SendEmailResponse {
    pub success: bool,
    pub message: String,
}

#[tauri::command]
async fn send_email(request: SendEmailRequest) -> Result<SendEmailResponse, String> {
    use base64::Engine;
    
    // Build the message
    let from = if let Some(name) = &request.smtp.from_name {
        (name.as_str(), request.smtp.from_email.as_str())
    } else {
        ("", request.smtp.from_email.as_str())
    };

    let to = if let Some(name) = &request.to_name {
        (name.as_str(), request.to_email.as_str())
    } else {
        ("", request.to_email.as_str())
    };

    let mut message_builder = MessageBuilder::new()
        .from(from)
        .to(vec![to])
        .subject(&request.subject)
        .html_body(&request.body_html);

    // Add plain text alternative if provided
    if let Some(text) = &request.body_text {
        message_builder = message_builder.text_body(text);
    }

    // Add attachments if any
    if let Some(attachments) = &request.attachments {
        for attachment in attachments {
            let content = base64::engine::general_purpose::STANDARD
                .decode(&attachment.content_base64)
                .map_err(|e| format!("Failed to decode attachment: {}", e))?;
            
            message_builder = message_builder.attachment(
                &attachment.content_type,
                &attachment.filename,
                content,
            );
        }
    }

    // Connect and send
    let mut smtp_client = if request.smtp.secure {
        // Implicit TLS (port 465)
        SmtpClientBuilder::new(request.smtp.host.as_str(), request.smtp.port)
            .implicit_tls(true)
            .credentials((request.smtp.username.as_str(), request.smtp.password.as_str()))
            .connect()
            .await
    } else {
        // STARTTLS (port 587)
        SmtpClientBuilder::new(request.smtp.host.as_str(), request.smtp.port)
            .implicit_tls(false)
            .credentials((request.smtp.username.as_str(), request.smtp.password.as_str()))
            .connect()
            .await
    }.map_err(|e| format!("Failed to connect to SMTP server: {}", e))?;

    smtp_client
        .send(message_builder)
        .await
        .map_err(|e| format!("Failed to send email: {}", e))?;

    Ok(SendEmailResponse {
        success: true,
        message: "Email sent successfully".to_string(),
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateZipRequest {
    pub file_paths: Vec<String>,
    pub output_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateZipResponse {
    pub success: bool,
    pub message: String,
    pub output_path: String,
    pub size: u64,
}

#[tauri::command]
fn create_zip(request: CreateZipRequest) -> Result<CreateZipResponse, String> {
    let output_file = File::create(&request.output_path)
        .map_err(|e| format!("Failed to create zip file: {}", e))?;
    
    let mut zip = ZipWriter::new(output_file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .compression_level(Some(6));
    
    for file_path in &request.file_paths {
        let path = Path::new(file_path);
        let file_name = path.file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| format!("Invalid file name: {}", file_path))?;
        
        let mut file = File::open(path)
            .map_err(|e| format!("Failed to open file {}: {}", file_path, e))?;
        
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)
            .map_err(|e| format!("Failed to read file {}: {}", file_path, e))?;
        
        zip.start_file(file_name, options)
            .map_err(|e| format!("Failed to add file to zip: {}", e))?;
        
        zip.write_all(&buffer)
            .map_err(|e| format!("Failed to write to zip: {}", e))?;
    }
    
    zip.finish()
        .map_err(|e| format!("Failed to finalize zip: {}", e))?;
    
    // Get the file size
    let metadata = std::fs::metadata(&request.output_path)
        .map_err(|e| format!("Failed to get zip metadata: {}", e))?;
    
    Ok(CreateZipResponse {
        success: true,
        message: format!("Created zip with {} files", request.file_paths.len()),
        output_path: request.output_path,
        size: metadata.len(),
    })
}

#[tauri::command]
async fn test_smtp_connection(smtp: SmtpConfig) -> Result<SendEmailResponse, String> {
    // Just try to connect to verify credentials
    let smtp_result = if smtp.secure {
        SmtpClientBuilder::new(smtp.host.as_str(), smtp.port)
            .implicit_tls(true)
            .credentials((smtp.username.as_str(), smtp.password.as_str()))
            .connect()
            .await
    } else {
        SmtpClientBuilder::new(smtp.host.as_str(), smtp.port)
            .implicit_tls(false)
            .credentials((smtp.username.as_str(), smtp.password.as_str()))
            .connect()
            .await
    };

    match smtp_result {
        Ok(_) => Ok(SendEmailResponse {
            success: true,
            message: "SMTP connection successful!".to_string(),
        }),
        Err(e) => Err(format!("SMTP connection failed: {}", e)),
    }
}

#[derive(Serialize, Clone)]
struct WatchEvent {
    path: String,
    kind: String,
}

// Windows implementation using custom watcher
#[cfg(windows)]
#[tauri::command]
async fn watch_path(
    path: String,
    recursive: bool,
    event_name: String,
    state: State<'_, WatcherState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let mut watchers = state.watchers.lock().map_err(|e| e.to_string())?;
    
    if watchers.contains_key(&path) {
        return Ok(());
    }

    let path_clone = path.clone();
    let (tx, rx) = crossbeam_channel::unbounded();
    
    let watcher = WinWatcher::new(&path, recursive, tx).map_err(|e| e.to_string())?;

    // Spawn thread to forward events to Tauri
    let app_handle_clone = app_handle.clone();
    let event_name_clone = event_name.clone();
    println!("Starting event forwarder for: {}", event_name);
    std::thread::spawn(move || {
        println!("Event forwarder thread started for: {}", event_name_clone);
        while let Ok(event) = rx.recv() {
            let kind_str = match event.kind {
                win_watcher::WatchEventKind::Create => "create",
                win_watcher::WatchEventKind::Remove => "remove",
                win_watcher::WatchEventKind::Modify => "modify",
                win_watcher::WatchEventKind::Rename => "rename",
            };
            
            println!("Forwarding event to frontend: {} - {} ({})", event_name_clone, event.path, kind_str);
            let result = app_handle_clone.emit(
                &event_name_clone,
                WatchEvent {
                    path: event.path,
                    kind: kind_str.to_string(),
                },
            );
            println!("Emit result: {:?}", result);
        }
        println!("Event forwarder thread ended for: {}", event_name_clone);
    });

    watchers.insert(path_clone, watcher);
    Ok(())
}

// Non-Windows implementation using notify
#[cfg(not(windows))]
#[tauri::command]
async fn watch_path(
    path: String,
    recursive: bool,
    event_name: String,
    state: State<'_, WatcherState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let mut watchers = state.watchers.lock().map_err(|e| e.to_string())?;
    
    if watchers.contains_key(&path) {
        return Ok(());
    }

    let path_clone = path.clone();
    let app_handle_clone = app_handle.clone();
    let event_name_clone = event_name.clone();

    let watcher = notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
        match res {
            Ok(event) => {
                let kind_str = match event.kind {
                    notify::EventKind::Create(_) => "create",
                    notify::EventKind::Modify(_) => "modify",
                    notify::EventKind::Remove(_) => "remove",
                    _ => "any",
                };
                
                for p in event.paths {
                    let _ = app_handle_clone.emit(
                        &event_name_clone,
                        WatchEvent {
                            path: p.to_string_lossy().into_owned(),
                            kind: kind_str.to_string(),
                        },
                    );
                }
            }
            Err(e) => {
                let _ = app_handle_clone.emit(
                    &event_name_clone,
                    WatchEvent {
                        path: format!("error:{}", e),
                        kind: "error".to_string(),
                    },
                );
            }
        }
    }).map_err(|e| e.to_string())?;

    let mut watcher = watcher;
    let mode = if recursive { RecursiveMode::Recursive } else { RecursiveMode::NonRecursive };
    watcher.watch(Path::new(&path), mode).map_err(|e| e.to_string())?;

    watchers.insert(path_clone, watcher);
    Ok(())
}

#[tauri::command]
async fn unwatch_path(path: String, state: State<'_, WatcherState>) -> Result<(), String> {
    let mut watchers = state.watchers.lock().map_err(|e| e.to_string())?;
    if let Some(watcher) = watchers.remove(&path) {
        // Watcher is dropped here, which stops watching
        drop(watcher);
    }
    Ok(())
}

fn hide_process_window(command: &mut ProcessCommand) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
}

fn validate_soffice_executable(executable: &Path) -> Result<(), String> {
    let metadata = executable
        .metadata()
        .map_err(|_| "The configured LibreOffice executable does not exist.".to_string())?;

    if !metadata.is_file() {
        return Err("The LibreOffice setting must point to soffice.exe.".to_string());
    }

    let executable_name = executable
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if executable_name != "soffice.exe" && executable_name != "soffice" {
        return Err("The LibreOffice setting must point to soffice.exe.".to_string());
    }

    Ok(())
}

#[tauri::command]
async fn validate_soffice(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_soffice_executable(Path::new(&path))
    })
    .await
    .map_err(|error| format!("LibreOffice validation task failed: {error}"))?
}

#[tauri::command]
async fn convert_odt_to_pdf(
    soffice_path: String,
    odt_path: String,
    output_dir: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let executable = Path::new(&soffice_path);
        validate_soffice_executable(executable)?;

        let odt = Path::new(&odt_path);
        if !odt.is_file() {
            return Err("The invoice ODT file does not exist.".to_string());
        }

        let output_directory = Path::new(&output_dir);
        std::fs::create_dir_all(output_directory)
            .map_err(|error| format!("Could not create the PDF output folder: {error}"))?;

        let file_stem = odt
            .file_stem()
            .ok_or_else(|| "The invoice ODT filename is invalid.".to_string())?;
        let pdf_path = output_directory.join(file_stem).with_extension("pdf");
        if pdf_path.exists() {
            std::fs::remove_file(&pdf_path)
                .map_err(|error| format!("Could not replace the previous PDF: {error}"))?;
        }

        let profile_id = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let profile_directory =
            std::env::temp_dir().join(format!("pig-libreoffice-{profile_id}"));
        std::fs::create_dir_all(&profile_directory)
            .map_err(|error| format!("Could not create a temporary LibreOffice profile: {error}"))?;
        let profile_url = format!(
            "file:///{}",
            profile_directory.to_string_lossy().replace('\\', "/")
        );

        let mut command = ProcessCommand::new(executable);
        command
            .arg(format!("-env:UserInstallation={profile_url}"))
            .args([
                "--headless",
                "--invisible",
                "--nologo",
                "--nodefault",
                "--norestore",
                "--nolockcheck",
                "--convert-to",
                "pdf",
            ])
            .arg(odt)
            .arg("--outdir")
            .arg(output_directory)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        hide_process_window(&mut command);

        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(error) => {
                let _ = std::fs::remove_dir_all(&profile_directory);
                return Err(format!("LibreOffice could not be started: {error}"));
            }
        };
        let started_at = Instant::now();
        loop {
            match child.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) if started_at.elapsed() < Duration::from_secs(60) => {
                    std::thread::sleep(Duration::from_millis(100));
                }
                Ok(None) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = std::fs::remove_dir_all(&profile_directory);
                    return Err("LibreOffice conversion timed out and was stopped.".to_string());
                }
                Err(error) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = std::fs::remove_dir_all(&profile_directory);
                    return Err(format!("Could not monitor LibreOffice conversion: {error}"));
                }
            }
        }

        let output_result = child.wait_with_output();
        let _ = std::fs::remove_dir_all(&profile_directory);
        let output = output_result
            .map_err(|error| format!("Could not collect LibreOffice output: {error}"))?;

        if !output.status.success() {
            let details = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if details.is_empty() {
                "LibreOffice could not convert the invoice to PDF.".to_string()
            } else {
                format!("LibreOffice conversion failed: {details}")
            });
        }

        let pdf_metadata = pdf_path
            .metadata()
            .map_err(|_| "LibreOffice finished without creating a PDF.".to_string())?;
        if !pdf_metadata.is_file() || pdf_metadata.len() == 0 {
            return Err("LibreOffice created an empty or invalid PDF.".to_string());
        }

        Ok(pdf_path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|error| format!("PDF conversion task failed: {error}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WatcherState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            greet, 
            send_email, 
            test_smtp_connection, 
            create_zip,
            watch_path,
            unwatch_path,
            validate_soffice,
            convert_odt_to_pdf
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
