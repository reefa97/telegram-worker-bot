use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct MailAccount {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub email_address: String,
    
    pub imap_host: String,
    pub imap_port: i32,
    pub imap_user: String,
    pub imap_password_encrypted: String, 
    
    pub smtp_host: String,
    pub smtp_port: i32,
    pub smtp_user: String,
    pub smtp_password_encrypted: String,
    
    pub is_active: bool,
    pub created_by: Option<Uuid>,
    pub is_shared: bool,
    pub created_at: Option<DateTime<Utc>>,

    pub signature_text: Option<String>,
    pub signature_image_url: Option<String>,
    pub signature_image_link: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct MailFolder {
    pub id: Uuid,
    pub account_id: Uuid,
    pub name: String,
    pub remote_name: String,
    pub delimiter: String,
    pub last_uid_validity: Option<i64>,
    pub unread_count: i32,
}

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct Email {
    pub id: Uuid,
    pub account_id: Uuid,
    pub folder_id: Uuid,
    
    pub message_id: Option<String>,
    pub remote_id: String, // IMAP UID stored as TEXT in Postgres
    
    pub subject: Option<String>,
    pub from_name: Option<String>,
    pub from_address: String,
    pub to_address: Option<String>,
    pub cc_address: Option<String>,
    
    pub received_at: DateTime<Utc>,
    
    pub snippet: Option<String>,
    pub is_read: bool,
    pub has_attachments: bool,
    pub size: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct EmailBody {
    pub email_id: Uuid,
    pub body_plain: Option<String>,
    pub body_html: Option<String>,
}

// Request Bodies

#[derive(Debug, Deserialize)]
pub struct CreateAccountRequest {
    pub email_address: String,
    pub password: String, 
    pub imap_host: String,
    pub imap_port: u16,
    pub smtp_host: String,
    pub smtp_port: u16,
    
    pub signature_text: Option<String>,
    pub signature_image_url: Option<String>,
    pub signature_image_link: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TestConnectionRequest {
    pub imap_host: String,
    pub imap_port: u16,
    pub email: String,
    pub password: String,
}

// Advanced Features Models

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct MailDraft {
    pub id: Uuid,
    pub account_id: Option<Uuid>,
    pub to_address: Option<String>,
    pub cc_address: Option<String>,
    pub subject: Option<String>,
    pub body_html: Option<String>,
    pub body_plain: Option<String>,
    pub attachment_ids: Option<Vec<Uuid>>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct MailTemplate {
    pub id: Uuid,
    pub user_id: Uuid,
    pub title: String,
    pub subject_template: Option<String>,
    pub body_html_template: Option<String>,
    pub category: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct MailScheduled {
    pub id: Uuid,
    pub account_id: Option<Uuid>,
    pub to_addresses: serde_json::Value, // JSONB array of strings
    pub bcc_addresses: Option<serde_json::Value>,
    pub subject: Option<String>,
    pub body_html: Option<String>,
    pub in_reply_to: Option<String>,
    pub references: Option<String>,
    pub scheduled_at: DateTime<Utc>,
    pub sent_at: Option<DateTime<Utc>>,
    pub status: Option<String>,
    pub error_log: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
}

// Requests
#[derive(Debug, Deserialize)]
pub struct UpsertDraftRequest {
    pub id: Option<Uuid>, // If null, create new
    pub account_id: Uuid,
    pub to_addresses: Option<Vec<String>>,
    pub bcc_addresses: Option<Vec<String>>,
    pub subject: Option<String>,
    pub body_html: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ScheduleEmailRequest {
    pub account_id: Uuid,
    pub to_addresses: Vec<String>,
    pub bcc_addresses: Option<Vec<String>>,
    pub subject: Option<String>,
    pub body_html: Option<String>,
    pub in_reply_to: Option<String>,
    pub references: Option<String>,
    pub scheduled_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct SendEmailRequest {
    pub account_id: Uuid,
    pub to_addresses: Vec<String>,
    pub bcc_addresses: Option<Vec<String>>,
    pub subject: Option<String>,
    pub body_html: Option<String>,
    pub in_reply_to: Option<String>,
    pub references: Option<String>,
}
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct AccountAccess {
    pub account_id: Uuid,
    pub user_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct GrantAccessRequest {
    pub user_id: Uuid,
}
