use sqlx::PgPool;
use dotenv::dotenv;
use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv().ok();
    let database_url = env::var("DATABASE_URL")?;
    let pool = PgPool::connect(&database_url).await?;
    
    println!("--- ACCOUNTS ---");
    let accounts = sqlx::query(
        "SELECT id, email_address, created_by, is_active FROM mail_accounts"
    ).fetch_all(&pool).await?;

    for row in accounts {
        let id: uuid::Uuid = sqlx::Row::get(&row, 0);
        let email: String = sqlx::Row::get(&row, 1);
        let created_by: Option<uuid::Uuid> = sqlx::Row::get(&row, 2);
        let active: bool = sqlx::Row::get(&row, 3);
        println!("ID: {}, Email: {}, CreatedBy: {:?}, Active: {}", id, email, created_by, active);
    }

    println!("\n--- ACCOUNT ACCESS ---");
    let access = sqlx::query(
        "SELECT account_id, user_id FROM mail_account_access"
    ).fetch_all(&pool).await?;
    for row in access {
        let acc_id: uuid::Uuid = sqlx::Row::get(&row, 0);
        let usr_id: uuid::Uuid = sqlx::Row::get(&row, 1);
        println!("Account: {}, User: {}", acc_id, usr_id);
    }

    println!("\n--- ADMIN USERS & TELEGRAM ---");
    let admins = sqlx::query(
        "SELECT id, email, name, telegram_chat_id FROM admin_users"
    ).fetch_all(&pool).await?;

    for row in admins {
        let id: uuid::Uuid = sqlx::Row::get(&row, 0);
        let email: String = sqlx::Row::get(&row, 1);
        let name: Option<String> = sqlx::Row::get(&row, 2);
        let chat_id: Option<String> = sqlx::Row::get(&row, 3);
        println!("ID: {}, Email: {}, Name: {:?}, ChatID: {:?}", id, email, name, chat_id);
    }

    println!("\n--- STATS ---");
    let email_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM email_messages").fetch_one(&pool).await?;
    println!("Total emails in database: {}", email_count.0);

    let rows = sqlx::query(
        "SELECT a.email_address, COUNT(m.id) 
         FROM email_messages m
         JOIN mail_accounts a ON m.account_id = a.id 
         GROUP BY a.email_address"
    ).fetch_all(&pool).await?;

    for row in rows {
        let email: String = sqlx::Row::get(&row, 0);
        let count: i64 = sqlx::Row::get(&row, 1);
        println!(" - {}: {}", email, count);
    }

    Ok(())
}
