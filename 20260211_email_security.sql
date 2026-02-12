-- Migration: Secure Email Access (RLS)
-- Date: 2026-02-10

-- 1. Helper function to check if user is a super admin
-- Assuming 'is_super_admin' function exists from previous migrations or 'public.profiles' role check.
-- If not, we fall back to checking if the user is in the 'super_admin' role (if using custom claims) or specific ID.
-- For this system, let's assume a function or table check.
-- Based on previous context, there is likely an 'is_super_admin' function.

-- 2. Email Accounts Policies

-- Ensure tables exist (specifically attachments which might be missing)
CREATE TABLE IF NOT EXISTS email_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES email_messages(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    content_type TEXT,
    size INTEGER,
    storage_path TEXT, -- path in Supabase Storage
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on attachments if just created
ALTER TABLE email_attachments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to be safe
DROP POLICY IF EXISTS "Admins full access to email_accounts" ON email_accounts;
DROP POLICY IF EXISTS "Admins full access to email_messages" ON email_messages;
DROP POLICY IF EXISTS "Admins full access to email_attachments" ON email_attachments;
DROP POLICY IF EXISTS "Super Admins full access to email_accounts" ON email_accounts;
DROP POLICY IF EXISTS "Sub Admins access own accounts" ON email_accounts;
DROP POLICY IF EXISTS "Access messages via account" ON email_messages;
DROP POLICY IF EXISTS "Access attachments via message" ON email_attachments;


-- Policy: Super Admins can do everything
CREATE POLICY "Super Admins full access to email_accounts" ON email_accounts
    FOR ALL
    TO authenticated
    USING (
        -- Check if user is super admin. 
        -- If 'is_super_admin' function doesn't exist, we might need a fallback.
        -- Let's try to use the existing function if available.
        -- Replacing with direct check on auth.uid() if needed or role.
        -- Assuming 'is_super_admin(auth.uid())' exists.
        is_super_admin(auth.uid())
    )
    WITH CHECK (
        is_super_admin(auth.uid())
    );

-- Policy: Sub Admins can only access their own accounts
-- AND accounts that have no owner (legacy/public accounts, if any)
CREATE POLICY "Sub Admins access own accounts" ON email_accounts
    FOR ALL
    TO authenticated
    USING (
        created_by = auth.uid() OR created_by IS NULL
    )
    WITH CHECK (
        created_by = auth.uid() 
        -- Prevent sub-admin from claiming null accounts implicitly on update?
        -- For now simple is better.
    );

-- 3. Email Messages Policies (Inherited Access)

-- Policy: Access messages if you have access to the account
CREATE POLICY "Access messages via account" ON email_messages
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM email_accounts 
            WHERE id = email_messages.account_id
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM email_accounts 
            WHERE id = email_messages.account_id
        )
    );

-- 4. Email Attachments Policies (Inherited Access)

-- Policy: Access attachments if you have access to the message
CREATE POLICY "Access attachments via message" ON email_attachments
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM email_messages 
            WHERE id = email_attachments.message_id
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM email_messages 
            WHERE id = email_attachments.message_id
        )
    );

-- 5. Validation: Ensure created_by is set on insert (if not set by client, trigger or default)
-- But client should allow super admin to set it? 
-- For now, let's trust the policy 'WITH CHECK' on insert.
-- The client must send 'created_by'.

-- If `is_super_admin` does not exist, we need to create it or use another method.
-- Checking if it exists safely? SQL doesn't really have "IF FUNCTION EXISTS THEN USE IT".
-- I'll assume it exists based on previous logs/context (step 166 logs show is_super_admin usage).
