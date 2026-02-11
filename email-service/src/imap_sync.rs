use sqlx::PgPool;
use native_tls::TlsConnector;
use mail_parser::{Message, HeaderValue};
use crate::models::{MailAccount, Email, EmailBody, MailFolder};
use crate::db;
use uuid::Uuid;
use std::collections::HashSet;
use chrono::{Utc, DateTime};

pub async fn sync_account(account: &MailAccount, pg_pool: &PgPool) -> Result<(), Box<dyn std::error::Error>> {
    let folders_to_sync = vec!["INBOX", "SENT", "TRASH", "DRAFTS", "SPAM", "Spam", "Junk"];
    
    for folder_name in folders_to_sync {
        if let Err(e) = sync_folder(account, pg_pool, folder_name).await {
            log::error!("Failed to sync folder {} for {}: {:?}", folder_name, account.email_address, e);
        }
    }
    Ok(())
}

async fn sync_folder(account: &MailAccount, pg_pool: &PgPool, folder_name: &str) -> Result<(), Box<dyn std::error::Error>> {
    let account_owned = account.clone();
    let pg_pool_owned = pg_pool.clone();
    let folder_name_owned = folder_name.to_string();
    
    let folder_id = get_or_create_folder(pg_pool, account.id, folder_name).await?;
    
    let existing_remote_ids: Vec<String> = sqlx::query_scalar("SELECT remote_id FROM email_messages WHERE folder_id = $1")
        .bind(folder_id)
        .fetch_all(pg_pool)
        .await?;
    let existing_ids_set: HashSet<String> = existing_remote_ids.into_iter().collect();

    // Spawn blocking task for IMAP operations
    let pg_pool_for_fetch = pg_pool_owned.clone();
    let new_emails = tokio::task::spawn_blocking(move || -> Result<Vec<Email>, String> {
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
            
        let batch_size = 50;
        let rt = tokio::runtime::Handle::current();
        let mut collected_emails = Vec::new();
        
        for chunk in uids_to_fetch.chunks(batch_size) {
            let range = chunk.iter().map(|u| u.to_string()).collect::<Vec<_>>().join(",");
            let msgs = session.uid_fetch(&range, "(UID BODY.PEEK[])").map_err(|e| e.to_string())?;

            for message in msgs.iter() {
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
                        has_attachments: parsed.attachments().count() > 0,
                        size: Some(body_bytes.len() as i32),
                    };

                    collected_emails.push(email_msg.clone());

                    let pg_pool_clone = pg_pool_for_fetch.clone();
                    let body_plain = parsed.body_text(0).map(|s| s.to_string());
                    let body_html = parsed.body_html(0).map(|s| s.to_string());
                    
                    let email_body = EmailBody {
                        email_id,
                        body_plain,
                        body_html,
                    };

                    rt.block_on(async move {
                        if let Err(e) = db::upsert_email(&pg_pool_clone, &email_msg).await {
                            log::error!("Failed to save email {}: {:?}", uid, e);
                        } else {
                            let _ = db::upsert_body(&pg_pool_clone, &email_body).await;
                        }
                    });
                }
            }
        }
        
        session.logout().map_err(|e| e.to_string())?;
        Ok(collected_emails)
    }).await.map_err(|e| Box::new(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())) as Box<dyn std::error::Error>)?;

    // Handle Notifications for NEW emails in INBOX
    if let Ok(emails) = new_emails {
        if folder_name == "INBOX" && !emails.is_empty() {
            log::info!("Checking notifications for {} new emails in INBOX", emails.len());
            for email in emails {
                let now = Utc::now();
                let age = (now - email.received_at).num_seconds();
                
                if age < 86400 { 
                     if let Err(e) = send_telegram_notification(account, &email, pg_pool).await {
                         log::error!("Failed to send Telegram notification for {}: {:?}", email.id, e);
                     }
                }
            }
        }
    }

    Ok(())
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

async fn send_telegram_notification(account: &MailAccount, email: &Email, pg_pool: &PgPool) -> Result<(), Box<dyn std::error::Error>> {
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
