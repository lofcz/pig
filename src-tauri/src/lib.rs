// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use mail_builder::MessageBuilder;
use mail_send::SmtpClientBuilder;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![greet, send_email, test_smtp_connection, create_zip])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
