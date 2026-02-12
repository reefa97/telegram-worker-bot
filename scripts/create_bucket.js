
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mxjfqszjpnlmagsikqfk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14amZxc3pqcG5sbWFnc2lrcWZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDA3OTQ1MywiZXhwIjoyMDc5NjU1NDUzfQ.y1_di9f2XoltBuivaadOZQ7ZJfRMmifvQJIyjVzcrps';

const supabase = createClient(supabaseUrl, supabaseKey);

async function createBucket() {
    console.log('Creating "signatures" bucket...');
    const { data, error } = await supabase
        .storage
        .createBucket('signatures', {
            public: true,
            allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
            fileSizeLimit: 1048576 * 2 // 2MB
        });

    if (error) {
        if (error.message && (error.message.includes('already exists') || error.message.includes('The resource already exists'))) {
            console.log('Bucket "signatures" already exists.');
            const { error: updateError } = await supabase.storage.updateBucket('signatures', { public: true });
            if (updateError) console.error('Error updating public status:', updateError);
            else console.log('Bucket updated to public.');
        } else {
            console.error('Error creating bucket:', error);
        }
    } else {
        console.log('Bucket "signatures" created successfully:', data);
    }
}

createBucket();
