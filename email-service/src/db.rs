use sqlx::{PgPool, Result};
use crate::models::{Email, EmailBody, MailFolder};
use uuid::Uuid;

pub async fn upsert_folder(pool: &PgPool, folder: &MailFolder) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO mail_folders (id, account_id, name, remote_name, delimiter, last_uid_validity, unread_count)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT(account_id, remote_name) DO UPDATE SET
            unread_count = excluded.unread_count,
            last_uid_validity = excluded.last_uid_validity,
            name = excluded.name
        "#
    )
    .bind(folder.id)
    .bind(folder.account_id)
    .bind(&folder.name)
    .bind(&folder.remote_name)
    .bind(&folder.delimiter)
    .bind(folder.last_uid_validity)
    .bind(folder.unread_count)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn upsert_email(pool: &PgPool, email: &Email) -> Result<Uuid> {
    let row = sqlx::query(
        r#"
        INSERT INTO email_messages (
            id, account_id, folder_id, remote_id, message_id, subject, from_name, from_address, 
            to_address, cc_address, received_at, snippet, is_read, is_notified, has_attachments, size
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT(folder_id, remote_id) DO UPDATE SET
            is_read = excluded.is_read,
            is_notified = email_messages.is_notified OR excluded.is_notified,
            snippet = COALESCE(excluded.snippet, email_messages.snippet)
        RETURNING id
        "#
    )
    .bind(email.id)
    .bind(email.account_id)
    .bind(email.folder_id)
    .bind(&email.remote_id)
    .bind(&email.message_id)
    .bind(&email.subject)
    .bind(&email.from_name)
    .bind(&email.from_address)
    .bind(&email.to_address)
    .bind(&email.cc_address)
    .bind(email.received_at)
    .bind(&email.snippet)
    .bind(email.is_read)
    .bind(email.is_notified)
    .bind(email.has_attachments)
    .bind(email.size)
    .fetch_one(pool)
    .await?;

    let id: Uuid = sqlx::Row::get(&row, 0);
    log::debug!("Successfully upserted email {} (remote_id: {})", id, email.remote_id);
    Ok(id)
}

pub async fn mark_email_notified(pool: &PgPool, email_id: Uuid) -> Result<()> {
    sqlx::query("UPDATE email_messages SET is_notified = true WHERE id = $1")
        .bind(email_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn upsert_body(pool: &PgPool, body: &EmailBody) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO email_bodies (email_id, body_plain, body_html)
        VALUES ($1, $2, $3)
        ON CONFLICT(email_id) DO UPDATE SET
            body_plain = excluded.body_plain,
            body_html = excluded.body_html
        "#
    )
    .bind(body.email_id)
    .bind(&body.body_plain)
    .bind(&body.body_html)
    .execute(pool)
    .await?;
    Ok(())
}
