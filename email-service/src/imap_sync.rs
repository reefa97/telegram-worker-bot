use sqlx::PgPool;
use native_tls::TlsConnector;
use mail_parser::{Message, HeaderValue};
use crate::models::{MailAccount, Email, EmailBody, MailFolder};
use crate::db;
use uuid::Uuid;
use std::collections::HashSet;
use chrono::{Utc, DateTime};

pub async fn sync_account(account: &MailAccount, pg_pool: &PgPool) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut folders_to_sync = vec!["INBOX", "SENT", "TRASH", "DRAFTS", "SPAM", "Spam", "Junk"];
    // Remove duplicates case-insensitively
    let mut seen = HashSet::new();
    folders_to_sync.retain(|&f| seen.insert(f.to_lowercase()));
    
    for folder_name in folders_to_sync {
        if let Err(e) = sync_folder(account, pg_pool, folder_name).await {
            log::error!("Failed to sync folder {} for {}: {:?}", folder_name, account.email_address, e);
        }
    }
    Ok(())
}

async fn sync_folder(account: &MailAccount, pg_pool: &PgPool, folder_name: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let account_owned = account.clone();
    let folder_name_owned = folder_name.to_string();
    
    let folder_id = get_or_create_folder(pg_pool, account.id, folder_name).await?;
    
    let existing_remote_ids: Vec<String> = sqlx::query_scalar("SELECT remote_id FROM email_messages WHERE folder_id = $1")
        .bind(folder_id)
        .fetch_all(pg_pool)
        .await?;
    let existing_ids_set: HashSet<String> = existing_remote_ids.into_iter().collect();

    // Spawn blocking task for IMAP operations
    let email_data_res = tokio::task::spawn_blocking(move || -> Result<Vec<(Email, EmailBody)>, String> {
        let domain = &account_owned.imap_host;
        let port = account_owned.imap_port as u16;
        log::info!("Connecting to IMAP for {} at {}:{}", account_owned.email_address, domain, port);
        
        let tls = TlsConnector::builder()
            .danger_accept_invalid_certs(true) 
            .build().map_err(|e| e.to_string())?;
        let client = imap::connect((domain.as_str(), port), domain, &tls).map_err(|e| e.to_string())?;
        
        let mut session = client.login(&account_owned.email_address, &account_owned.imap_password_encrypted)
            .map_err(|e| format!("IMAP Login Error: {}", e.0))?;

        // Attempt to select folder, skip if it doesn't exist
        let _mailbox = match session.select(&folder_name_owned) {
            Ok(m) => m,
            Err(_) => {
                log::warn!("Folder {} not found for {}", folder_name_owned, account_owned.email_address);
                session.logout().map_err(|e| e.to_string())?;
                return Ok(Vec::new());
            }
        };
        
        let uid_set = session.uid_search("ALL").map_err(|e| e.to_string())?;
        let mut uids_to_fetch: Vec<u32> = uid_set.iter()
            .filter(|&&uid| !existing_ids_set.contains(&uid.to_string()))
            .copied().collect();
            
        uids_to_fetch.sort_by(|a, b| b.cmp(a)); // Newest first

        log::info!("Account {} [{}]: Server UIDs: {}, Local UIDs: {}, To Sync: {}", 
            account_owned.email_address, folder_name_owned, uid_set.len(), existing_ids_set.len(), uids_to_fetch.len());
            
        let batch_size = 25; // Smaller batch search
        let mut collected_emails = Vec::new();
        
        for (i, chunk) in uids_to_fetch.chunks(batch_size).enumerate() {
            let range = chunk.iter().map(|u| u.to_string()).collect::<Vec<_>>().join(",");
            log::info!("Fetching batch {} (UIDs: {}) for {}", i + 1, range, account_owned.email_address);
            
            let msgs = match session.uid_fetch(&range, "(UID BODY.PEEK[])") {
                Ok(m) => m,
                Err(e) => {
                    log::error!("Batch fetch failed for range {}: {}. Attempting one-by-one...", range, e);
                    // Fallback to one-by-one in this chunk to skip the "bad" message
                    for &uid in chunk {
                        match session.uid_fetch(uid.to_string(), "(UID BODY.PEEK[])") {
                            Ok(inner_msgs) => {
                                for m in inner_msgs.iter() {
                                    if let Some(data) = process_single_message(m, &account_owned, folder_id) {
                                        collected_emails.push(data);
                                    }
                                }
                            },
                            Err(inner_e) => log::warn!("Failed to fetch individual UID {}: {}", uid, inner_e),
                        }
                    }
                    continue;
                }
            };

            for message in msgs.iter() {
                if let Some(data) = process_single_message(message, &account_owned, folder_id) {
                    collected_emails.push(data);
                }
            }
        }
        
        session.logout().map_err(|e| e.to_string())?;
        Ok(collected_emails)
    }).await.map_err(|e| Box::new(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())) as Box<dyn std::error::Error + Send + Sync>)?;
    let email_data = email_data_res?;

    log::info!("Fetched {} emails for {}, saving to database...", email_data.len(), account.email_address);
    let mut saved_emails = Vec::new();

    for (email_msg, email_body) in email_data {
        match db::upsert_email(pg_pool, &email_msg).await {
            Ok(persisted_id) => {
                let _ = db::upsert_body(pg_pool, &email_body).await;
                let mut saved = email_msg.clone();
                saved.id = persisted_id; // CRITICAL: Use the ID from the database
                saved_emails.push(saved);
            },
            Err(e) => log::error!("Failed to save email {}: {:?}", email_msg.remote_id, e),
        }
    }
    
    // Handle Notifications for NEW emails in INBOX
    if folder_name == "INBOX" && !saved_emails.is_empty() {
        let now = Utc::now();
        log::info!("Checking notifications for {} new emails in INBOX for {}", saved_emails.len(), account.email_address);
        
        for email in saved_emails {
            let age = (now - email.received_at).num_seconds();
            
            // Only consider emails received in the last 12 hours
            if age < 43200 { 
                // Check if already notified (in case of race conditions or re-syncs)
                let already_notified: bool = sqlx::query_scalar("SELECT is_notified FROM email_messages WHERE id = $1")
                    .bind(email.id)
                    .fetch_optional(pg_pool)
                    .await?
                    .unwrap_or(false);

                if !already_notified {
                     log::info!("Sending Telegram notification for new email: {}", email.subject.as_deref().unwrap_or(""));
                     if let Err(e) = send_telegram_notification(account, &email, pg_pool).await {
                         log::error!("Failed to send Telegram notification for {}: {:?}", email.id, e);
                     } else {
                         let _ = db::mark_email_notified(pg_pool, email.id).await;
                     }
                }
            } else {
                // For old emails, just mark as notified in bulk if possible, or skip
                // Actually, they are already saved with is_notified=false, but we don't want to check them again.
                // We'll mark them as notified so future syncs skip them too.
                let _ = db::mark_email_notified(pg_pool, email.id).await;
            }
        }
    }

    Ok(())
}

fn process_single_message(message: &imap::types::Fetch, account_owned: &MailAccount, folder_id: Uuid) -> Option<(Email, EmailBody)> {
    let uid = message.uid.unwrap_or(0);
    let body_bytes = message.body().unwrap_or_default();
    
    if let Some(parsed) = Message::parse(body_bytes) {
        let (from_address, from_name) = match parsed.from() {
            HeaderValue::Address(addr) => (
                addr.address.as_deref().unwrap_or_default().to_string(),
                addr.name.as_deref().map(|s| s.to_string())
            ),
            HeaderValue::AddressList(list) => (
                list.first().and_then(|a| a.address.as_deref()).unwrap_or_default().to_string(),
                list.first().and_then(|a| a.name.as_deref()).map(|s| s.to_string())
            ),
            _ => (String::new(), None)
        };

        let to_address = match parsed.to() {
            HeaderValue::Address(addr) => addr.address.as_deref().map(|s| s.to_string()),
            HeaderValue::AddressList(list) => list.first().and_then(|a| a.address.as_deref()).map(|s| s.to_string()),
            _ => None
        };

        let email_id = Uuid::new_v4();
        let received_at_ts = parsed.date().map(|d| DateTime::from_timestamp(d.to_timestamp(), 0).unwrap_or_else(|| Utc::now())).unwrap_or_else(|| Utc::now());

        let email_msg = Email {
            id: email_id,
            account_id: account_owned.id,
            folder_id,
            message_id: parsed.message_id().map(|s| s.to_string()),
            remote_id: uid.to_string(),
            subject: parsed.subject().map(|s| s.to_string()),
            from_name,
            from_address: from_address.clone(),
            to_address,
            cc_address: None,
            received_at: received_at_ts,
            snippet: parsed.body_text(0).map(|s| s.chars().take(150).collect()),
            is_read: false,
            is_notified: false,
            has_attachments: parsed.attachments().count() > 0,
            size: Some(body_bytes.len() as i32),
        };

        let body_plain = parsed.body_text(0).map(|s| s.to_string());
        let body_html = parsed.body_html(0).map(|s| s.to_string());
        
        let email_body = EmailBody {
            email_id,
            body_plain,
            body_html,
        };

        Some((email_msg, email_body))
    } else {
        log::warn!("Failed to parse message UID {} for {}", uid, account_owned.email_address);
        None
    }
}

async fn get_or_create_folder(pg_pool: &PgPool, account_id: Uuid, folder_name: &str) -> Result<Uuid, sqlx::Error> {
    let existing_id = sqlx::query_scalar::<_, Uuid>("SELECT id FROM mail_folders WHERE account_id = $1 AND remote_name = $2")
        .bind(account_id)
        .bind(folder_name)
        .fetch_optional(pg_pool)
        .await?;

    if let Some(id) = existing_id {
        Ok(id)
    } else {
        let fid = Uuid::new_v4();
        let folder = MailFolder {
            id: fid,
            account_id,
            name: folder_name.to_string(),
            remote_name: folder_name.to_string(),
            delimiter: "/".to_string(),
            last_uid_validity: None,
            unread_count: 0
        };
        db::upsert_folder(pg_pool, &folder).await?;
        Ok(fid)
    }
}

async fn send_telegram_notification(account: &MailAccount, email: &Email, pg_pool: &PgPool) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let bot_token: Option<String> = sqlx::query_scalar::<_, Option<String>>("SELECT telegram_bot_token FROM bot_settings WHERE is_active = true LIMIT 1")
        .fetch_optional(pg_pool)
        .await?
        .flatten();

    if bot_token.is_none() {
        return Ok(());
    }
    let bot_token = bot_token.unwrap();

    let owner_id = account.created_by;
    let account_id = account.id;

    let chat_ids: Vec<String> = sqlx::query_scalar(
        r#"
        SELECT DISTINCT telegram_chat_id 
        FROM admin_users 
        WHERE telegram_chat_id IS NOT NULL 
          AND (
            ($1::uuid IS NOT NULL AND id = $1)
            OR 
            id IN (SELECT user_id FROM mail_account_access WHERE account_id = $2)
          )
        "#
    )
    .bind(owner_id)
    .bind(account_id)
    .fetch_all(pg_pool)
    .await?;

    if chat_ids.is_empty() {
        return Ok(());
    }

    // Fetch Email Body from Postgres
    let body_plain: Option<String> = sqlx::query_scalar("SELECT body_plain FROM email_bodies WHERE email_id = $1")
        .bind(email.id)
        .fetch_optional(pg_pool)
        .await?;

    let body_content = body_plain.as_deref().unwrap_or(email.snippet.as_deref().unwrap_or(""));
    let mut body_preview: String = body_content.chars().take(800).collect();
    if body_content.len() > 800 {
        body_preview.push_str("...");
    }
    let body_preview = body_preview.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");

    for chat_id in chat_ids {
        let subject = email.subject.as_deref().unwrap_or("(Без темы)");
        let from = &email.from_address;
        
        let text = format!("📧 <b>Новое письмо</b>\n\nОт: {}\nТема: <b>{}</b>\n\n{}\n\n<i>Зайдите в панель, чтобы прочитать.</i>", from, subject, body_preview);
        
        let client = reqwest::Client::new();
        let _ = client.post(format!("https://api.telegram.org/bot{}/sendMessage", bot_token))
            .json(&serde_json::json!({
                "chat_id": chat_id,
                "text": text,
                "parse_mode": "HTML"
            }))
            .send()
            .await?;
    }
    
    Ok(())
}
