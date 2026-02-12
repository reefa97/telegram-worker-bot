-- Update the bot token
UPDATE bot_settings
SET telegram_bot_token = '8596091608:AAFADhMCf0gLdg93VjtS99JFZXXzLmQYHkU',
    is_active = true;

-- Verify
SELECT * FROM bot_settings;
