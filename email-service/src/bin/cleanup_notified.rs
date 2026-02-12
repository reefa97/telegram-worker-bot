use sqlx::PgPool;
use dotenv::dotenv;
use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv().ok();
    let database_url = env::var("DATABASE_URL")?;
    let pool = PgPool::connect(&database_url).await?;
    
    println!("Marking all emails as notified to stop duplication spam...");
    let res = sqlx::query("UPDATE email_messages SET is_notified = true WHERE is_notified = false")
        .execute(&pool).await?;
        
    println!("Updated {} rows.", res.rows_affected());
    Ok(())
}
