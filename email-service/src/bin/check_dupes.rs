use sqlx::PgPool;
use dotenv::dotenv;
use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv().ok();
    let database_url = env::var("DATABASE_URL")?;
    let pool = PgPool::connect(&database_url).await?;
    
    println!("--- RECENT NOTIFIED EMAILS FOR kontakt@reefa.pl ---");
    let acc_id: (uuid::Uuid,) = sqlx::query_as("SELECT id FROM mail_accounts WHERE email_address = 'kontakt@reefa.pl'")
        .fetch_one(&pool).await?;
        
    let rows = sqlx::query(
        "SELECT m.remote_id, m.message_id, m.subject, m.is_notified, m.received_at, f.name 
         FROM email_messages m
         JOIN mail_folders f ON m.folder_id = f.id
         WHERE m.account_id = $1 
         ORDER BY m.received_at DESC 
         LIMIT 30"
    )
    .bind(acc_id.0)
    .fetch_all(&pool).await?;

    for row in rows {
        let rid: String = sqlx::Row::get(&row, 0);
        let mid: Option<String> = sqlx::Row::get(&row, 1);
        let sub: Option<String> = sqlx::Row::get(&row, 2);
        let notified: bool = sqlx::Row::get(&row, 3);
        let received: chrono::DateTime<chrono::Utc> = sqlx::Row::get(&row, 4);
        let folder: String = sqlx::Row::get(&row, 5);
        println!("Folder: {:<10} | UID: {:<5} | Notified: {:<5} | Received: {} | Subject: {:?} | MsgID: {:?}", 
            folder, rid, notified, received, sub, mid);
    }

    Ok(())
}
