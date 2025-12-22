import { invoke } from '@tauri-apps/api/core';
import { EmailConnector } from '../types';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  from_email: string;
  from_name?: string;
}

export interface EmailAttachment {
  filename: string;
  content_base64: string;
  content_type: string;
}

export interface SendEmailRequest {
  smtp: SmtpConfig;
  to_email: string;
  to_name?: string;
  subject: string;
  body_html: string;
  body_text?: string;
  attachments?: EmailAttachment[];
}

export interface SendEmailResponse {
  success: boolean;
  message: string;
}

/**
 * Convert an EmailConnector to SmtpConfig for the Tauri command
 */
export function connectorToSmtpConfig(connector: EmailConnector): SmtpConfig {
  return {
    host: connector.host,
    port: connector.port,
    secure: connector.secure,
    username: connector.username,
    password: connector.password,
    from_email: connector.fromEmail,
    from_name: connector.fromName,
  };
}

/**
 * Test SMTP connection with the given connector settings
 */
export async function testSmtpConnection(connector: EmailConnector): Promise<SendEmailResponse> {
  const smtp = connectorToSmtpConfig(connector);
  return await invoke<SendEmailResponse>('test_smtp_connection', { smtp });
}

/**
 * Send an email using the specified connector
 */
export async function sendEmail(
  connector: EmailConnector,
  toEmail: string,
  toName: string | undefined,
  subject: string,
  bodyHtml: string,
  bodyText?: string,
  attachments?: EmailAttachment[]
): Promise<SendEmailResponse> {
  const request: SendEmailRequest = {
    smtp: connectorToSmtpConfig(connector),
    to_email: toEmail,
    to_name: toName,
    subject,
    body_html: bodyHtml,
    body_text: bodyText,
    attachments,
  };
  return await invoke<SendEmailResponse>('send_email', { request });
}

/**
 * Read a file and convert it to base64 for email attachment
 */
export async function fileToBase64Attachment(
  filePath: string,
  filename: string,
  contentType: string
): Promise<EmailAttachment> {
  const { readFile } = await import('@tauri-apps/plugin-fs');
  const content = await readFile(filePath);
  const base64 = btoa(
    Array.from(content)
      .map((byte) => String.fromCharCode(byte))
      .join('')
  );
  return {
    filename,
    content_base64: base64,
    content_type: contentType,
  };
}

export interface CreateZipResponse {
  success: boolean;
  message: string;
  output_path: string;
  size: number;
}

/**
 * Create a zip file from multiple files using Rust for speed
 */
export async function createZip(
  filePaths: string[],
  outputPath: string
): Promise<CreateZipResponse> {
  return await invoke<CreateZipResponse>('create_zip', {
    request: {
      file_paths: filePaths,
      output_path: outputPath,
    },
  });
}

