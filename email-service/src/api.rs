use actix_web::{web, HttpResponse, Responder};
use crate::{AppState, models::{self, MailAccount, CreateAccountRequest, TestConnectionRequest}};
use uuid::Uuid;
use sqlx::Row;

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::resource("/accounts")
            .route(web::get().to(get_accounts))
            .route(web::post().to(add_account))
    );
    cfg.service(
        web::resource("/accounts/{id}")
            .route(web::delete().to(delete_account))
            .route(web::patch().to(toggle_account_shared))
    );
    cfg.service(
        web::resource("/accounts/{id}/access")
            .route(web::get().to(list_access))
            .route(web::post().to(grant_access))
    );
    cfg.service(
        web::resource("/accounts/{id}/access/{user_id}")
            .route(web::delete().to(revoke_access))
    );
    cfg.service(
        web::resource("/list/{folder}")
            .route(web::get().to(list_emails))
    );
    cfg.service(
        web::resource("/message/{id}")
            .route(web::get().to(get_message))
            .route(web::delete().to(delete_message))
    );
    cfg.service(
        web::resource("/sync")
            .route(web::post().to(trigger_sync))
    );
    cfg.service(
        web::resource("/test-connection")
            .route(web::post().to(test_connection))
    );
    cfg.service(
        web::resource("/drafts")
            .route(web::post().to(upsert_draft))
    );
    cfg.service(
        web::resource("/templates")
            .route(web::get().to(list_templates))
    );
    cfg.service(
        web::resource("/schedule")
            .route(web::post().to(schedule_email))
    );
    cfg.service(
        web::resource("/send")
            .route(web::post().to(send_email))
    );
}

async fn toggle_account_shared(data: web::Data<AppState>, path: web::Path<Uuid>, req_http: actix_web::HttpRequest) -> impl Responder {
    let user_role = req_http.headers().get("X-User-Role")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("sub_admin");

    if user_role != "super_admin" {
        return HttpResponse::Forbidden().json(serde_json::json!({"error": "Only super-admins can toggle visibility"}));
    }

    let id = path.into_inner();
    // Toggle the is_shared boolean
    let result = sqlx::query("UPDATE mail_accounts SET is_shared = NOT is_shared WHERE id = $1")
        .bind(id)
        .execute(&data.pg_pool)
        .await;

    match result {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({"status": "success"})),
        Err(e) => {
            log::error!("Failed to toggle sharing for account {}: {:?}", id, e);
            HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
        }
    }
}

async fn upsert_draft(data: web::Data<AppState>, req: web::Json<models::UpsertDraftRequest>) -> impl Responder {
    log::info!("Upserting draft: {:?}", req);
    let id = req.id.unwrap_or_else(Uuid::new_v4);
    let to_json = serde_json::to_value(&req.to_addresses.clone().unwrap_or_default()).unwrap_or(serde_json::json!([]));
    let bcc_json = serde_json::to_value(&req.bcc_addresses.clone().unwrap_or_default()).unwrap_or(serde_json::json!([]));

    let res = sqlx::query(
        r#"
        INSERT INTO mail_scheduled (id, account_id, to_addresses, bcc_addresses, subject, body_html, status, scheduled_at)
        VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT', NOW())
        ON CONFLICT (id) DO UPDATE SET
            account_id = EXCLUDED.account_id,
            to_addresses = EXCLUDED.to_addresses,
            bcc_addresses = EXCLUDED.bcc_addresses,
            subject = EXCLUDED.subject,
            body_html = EXCLUDED.body_html,
            created_at = NOW()
        "#
    )
    .bind(id)
    .bind(req.account_id)
    .bind(to_json)
    .bind(bcc_json)
    .bind(&req.subject)
    .bind(&req.body_html)
    .execute(&data.pg_pool)
    .await;

    match res {
        Ok(_) => {
            log::info!("Draft {} saved successfully", id);
            HttpResponse::Ok().json(serde_json::json!({"id": id}))
        },
        Err(e) => {
            log::error!("Failed to save draft {}: {:?}", id, e);
            HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
        }
    }
}

async fn list_templates(data: web::Data<AppState>) -> impl Responder {
     let templates = sqlx::query_as::<_, models::MailTemplate>("SELECT * FROM mail_templates")
        .fetch_all(&data.pg_pool)
        .await;
    match templates {
        Ok(t) => HttpResponse::Ok().json(t),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
    }
}

async fn schedule_email(data: web::Data<AppState>, req: web::Json<models::ScheduleEmailRequest>) -> impl Responder {
    let to_json = serde_json::to_value(&req.to_addresses).unwrap_or(serde_json::json!([]));
    let bcc_json = serde_json::to_value(&req.bcc_addresses.clone().unwrap_or_default()).unwrap_or(serde_json::json!([]));

    let res = sqlx::query(
        r#"
        INSERT INTO mail_scheduled (account_id, to_addresses, bcc_addresses, subject, body_html, in_reply_to, "references", scheduled_at, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING')
        "#
    )
    .bind(req.account_id)
    .bind(to_json)
    .bind(bcc_json)
    .bind(&req.subject)
    .bind(&req.body_html)
    .bind(&req.in_reply_to)
    .bind(&req.references)
    .bind(req.scheduled_at)
    .execute(&data.pg_pool)
    .await;

    match res {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({"status": "scheduled"})),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
    }
}

async fn send_email(data: web::Data<AppState>, req: web::Json<models::SendEmailRequest>) -> impl Responder {
    let to_json = serde_json::to_value(&req.to_addresses).unwrap_or(serde_json::json!([]));
    let bcc_json = serde_json::to_value(&req.bcc_addresses.clone().unwrap_or_default()).unwrap_or(serde_json::json!([]));

    let res = sqlx::query(
        r#"
        INSERT INTO mail_scheduled (account_id, to_addresses, bcc_addresses, subject, body_html, in_reply_to, "references", scheduled_at, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 'PENDING')
        "#
    )
    .bind(req.account_id)
    .bind(to_json)
    .bind(bcc_json)
    .bind(&req.subject)
    .bind(&req.body_html)
    .bind(&req.in_reply_to)
    .bind(&req.references)
    .execute(&data.pg_pool)
    .await;

    match res {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({"status": "sending"})),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
    }
}

async fn get_accounts(data: web::Data<AppState>, req_http: actix_web::HttpRequest) -> impl Responder {
    let user_id = req_http.headers().get("X-User-Id")
        .and_then(|h| h.to_str().ok())
        .and_then(|s| Uuid::parse_str(s).ok());
    let user_role = req_http.headers().get("X-User-Role")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("sub_admin");

    if user_role == "super_admin" {
        let accs = sqlx::query_as::<_, MailAccount>("SELECT * FROM mail_accounts WHERE is_active = true")
            .fetch_all(&data.pg_pool)
            .await;
        match accs {
            Ok(a) => HttpResponse::Ok().json(a),
            Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
        }
    } else if let Some(uid) = user_id {
        let accs = sqlx::query_as::<_, MailAccount>(
            r#"
            SELECT DISTINCT ma.* 
            FROM mail_accounts ma
            LEFT JOIN mail_account_access maa ON ma.id = maa.account_id
            WHERE ma.is_active = true 
              AND (ma.created_by = $1 OR maa.user_id = $1)
            "#
        )
        .bind(uid)
        .fetch_all(&data.pg_pool)
        .await;
        match accs {
            Ok(a) => HttpResponse::Ok().json(a),
            Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
        }
    } else {
        HttpResponse::Unauthorized().json(serde_json::json!({"error": "Missing user identification"}))
    }
}

async fn delete_account(data: web::Data<AppState>, path: web::Path<Uuid>) -> impl Responder {
    let id = path.into_inner();
    log::info!("Soft deleting account {}", id);
    let result = sqlx::query("UPDATE mail_accounts SET is_active = false WHERE id = $1")
        .bind(id)
        .execute(&data.pg_pool)
        .await;

    match result {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({"status": "success"})),
        Err(e) => {
            log::error!("Failed to delete account {}: {:?}", id, e);
            HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
        }
    }
}

async fn add_account(data: web::Data<AppState>, req: web::Json<CreateAccountRequest>, req_http: actix_web::HttpRequest) -> impl Responder {
    let user_id = req_http.headers().get("X-User-Id")
        .and_then(|h| h.to_str().ok())
        .and_then(|s| Uuid::parse_str(s).ok());

    let id = Uuid::new_v4();
    log::info!("Adding/Updating account for {}", req.email_address);
    let result = sqlx::query(
        r#"
        INSERT INTO mail_accounts (
            id, email_address, imap_user, imap_password_encrypted, imap_host, imap_port, 
            smtp_user, smtp_password_encrypted, smtp_host, smtp_port, is_active, created_by,
            signature_text, signature_image_url, signature_image_link
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11, $12, $13, $14)
        ON CONFLICT (email_address) DO UPDATE SET
            imap_password_encrypted = EXCLUDED.imap_password_encrypted,
            imap_host = EXCLUDED.imap_host,
            imap_port = EXCLUDED.imap_port,
            smtp_password_encrypted = EXCLUDED.smtp_password_encrypted,
            smtp_host = EXCLUDED.smtp_host,
            smtp_port = EXCLUDED.smtp_port,
            is_active = true,
            created_by = COALESCE(mail_accounts.created_by, EXCLUDED.created_by),
            signature_text = EXCLUDED.signature_text,
            signature_image_url = EXCLUDED.signature_image_url,
            signature_image_link = EXCLUDED.signature_image_link
        "#
    )
    .bind(id)
    .bind(&req.email_address)
    .bind(&req.email_address) // imap_user
    .bind(&req.password)
    .bind(&req.imap_host)
    .bind(req.imap_port as i32)
    .bind(&req.email_address) // smtp_user
    .bind(&req.password)
    .bind(&req.smtp_host)
    .bind(req.smtp_port as i32)
    .bind(user_id)
    .bind(&req.signature_text)
    .bind(&req.signature_image_url)
    .bind(&req.signature_image_link)
    .execute(&data.pg_pool)
    .await;

    match result {
        Ok(_) => {
            log::info!("Successfully added/reactivated account {}", req.email_address);
            HttpResponse::Ok().json(serde_json::json!({"status": "success"}))
        },
        Err(e) => {
            log::error!("Failed to add account to Postgres: {:?}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({"error": format!("Database error: {}", e)}))
        }
    }
}

async fn list_emails(
    data: web::Data<AppState>, 
    path: web::Path<String>, 
    query: web::Query<std::collections::HashMap<String, String>>, 
    req_http: actix_web::HttpRequest
) -> impl Responder {
    let folder_filter = path.into_inner().to_lowercase();
    let account_id_filter = query.get("account_id");
    
    // 1. Get active account IDs from Postgres based on user access
    let user_id = req_http.headers().get("X-User-Id")
        .and_then(|h| h.to_str().ok())
        .and_then(|s| Uuid::parse_str(s).ok());
    let user_role = req_http.headers().get("X-User-Role")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("sub_admin");

    let mut active_ids: Vec<String> = Vec::new();

    if user_role == "super_admin" {
        if let Some(aid) = account_id_filter {
            if let Ok(id) = Uuid::parse_str(aid) {
                let row = sqlx::query("SELECT id FROM mail_accounts WHERE is_active = true AND id = $1")
                    .bind(id)
                    .fetch_optional(&data.pg_pool).await;
                if let Ok(Some(r)) = row {
                    let id_val: Uuid = r.get("id");
                    active_ids.push(id_val.to_string());
                }
            }
        } else {
            let rows = sqlx::query("SELECT id FROM mail_accounts WHERE is_active = true")
                .fetch_all(&data.pg_pool).await;
            if let Ok(rs) = rows {
                for r in rs {
                    let id_val: Uuid = r.get("id");
                    active_ids.push(id_val.to_string());
                }
            }
        }
    } else if let Some(uid) = user_id {
        if let Some(aid) = account_id_filter {
            if let Ok(id) = Uuid::parse_str(aid) {
                let row = sqlx::query(
                    r#"
                    SELECT DISTINCT ma.id 
                    FROM mail_accounts ma
                    LEFT JOIN mail_account_access maa ON ma.id = maa.account_id
                    WHERE ma.is_active = true AND ma.id = $1 
                      AND (ma.created_by = $2 OR maa.user_id = $2)
                    "#
                )
                    .bind(id).bind(uid)
                    .fetch_optional(&data.pg_pool).await;
                if let Ok(Some(r)) = row {
                    let id_val: Uuid = r.get("id");
                    active_ids.push(id_val.to_string());
                }
            }
        } else {
            let rows = sqlx::query(
                r#"
                SELECT DISTINCT ma.id 
                FROM mail_accounts ma
                LEFT JOIN mail_account_access maa ON ma.id = maa.account_id
                WHERE ma.is_active = true 
                  AND (ma.created_by = $1 OR maa.user_id = $1)
                "#
            )
                .bind(uid)
                .fetch_all(&data.pg_pool).await;
            if let Ok(rs) = rows {
                for r in rs {
                    let id_val: Uuid = r.get("id");
                    active_ids.push(id_val.to_string());
                }
            }
        }
    } else {
        return HttpResponse::Unauthorized().json(serde_json::json!({"error": "Missing user identification"}));
    };

    if active_ids.is_empty() {
        return HttpResponse::Ok().json(Vec::<models::Email>::new());
    }

    // 2. Specialized handling for Drafts and Scheduled (Postgres)
    if folder_filter == "drafts" || folder_filter == "scheduled" {
        let status_filter = if folder_filter == "drafts" { "DRAFT" } else { "PENDING" };
        let placeholders = active_ids.iter().enumerate().map(|(i, _)| format!("${}", i+2)).collect::<Vec<_>>().join(",");
        let pg_query_str = format!("SELECT * FROM mail_scheduled WHERE status = $1 AND account_id IN ({}) ORDER BY created_at DESC", placeholders);
        
        let mut pg_query = sqlx::query_as::<_, models::MailScheduled>(&pg_query_str)
            .bind(status_filter);
            
        for id in &active_ids {
            if let Ok(uid) = Uuid::parse_str(id) {
                pg_query = pg_query.bind(uid);
            }
        }
        
        match pg_query.fetch_all(&data.pg_pool).await {
            Ok(s_emails) => {
                let unified: Vec<serde_json::Value> = s_emails.into_iter().map(|s| {
                    let to_arr = s.to_addresses.as_array()
                        .map(|a| a.iter().map(|v| v.as_str().unwrap_or("")).collect::<Vec<_>>().join(", "))
                        .unwrap_or_default();
                    
                    serde_json::json!({
                        "id": s.id.to_string(),
                        "account_id": s.account_id,
                        "folder_id": folder_filter,
                        "subject": s.subject,
                        "from_name": if folder_filter == "drafts" { "Черновик" } else { "Запланировано" },
                        "from_address": "",
                        "to_address": to_arr,
                        "date_received": s.created_at.map(|dt| dt.timestamp()),
                        "snippet": s.body_html.as_ref().map(|b| {
                            let plain = b.replace(|c: char| c == '<' || c == '>', " "); 
                            if plain.len() > 100 { plain[..100].to_string() } else { plain }
                        }),
                        "is_read": true,
                        "has_attachments": false,
                        "body_html": s.body_html,
                        "bcc_addresses": s.bcc_addresses,
                        "in_reply_to": s.in_reply_to,
                        "references": s.references
                    })
                }).collect();
                return HttpResponse::Ok().json(unified);
            },
            Err(e) => return HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
        }
    }

    // 3. Query Postgres for emails
    let imap_folder = match folder_filter.as_str() {
        "sent" => "SENT",
        "trash" => "TRASH",
        "spam" => "SPAM",
        _ => "INBOX"
    };

    let placeholders = active_ids.iter().enumerate().map(|(i, _)| format!("${}", i+2)).collect::<Vec<_>>().join(",");
    let query_str = format!(
        r#"
        SELECT e.* FROM email_messages e
        JOIN mail_folders f ON e.folder_id = f.id
        WHERE e.account_id IN ({}) 
          AND f.remote_name = $1
        ORDER BY e.received_at DESC LIMIT 50
        "#, 
        placeholders
    );
    
    let mut query = sqlx::query_as::<_, models::Email>(&query_str)
        .bind(imap_folder);

    for id in &active_ids {
        if let Ok(uid) = Uuid::parse_str(id) {
            query = query.bind(uid);
        }
    }

    let sql_results = match query.fetch_all(&data.pg_pool).await {
        Ok(msgs) => msgs,
        Err(e) => {
            log::error!("Failed to list emails from Postgres: {:?}", e);
            Vec::new()
        }
    };


    // 4. Special for Trash: Combine regular trash emails + Postgres trashed drafts
    if folder_filter == "trash" {
        let placeholders = active_ids.iter().enumerate().map(|(i, _)| format!("${}", i+2)).collect::<Vec<_>>().join(",");
        let pg_query_str = format!("SELECT * FROM mail_scheduled WHERE status = 'TRASH' AND account_id IN ({}) ORDER BY created_at DESC", placeholders);
        
        let mut pg_query = sqlx::query_as::<_, models::MailScheduled>(&pg_query_str)
            .bind("TRASH");
            
        for id in &active_ids {
            if let Ok(uid) = Uuid::parse_str(id) {
                pg_query = pg_query.bind(uid);
            }
        }
        
        if let Ok(s_emails) = pg_query.fetch_all(&data.pg_pool).await {
            let mut unified: Vec<serde_json::Value> = sql_results.into_iter()
                .map(|e| serde_json::to_value(e).unwrap())
                .collect();
            
            for s in s_emails {
                let to_arr = s.to_addresses.as_array()
                    .map(|a| a.iter().map(|v| v.as_str().unwrap_or("")).collect::<Vec<_>>().join(", "))
                    .unwrap_or_default();
                
                unified.push(serde_json::json!({
                    "id": s.id.to_string(),
                    "account_id": s.account_id,
                    "folder_id": "trash",
                    "subject": s.subject,
                    "from_name": "Черновик (Удален)",
                    "from_address": "",
                    "to_address": to_arr,
                    "date_received": s.created_at.map(|dt| dt.timestamp()),
                    "snippet": s.body_html.as_ref().map(|b| {
                        let plain = b.replace(|c: char| c == '<' || c == '>', " "); 
                        if plain.len() > 100 { plain[..100].to_string() } else { plain }
                    }),
                    "is_read": true,
                    "has_attachments": false,
                    "body_html": s.body_html,
                    "bcc_addresses": s.bcc_addresses,
                    "in_reply_to": s.in_reply_to,
                    "references": s.references
                }));
            }
            return HttpResponse::Ok().json(unified);
        }
    }

    HttpResponse::Ok().json(sql_results)
}

async fn delete_message(
    data: web::Data<AppState>,
    path: web::Path<String>,
    query: web::Query<std::collections::HashMap<String, String>>,
    req_http: actix_web::HttpRequest
) -> impl Responder {
    let message_id = path.into_inner();
    let folder = query.get("folder").map(|s| s.to_lowercase()).unwrap_or_else(|| "inbox".to_string());
    let account_id_str = query.get("account_id");

    // 1. Authorization
    let user_id = req_http.headers().get("X-User-Id")
        .and_then(|h| h.to_str().ok())
        .and_then(|s| Uuid::parse_str(s).ok());
    let user_role = req_http.headers().get("X-User-Role")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("sub_admin");

    if user_id.is_none() {
        return HttpResponse::Unauthorized().json(serde_json::json!({"error": "Missing user identification"}));
    }

    if let Some(aid_str) = account_id_str {
        if let Ok(aid) = Uuid::parse_str(aid_str) {
            if user_role != "super_admin" {
                let access = sqlx::query("SELECT 1 FROM mail_accounts ma LEFT JOIN mail_account_access maa ON ma.id = maa.account_id WHERE ma.id = $1 AND (ma.created_by = $2 OR maa.user_id = $2)")
                    .bind(aid)
                    .bind(user_id.unwrap())
                    .fetch_optional(&data.pg_pool).await;
                
                if let Ok(None) = access {
                    return HttpResponse::Forbidden().json(serde_json::json!({"error": "No access to this account"}));
                }
            }
        }
    }

    // 2. Logic: Move to Trash vs Permanent Delete
    if let Ok(mid_uuid) = Uuid::parse_str(&message_id) {
        if folder == "trash" {
            // PERMANENT DELETE
            // Check scheduled/drafts first
            let res = sqlx::query("DELETE FROM mail_scheduled WHERE id = $1")
                .bind(mid_uuid)
                .execute(&data.pg_pool).await;
            
            if let Ok(r) = res {
                if r.rows_affected() > 0 {
                    return HttpResponse::Ok().json(serde_json::json!({"status": "success"}));
                }
            }
            
            // Check regular messages
            let _ = sqlx::query("DELETE FROM email_bodies WHERE email_id = $1").bind(mid_uuid).execute(&data.pg_pool).await;
            let res = sqlx::query("DELETE FROM email_messages WHERE id = $1").bind(mid_uuid).execute(&data.pg_pool).await;
            
            match res {
                Ok(_) => HttpResponse::Ok().json(serde_json::json!({"status": "success"})),
                Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
            }
        } else {
            // MOVE TO TRASH
            if folder == "drafts" || folder == "scheduled" {
                let res = sqlx::query("UPDATE mail_scheduled SET status = 'TRASH' WHERE id = $1")
                    .bind(mid_uuid)
                    .execute(&data.pg_pool).await;
                match res {
                    Ok(_) => HttpResponse::Ok().json(serde_json::json!({"status": "success"})),
                    Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
                }
            } else {
                // Find Trash folder for this account
                if let Some(aid_str) = account_id_str {
                    if let Ok(aid) = Uuid::parse_str(aid_str) {
                        let folder_res = sqlx::query("SELECT id FROM mail_folders WHERE account_id = $1 AND remote_name = 'TRASH' LIMIT 1")
                            .bind(aid)
                            .fetch_optional(&data.pg_pool).await;
                        
                        if let Ok(Some(row)) = folder_res {
                            let trash_fodler_id: Uuid = row.get(0);
                            let res = sqlx::query("UPDATE email_messages SET folder_id = $1 WHERE id = $2")
                                .bind(trash_fodler_id)
                                .bind(mid_uuid)
                                .execute(&data.pg_pool).await;
                            match res {
                                Ok(_) => HttpResponse::Ok().json(serde_json::json!({"status": "success"})),
                                Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
                            }
                        } else {
                            HttpResponse::InternalServerError().json(serde_json::json!({"error": "Trash folder not found"}))
                        }
                    } else {
                        HttpResponse::BadRequest().json(serde_json::json!({"error": "Invalid account_id"}))
                    }
                } else {
                    HttpResponse::BadRequest().json(serde_json::json!({"error": "account_id required"}))
                }
            }
        }
    } else {
        HttpResponse::BadRequest().json(serde_json::json!({"error": "Invalid message UUID"}))
    }
}


#[derive(Debug, serde::Serialize)]
struct FullEmailResponse {
    email: models::Email,
    body: Option<models::EmailBody>,
}

async fn get_message(data: web::Data<AppState>, path: web::Path<String>, req_http: actix_web::HttpRequest) -> impl Responder {
    let id_str = path.into_inner();
    
    let id = match Uuid::parse_str(&id_str) {
        Ok(uid) => uid,
        Err(_) => return HttpResponse::BadRequest().json(serde_json::json!({"error": "Invalid UUID"})),
    };
    
    // 1. Get user identification
    let user_id = req_http.headers().get("X-User-Id")
        .and_then(|h| h.to_str().ok())
        .and_then(|s| Uuid::parse_str(s).ok());
    let user_role = req_http.headers().get("X-User-Role")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("sub_admin");

    // 2. Fetch email metadata
    let email_res = sqlx::query_as::<_, models::Email>("SELECT * FROM email_messages WHERE id = $1")
        .bind(id)
        .fetch_optional(&data.pg_pool)
        .await;

    match email_res {
        Ok(Some(email)) => {
            // 3. Verify access if not super_admin
            if user_role != "super_admin" {
                if let Some(uid) = user_id {
                    let has_access = sqlx::query(
                        r#"
                        SELECT 1 FROM mail_accounts ma
                        LEFT JOIN mail_account_access maa ON ma.id = maa.account_id
                        WHERE ma.id = $1 AND (ma.created_by = $2 OR maa.user_id = $2)
                        "#
                    )
                    .bind(email.account_id)
                    .bind(uid)
                    .fetch_optional(&data.pg_pool)
                    .await;

                    if let Ok(None) = has_access {
                        return HttpResponse::Forbidden().json(serde_json::json!({"error": "Access denied"}));
                    }
                } else {
                    return HttpResponse::Unauthorized().json(serde_json::json!({"error": "Missing user identification"}));
                }
            }

            // 4. Fetch body
            let body = sqlx::query_as::<_, models::EmailBody>("SELECT * FROM email_bodies WHERE email_id = $1")
                .bind(id)
                .fetch_optional(&data.pg_pool)
                .await
                .unwrap_or(None);
                
            HttpResponse::Ok().json(FullEmailResponse { email, body })
        },
        Ok(None) => HttpResponse::NotFound().json(serde_json::json!({"error": "Email not found"})),
        Err(e) => {
            log::error!("Failed to get email for {}: {:?}", id, e);
            HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
        }
    }
}


async fn trigger_sync(data: web::Data<AppState>) -> impl Responder {
    log::info!("Triggering manual sync for active accounts");
    let accounts = sqlx::query_as::<_, MailAccount>("SELECT * FROM mail_accounts WHERE is_active = true")
        .fetch_all(&data.pg_pool)
        .await;

    match accounts {
        Ok(accs) => {
            for acc in accs {
                let pg_pool = data.pg_pool.clone();
                tokio::spawn(async move {
                    if let Err(e) = crate::imap_sync::sync_account(&acc, &pg_pool).await {
                        log::error!("Async sync failed for {}: {:?}", acc.email_address, e);
                    }
                });
            }
            HttpResponse::Ok().json(serde_json::json!({"status": "sync_triggered"}))
        },
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
    }
}


async fn test_connection(req: web::Json<TestConnectionRequest>) -> impl Responder {
    let req = req.into_inner();
    let email_for_log = req.email.clone();
    log::info!("Testing IMAP connection for {} at {}:{}", req.email, req.imap_host, req.imap_port);
    
    let result = tokio::task::spawn_blocking(move || -> Result<(), String> {
        let tls = native_tls::TlsConnector::builder()
            .danger_accept_invalid_certs(true) // For debugging/dev
            .build()
            .map_err(|e| format!("TLS Builder Error: {}", e))?;
            
        let client = imap::connect(
            (&req.imap_host as &str, req.imap_port),
            &req.imap_host,
            &tls
        ).map_err(|e| format!("IMAP Connect Error: {}", e))?;

        let mut session = client.login(&req.email, &req.password)
            .map_err(|e| format!("IMAP Login Error ({}): {}", req.email, e.0))?;

        session.logout().map_err(|e| format!("IMAP Logout Error: {}", e))?;
        Ok(())
    }).await;

    match result {
        Ok(Ok(_)) => {
            log::info!("IMAP connection successful for {}", email_for_log);
            HttpResponse::Ok().json(serde_json::json!({"status": "success", "message": "IMAP connection successful"}))
        },
        Ok(Err(e)) => {
            log::error!("IMAP test failed: {}", e);
            HttpResponse::BadRequest().json(serde_json::json!({"status": "error", "message": e}))
        },
        Err(e) => {
            log::error!("Tokio handler failed: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({"status": "error", "message": format!("Internal Server Error: {}", e)}))
        }
    }
}
async fn list_access(data: web::Data<AppState>, path: web::Path<Uuid>) -> impl Responder {
    let account_id = path.into_inner();
    let access = sqlx::query_as::<_, models::AccountAccess>("SELECT * FROM mail_account_access WHERE account_id = $1")
        .bind(account_id)
        .fetch_all(&data.pg_pool)
        .await;

    match access {
        Ok(a) => HttpResponse::Ok().json(a),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
    }
}

async fn grant_access(data: web::Data<AppState>, path: web::Path<Uuid>, req: web::Json<models::GrantAccessRequest>) -> impl Responder {
    let account_id = path.into_inner();
    let result = sqlx::query("INSERT INTO mail_account_access (account_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING")
        .bind(account_id)
        .bind(req.user_id)
        .execute(&data.pg_pool)
        .await;

    match result {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({"status": "success"})),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
    }
}

async fn revoke_access(data: web::Data<AppState>, path: web::Path<(Uuid, Uuid)>) -> impl Responder {
    let (account_id, user_id) = path.into_inner();
    let result = sqlx::query("DELETE FROM mail_account_access WHERE account_id = $1 AND user_id = $2")
        .bind(account_id)
        .bind(user_id)
        .execute(&data.pg_pool)
        .await;

    match result {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({"status": "success"})),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
    }
}
