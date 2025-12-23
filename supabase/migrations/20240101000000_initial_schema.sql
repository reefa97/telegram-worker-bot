-- Initial database schema for Telegram Worker Tracking System

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Admin Users Table
CREATE TABLE admin_users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'sub_admin')),
    created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workers Table
CREATE TABLE workers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    telegram_username TEXT,
    telegram_user_id TEXT UNIQUE,
    telegram_chat_id BIGINT,
    phone_number TEXT,
    is_active BOOLEAN DEFAULT true,
    salary_amount NUMERIC(10, 2) DEFAULT 0,
    salary_percentage NUMERIC(5, 2) DEFAULT 0,
    role TEXT,
    created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    invitation_token TEXT UNIQUE,
    selected_object_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cleaning Objects Table
CREATE TABLE cleaning_objects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Worker Objects (Many-to-Many relationship)
CREATE TABLE worker_objects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES cleaning_objects(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(worker_id, object_id)
);

-- Work Sessions Table
CREATE TABLE work_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    object_id UUID REFERENCES cleaning_objects(id) ON DELETE SET NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    start_location JSONB,
    end_location JSONB,
    duration_minutes INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bot Settings Table
CREATE TABLE bot_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    telegram_bot_token TEXT,
    is_active BOOLEAN DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bot Admins Table (for Telegram notifications)
CREATE TABLE bot_admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    telegram_chat_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default bot settings
INSERT INTO bot_settings (telegram_bot_token, is_active) 
VALUES (NULL, false);

-- Add foreign key for selected_object_id after cleaning_objects table is created
ALTER TABLE workers 
ADD CONSTRAINT workers_selected_object_fkey 
FOREIGN KEY (selected_object_id) REFERENCES cleaning_objects(id) ON DELETE SET NULL;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_workers_updated_at 
    BEFORE UPDATE ON workers 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bot_settings_updated_at 
    BEFORE UPDATE ON bot_settings 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
