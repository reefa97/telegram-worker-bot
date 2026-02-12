use sqlx::PgPool;
use dotenv::dotenv;
use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv().ok();
    let database_url = env::var("DATABASE_URL")?;
    let pool = PgPool::connect(&database_url).await?;
    
    println!("Dropping tables to ensure clean state...");
    sqlx::query("DROP TABLE IF EXISTS email_bodies CASCADE").execute(&pool).await?;
    sqlx::query("DROP TABLE IF EXISTS email_messages CASCADE").execute(&pool).await?;
    sqlx::query("DROP TABLE IF EXISTS mail_folders CASCADE").execute(&pool).await?;

    println!("Creating tables with correct constraints...");
    
    sqlx::query(
        r#"CREATE TABLE mail_folders (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            account_id UUID REFERENCES mail_accounts(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            remote_name TEXT NOT NULL,
            delimiter TEXT,
            last_uid_validity BIGINT,
            unread_count INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(account_id, remote_name)
        )"#
    ).execute(&pool).await?;
    println!(" - Created mail_folders");

    sqlx::query(
        r#"CREATE TABLE email_messages (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            account_id UUID REFERENCES mail_accounts(id) ON DELETE CASCADE,
            folder_id UUID REFERENCES mail_folders(id) ON DELETE CASCADE,
            message_id TEXT,
            remote_id TEXT NOT NULL,
            subject TEXT,
            from_name TEXT,
            from_address TEXT NOT NULL,
            to_address TEXT,
            cc_address TEXT,
            received_at TIMESTAMPTZ,
            snippet TEXT,
            is_read BOOLEAN DEFAULT false,
            has_attachments BOOLEAN DEFAULT false,
            size INTEGER,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(account_id, remote_id)
        )"#
    ).execute(&pool).await?;
    println!(" - Created email_messages");

    sqlx::query(
        r#"CREATE TABLE email_bodies (
            email_id UUID PRIMARY KEY REFERENCES email_messages(id) ON DELETE CASCADE,
            body_plain TEXT,
            body_html TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )"#
    ).execute(&pool).await?;
    println!(" - Created email_bodies");

    println!("Schema recreated successfully.");
    Ok(())
}
