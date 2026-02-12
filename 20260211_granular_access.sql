-- Create table for granular email account access
CREATE TABLE IF NOT EXISTS mail_account_access (
    account_id UUID REFERENCES mail_accounts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- References admin_users(id) / auth.users(id)
    PRIMARY KEY (account_id, user_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_mail_account_access_user ON mail_account_access(user_id);
