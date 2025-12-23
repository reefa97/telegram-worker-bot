-- Performance indexes for frequently queried columns

-- Admin Users indexes
CREATE INDEX idx_admin_users_role ON admin_users(role);
CREATE INDEX idx_admin_users_created_by ON admin_users(created_by);
CREATE INDEX idx_admin_users_email ON admin_users(email);

-- Workers indexes
CREATE INDEX idx_workers_created_by ON workers(created_by);
CREATE INDEX idx_workers_telegram_user_id ON workers(telegram_user_id);
CREATE INDEX idx_workers_telegram_chat_id ON workers(telegram_chat_id);
CREATE INDEX idx_workers_invitation_token ON workers(invitation_token);
CREATE INDEX idx_workers_is_active ON workers(is_active);
CREATE INDEX idx_workers_selected_object_id ON workers(selected_object_id);

-- Cleaning Objects indexes
CREATE INDEX idx_cleaning_objects_created_by ON cleaning_objects(created_by);
CREATE INDEX idx_cleaning_objects_is_active ON cleaning_objects(is_active);

-- Worker Objects indexes
CREATE INDEX idx_worker_objects_worker_id ON worker_objects(worker_id);
CREATE INDEX idx_worker_objects_object_id ON worker_objects(object_id);

-- Work Sessions indexes
CREATE INDEX idx_work_sessions_worker_id ON work_sessions(worker_id);
CREATE INDEX idx_work_sessions_object_id ON work_sessions(object_id);
CREATE INDEX idx_work_sessions_start_time ON work_sessions(start_time);
CREATE INDEX idx_work_sessions_end_time ON work_sessions(end_time);
CREATE INDEX idx_work_sessions_created_at ON work_sessions(created_at);

-- Bot Admins indexes
CREATE INDEX idx_bot_admins_telegram_chat_id ON bot_admins(telegram_chat_id);
CREATE INDEX idx_bot_admins_is_active ON bot_admins(is_active);
