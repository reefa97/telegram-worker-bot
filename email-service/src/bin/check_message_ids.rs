use sqlx::PgPool;
use dotenv::dotenv;
use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv().ok();
    let database_url = env::var("DATABASE_URL")?;
    let pool = PgPool::connect(&database_url).await?;
    
    println!("--- MESSAGE ID DUPLICATES FOR kontakt@reefa.pl ---");
    let acc_id: (uuid::Uuid,) = sqlx::query_as("SELECT id FROM mail_accounts WHERE email_address = 'kontakt@reefa.pl'")
        .fetch_one(&pool).await?;
        
    let rows = sqlx::query(
        "SELECT message_id, COUNT(*), MIN(received_at), MAX(subject)
         FROM email_messages 
         WHERE account_id = $1 AND message_id IS NOT NULL
         GROUP BY message_id
         HAVING COUNT(*) > 1"
    )
    .bind(acc_id.0)
    .fetch_all(&pool).await?;

    if rows.is_empty() {
        println!("No duplicate Message-IDs found.");
    } else {
        for row in rows {
            let mid: String = sqlx::Row::get(&row, 0);
            let count: i64 = sqlx::Row::get(&row, 1);
            let received: chrono::DateTime<chrono::Utc> = sqlx::Row::get(&row, 2);
            let sub: Option<String> = sqlx::Row::get(&row, 3);
            println!("Count: {}, MsgID: {}, Received: {}, Subject: {:?}", count, mid, received, sub);
        }
    }

    Ok(())
}
