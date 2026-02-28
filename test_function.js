import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        env[match[1]] = match[2];
    }
});

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_ANON_KEY;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/send-telegram-notification`;

async function testFunction() {
    console.log(`Calling ${FUNCTION_URL}...`);
    try {
        const res = await fetch(FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chat_id: 123456789,
                message: 'Test message from Node script'
            })
        });

        const status = res.status;
        const text = await res.text();
        console.log(`Status: ${status}`);
        console.log(`Response: ${text}`);
    } catch (err) {
        console.error('Fetch failed:', err);
    }
}

testFunction();
