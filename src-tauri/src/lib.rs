// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use mail_builder::MessageBuilder;
use mail_send::SmtpClientBuilder;
use serde::{Deserialize, Serialize};

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
        .invoke_handler(tauri::generate_handler![greet, send_email, test_smtp_connection])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
