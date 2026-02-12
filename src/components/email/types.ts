
export interface EmailAccount {
    id: string;
    email_address: string;
    imap_host: string;
    imap_port: number;
    smtp_host: string;
    smtp_port: number;
    is_active: boolean;
    created_by?: string;
    is_shared: boolean;
    signature_text?: string;
    signature_image_url?: string;
    signature_image_link?: string;
}

export interface EmailMessage {
    id: string;
    account_id: string;
    folder_id: string;
    message_id: string | null;
    uid: number;
    subject: string | null;
    from_name: string | null;
    from_address: string;
    to_address: string | null;
    cc_address: string | null;
    date_sent: number | null;
    date_received: number | null;
    snippet: string | null;
    is_read: boolean;
    has_attachments: boolean;
    size: number | null;
    references: string | null;
}

export interface EmailBody {
    email_id: string;
    body_plain?: string;
    body_html?: string;
}

export interface MailFolder {
    id: string;
    name: string;
    unread_count: number;
}

export interface MailDraft {
    id: string;
    to_address: string;
    subject: string;
    updated_at: number;
}
