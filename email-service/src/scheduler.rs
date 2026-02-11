use sqlx::PgPool;
use tokio::time::{self, Duration};
use crate::models::{MailScheduled, MailAccount};
use lettre::{Transport, SmtpTransport, Message};
use lettre::transport::smtp::authentication::Credentials;
// use chrono::Utc; 
use std::sync::Arc;

pub async fn start_scheduler(pool: PgPool) {
    let pool = Arc::new(pool);
    tokio::spawn(async move {
        log::info!("Scheduler started");
        let mut interval = time::interval(Duration::from_secs(60));

        loop {
            interval.tick().await;
            if let Err(e) = process_queue(&pool).await {
                log::error!("Error in scheduler loop: {:?}", e);
            }
        }
    });
}

async fn process_queue(pool: &PgPool) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // 1. Fetch pending emails due for sending
    let pending_emails = sqlx::query_as::<_, MailScheduled>(
        "SELECT * FROM mail_scheduled WHERE status = 'PENDING' AND scheduled_at <= NOW()"
    )
    .fetch_all(pool)
    .await?;

    if pending_emails.is_empty() {
        return Ok(());
    }

    log::info!("Found {} pending emails to send", pending_emails.len());

    for email_task in pending_emails {
        // Update status to SENDING
        let _ = sqlx::query("UPDATE mail_scheduled SET status = 'SENDING' WHERE id = $1")
            .bind(email_task.id)
            .execute(pool)
            .await;

        // Fetch account credentials
        let account = sqlx::query_as::<_, MailAccount>("SELECT * FROM mail_accounts WHERE id = $1")
            .bind(email_task.account_id)
            .fetch_optional(pool)
            .await?;

        if let Some(acc) = account {
            match send_email(&acc, &email_task).await {
                Ok(_) => {
                    log::info!("Email {} sent successfully", email_task.id);
                    let _ = sqlx::query("UPDATE mail_scheduled SET status = 'SENT', sent_at = NOW() WHERE id = $1")
                        .bind(email_task.id)
                        .execute(pool)
                        .await;
                },
                Err(e) => {
                    log::error!("Failed to send email {}: {:?}", email_task.id, e);
                     let _ = sqlx::query("UPDATE mail_scheduled SET status = 'FAILED', error_log = $2 WHERE id = $1")
                        .bind(email_task.id)
                        .bind(e.to_string())
                        .execute(pool)
                        .await;
                }
            }
        } else {
             log::error!("Account not found for email task {}", email_task.id);
             let _ = sqlx::query("UPDATE mail_scheduled SET status = 'FAILED', error_log = 'Account not found' WHERE id = $1")
                .bind(email_task.id)
                .execute(pool)
                .await;
        }
    }

    Ok(())
}

async fn send_email(account: &MailAccount, task: &MailScheduled) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let creds = Credentials::new(account.smtp_user.clone(), account.smtp_password_encrypted.clone());
 
    let mailer = SmtpTransport::relay(&account.smtp_host)?
        .credentials(creds)
        .port(account.smtp_port as u16)
        .build();
 
    let mut builder = Message::builder()
        .from(account.email_address.parse()?);

    // 1. Handle To recipients
    if let Some(to_array) = task.to_addresses.as_array() {
        for addr in to_array {
            if let Some(s) = addr.as_str() {
                builder = builder.to(s.parse()?);
            }
        }
    }

    // 2. Handle Bcc recipients
    if let Some(bcc_val) = &task.bcc_addresses {
        if let Some(bcc_array) = bcc_val.as_array() {
            for addr in bcc_array {
                if let Some(s) = addr.as_str() {
                    builder = builder.bcc(s.parse()?);
                }
            }
        }
    }

    // 3. Handle Subject
    builder = builder.subject(task.subject.as_deref().unwrap_or("(No Subject)"));

    // 4. Handle Reply Headers
    if let Some(in_reply_to) = &task.in_reply_to {
        builder = builder.header(lettre::message::header::InReplyTo::from(in_reply_to.clone()));
    }
    if let Some(references) = &task.references {
        builder = builder.header(lettre::message::header::References::from(references.clone()));
    }

    // 5. Build and send with signature
    let mut body = task.body_html.clone().unwrap_or_default();
    
    if account.signature_text.is_some() || account.signature_image_url.is_some() {
        body.push_str("<br><br>");
        body.push_str("<div class=\"gmail_signature\" dir=\"ltr\" data-smartmail=\"gmail_signature\">");
        
        if let Some(text) = &account.signature_text {
            body.push_str(&format!("<p style=\"color: #666; margin-bottom: 5px;\">{}</p>", text));
        }
        
        if let Some(img_url) = &account.signature_image_url {
            if let Some(link) = &account.signature_image_link {
                body.push_str(&format!(
                    "<a href=\"{}\" target=\"_blank\"><img src=\"{}\" style=\"max-width: 300px; display: block;\" /></a>",
                    link, img_url
                ));
            } else {
                body.push_str(&format!(
                    "<img src=\"{}\" style=\"max-width: 300px; display: block;\" />",
                    img_url
                ));
            }
        }
        
        body.push_str("</div>");
    }

    let email = builder.body(body)?;
 
    mailer.send(&email)?;
 
    Ok(())
}
