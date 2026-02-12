import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { data: accounts, error: accountError } = await supabase
            .from('email_accounts')
            .select('*')
            .eq('is_active', true);

        if (accountError) throw accountError;

        const results = [];

        for (const account of accounts) {
            let client;
            try {
                client = new ImapFlow({
                    host: account.imap_host,
                    port: account.imap_port,
                    secure: true,
                    auth: {
                        user: account.email,
                        pass: account.password
                    },
                    logger: false
                });

                await client.connect();

                // Define folders to sync
                const folders = ['INBOX', 'Sent', 'Sent Items']; // Common names for sent folder
                // We need to identify which "Sent" folder exists
                const list = await client.list();
                const availableFolders = list.map((f: any) => f.path);
                const targetFolders = ['INBOX'];

                // Find the correct "Sent" folder
                const sentFolder = availableFolders.find((f: string) =>
                    f.toLowerCase() === 'sent' ||
                    f.toLowerCase() === 'sent items' ||
                    f.toLowerCase() === 'sent messages' ||
                    f.toLowerCase().includes('sent') // Fallback
                );

                if (sentFolder) targetFolders.push(sentFolder);

                for (const folderName of targetFolders) {
                    let lock = await client.getMailboxLock(folderName);
                    try {
                        const dbFolder = folderName === 'INBOX' ? 'inbox' : 'sent';

                        // 1. Get existing UIDs from DB for this folder
                        const { data: existingData } = await supabase
                            .from('email_messages')
                            .select('remote_id')
                            .eq('account_id', account.id)
                            .eq('folder', dbFolder);

                        const existingUids = new Set((existingData || []).map((row: any) => row.remote_id));

                        // 2. Fetch ALL UIDs from IMAP to find what's missing
                        // This is fast as we only fetch UIDs
                        const missingUids: string[] = [];
                        // We also want to update flags for existing messages, but let's prioritize fetching new stuff first.
                        // Fetching 1:* with uid=true
                        for await (const message of client.fetch('1:*', { uid: true })) {
                            if (!existingUids.has(message.uid.toString())) {
                                missingUids.push(message.uid.toString());
                            }
                        }

                        console.log(`Account ${account.email}, Folder ${folderName}: Found ${missingUids.length} missing messages.`);

                        if (missingUids.length === 0) continue;

                        // 3. Fetch content for missing UIDs
                        // Process in chunks to avoid memory issues/timeouts if there are thousands
                        const BATCH_SIZE = 50;
                        // Reverse to fetch newest first? Or oldest? 
                        // User wants old emails, but usually newest are priority. 
                        // Let's just process them. If there are too many, we might timeout, 
                        // so maybe prioritizing newest (end of list) is safer for "new email" perception,
                        // but for "backfill", we want them all.
                        // Let's try to fetch ALL missing, assuming Supabase function time limit allows ~few hundreds.
                        // If missingUids is huge (e.g. 5000), we should probably only take the last 500?
                        // "old emails not showing" -> implies they want older ones.
                        // Let's take up to 200 messages per run.
                        const uidsToFetch = missingUids.length > 200 ? missingUids.slice(-200) : missingUids;

                        // We need to fetch by UID. imapflow expects a range string or array.
                        // When using `uid: true` in option 3, the range (arg 1) is treated as UIDs.
                        // We will construct a sequence set string "uid1,uid2,..." or just pass array if supported?
                        // ImapFlow fetch first arg is SequenceString.
                        const uidRange = uidsToFetch.join(',');

                        for await (const message of client.fetch(uidRange, { envelope: true, source: true, flags: true, uid: true }, { uid: true })) {
                            try {
                                const uid = message.uid;
                                const parsed = await simpleParser(message.source);

                                // Upsert to DB
                                const { error: insertError } = await supabase.from('email_messages').upsert({
                                    account_id: account.id,
                                    remote_id: uid.toString(),
                                    folder: dbFolder,
                                    from_name: parsed.from?.value[0]?.name,
                                    from_address: parsed.from?.value[0]?.address,
                                    to_address: Array.isArray(parsed.to) ? parsed.to.map(t => t.text).join(', ') : parsed.to?.text,
                                    subject: parsed.subject,
                                    body_text: parsed.text,
                                    body_html: parsed.html || parsed.textAsHtml,
                                    received_at: parsed.date ? new Date(parsed.date).toISOString() : new Date().toISOString(),
                                    is_read: message.flags.has('\\Seen')
                                }, { onConflict: 'account_id, remote_id, folder' });

                                if (!insertError && dbFolder === 'inbox' && !message.flags.has('\\Seen')) {
                                    const isRecent = (new Date().getTime() - new Date(parsed.date || 0).getTime()) < 1000 * 60 * 10; // 10 mins
                                    if (isRecent) {
                                        await fetch(`${supabaseUrl}/functions/v1/telegram-bot`, {
                                            method: 'POST',
                                            headers: {
                                                'Authorization': `Bearer ${supabaseServiceKey}`,
                                                'Content-Type': 'application/json'
                                            },
                                            body: JSON.stringify({
                                                type: 'email_notification',
                                                email: {
                                                    subject: parsed.subject,
                                                    from: parsed.from?.text,
                                                    id: uid.toString()
                                                },
                                                account_id: account.id
                                            })
                                        });
                                    }
                                }
                            } catch (msgErr) {
                                console.error(`Error parsing message in ${folderName}:`, msgErr);
                            }
                        }

                    } finally {
                        lock.release();
                    }
                }

                await client.logout();
                results.push({ email: account.email, status: 'success' });

            } catch (err: any) {
                console.error(`Error processing ${account.email}:`, err);
                results.push({ email: account.email, status: 'error', error: err.message });
                if (client) client.close();
            }
        }

        return new Response(JSON.stringify(results), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
