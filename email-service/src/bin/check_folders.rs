use sqlx::PgPool;
use dotenv::dotenv;
use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv().ok();
    let database_url = env::var("DATABASE_URL")?;
    let pool = PgPool::connect(&database_url).await?;
    
    println!("--- FOLDERS FOR kontakt@reefa.pl ---");
    let acc_id: (uuid::Uuid,) = sqlx::query_as("SELECT id FROM mail_accounts WHERE email_address = 'kontakt@reefa.pl'")
        .fetch_one(&pool).await?;
        
    let rows = sqlx::query(
        "SELECT id, remote_name FROM mail_folders WHERE account_id = $1"
    )
    .bind(acc_id.0)
    .fetch_all(&pool).await?;

    for row in rows {
        let fid: uuid::Uuid = sqlx::Row::get(&row, 0);
        let name: String = sqlx::Row::get(&row, 1);
        println!("ID: {}, Name: {}", fid, name);
    }

    Ok(())
}
