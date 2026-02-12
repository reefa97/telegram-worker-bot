use actix_web::{web, App, HttpServer, HttpResponse};
use actix_cors::Cors;
use sqlx::postgres::{PgPoolOptions, PgConnectOptions};
use dotenv::dotenv;
use std::env;
use std::str::FromStr;

mod api;
mod db;
mod imap_sync;
mod models;
mod scheduler;

#[derive(Clone)]
pub struct AppState {
    pub pg_pool: sqlx::PgPool,
    pub active_syncs: std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<uuid::Uuid>>>,
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    dotenv().ok();
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("info"));

    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    log::info!("Connecting to Postgres...");
    let pg_options = PgConnectOptions::from_str(&database_url)
        .expect("Failed to parse DATABASE_URL")
        .statement_cache_capacity(0);

    let pg_pool = PgPoolOptions::new()
        .max_connections(5)
        .connect_with(pg_options)
        .await
        .expect("Failed to connect to Postgres");

    // Initialize Postgres schema (Ensuring new tables exist)
    log::info!("Initializing Postgres schema...");
    let schema_commands = vec![
        r#"CREATE TABLE IF NOT EXISTS mail_folders (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            account_id UUID REFERENCES mail_accounts(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            remote_name TEXT NOT NULL,
            delimiter TEXT,
            last_uid_validity BIGINT,
            unread_count INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(account_id, remote_name)
        );"#,
        r#"CREATE TABLE IF NOT EXISTS email_messages (
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
            UNIQUE(folder_id, remote_id)
        );"#,
        r#"CREATE TABLE IF NOT EXISTS email_bodies (
            email_id UUID PRIMARY KEY REFERENCES email_messages(id) ON DELETE CASCADE,
            body_plain TEXT,
            body_html TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );"#,
        r#"CREATE TABLE IF NOT EXISTS mail_account_access (
            account_id UUID REFERENCES mail_accounts(id) ON DELETE CASCADE,
            user_id UUID NOT NULL,
            PRIMARY KEY (account_id, user_id)
        );"#,
        r#"CREATE TABLE IF NOT EXISTS mail_scheduled (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            account_id UUID REFERENCES mail_accounts(id) ON DELETE CASCADE,
            to_addresses JSONB NOT NULL DEFAULT '[]',
            bcc_addresses JSONB DEFAULT '[]',
            subject TEXT,
            body_html TEXT,
            in_reply_to TEXT,
            "references" TEXT,
            scheduled_at TIMESTAMPTZ NOT NULL,
            sent_at TIMESTAMPTZ,
            status TEXT DEFAULT 'PENDING',
            error_log TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );"#,
        "ALTER TABLE mail_scheduled ADD COLUMN IF NOT EXISTS to_addresses JSONB NOT NULL DEFAULT '[]';",
        "ALTER TABLE mail_scheduled ADD COLUMN IF NOT EXISTS bcc_addresses JSONB DEFAULT '[]';",
        "ALTER TABLE mail_scheduled ADD COLUMN IF NOT EXISTS in_reply_to TEXT;",
        "ALTER TABLE mail_scheduled ADD COLUMN IF NOT EXISTS \"references\" TEXT;",
        "ALTER TABLE mail_scheduled ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ DEFAULT NOW();",
        "ALTER TABLE mail_accounts ADD COLUMN IF NOT EXISTS signature_text TEXT;",
        "ALTER TABLE mail_accounts ADD COLUMN IF NOT EXISTS signature_image_url TEXT;",
        "ALTER TABLE mail_accounts ADD COLUMN IF NOT EXISTS signature_image_link TEXT;",
    ];

    for cmd in schema_commands {
        if let Err(e) = sqlx::query(cmd).execute(&pg_pool).await {
            log::error!("Postgres schema command failed: {}. Error: {:?}", cmd, e);
        }
    }

    let state = AppState {
        pg_pool: pg_pool.clone(),
        active_syncs: std::sync::Arc::new(tokio::sync::Mutex::new(std::collections::HashSet::new())),
    };
    
    // Start Background Scheduler (Outbound)
    scheduler::start_scheduler(pg_pool.clone()).await;

    // Start Background Poller (Inbound Sync)
    let poller_pool = pg_pool.clone();
    let poller_state = state.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(60)); // Sync once a minute
        loop {
            interval.tick().await;
            log::info!("Auto-polling: Triggering sync for all accounts...");
            
            let accounts_res = sqlx::query_as::<_, models::MailAccount>("SELECT * FROM mail_accounts WHERE is_active = true")
                .fetch_all(&poller_pool)
                .await;
                
            if let Ok(accounts) = accounts_res {
                for acc in accounts {
                     let p_pg = poller_pool.clone();
                     let p_state = poller_state.clone();
                     tokio::spawn(async move {
                         // Check if already syncing
                         {
                             let mut active = p_state.active_syncs.lock().await;
                             if active.contains(&acc.id) {
                                 log::debug!("Sync already in progress for {}, skipping", acc.email_address);
                                 return;
                             }
                             active.insert(acc.id);
                         }
                         
                         log::info!("Starting background sync for {}", acc.email_address);
                         if let Err(e) = imap_sync::sync_account(&acc, &p_pg).await {
                             log::error!("Auto-sync failed for {}: {:?}", acc.email_address, e);
                         }

                         // Release lock
                         {
                             let mut active = p_state.active_syncs.lock().await;
                             active.remove(&acc.id);
                         }
                     });
                }
            } else {
                log::error!("Auto-polling failed to fetch accounts");
            }
        }
    });

    log::info!("Starting server at http://127.0.0.1:8080");

    HttpServer::new(move || {
        let cors = Cors::permissive(); 

        App::new()
            .wrap(cors)
            .app_data(web::Data::new(state.clone()))
            .service(
                web::scope("/api/mail")
                    .configure(api::config)
            )
            .route("/health", web::get().to(|| async { HttpResponse::Ok().body("OK") }))
    })
    .bind(("0.0.0.0", 8080))?
    .run()
    .await
}

