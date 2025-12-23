import { supabase } from './supabase';

/**
 * Ensures the first user to log in becomes a Super Admin
 * This is used for initial system setup
 */
export async function ensureFirstUserIsSuperAdmin(userId: string, userEmail: string) {
    try {
        // Check if any admins exist
        const { data: existingAdmins, error: checkError } = await supabase
            .from('admin_users')
            .select('id')
            .limit(1);

        if (checkError) {
            console.error('Error checking for existing admins:', checkError);
            return;
        }

        // If no admins exist, make this user a super admin
        if (!existingAdmins || existingAdmins.length === 0) {
            const { error: insertError } = await supabase
                .from('admin_users')
                .insert({
                    id: userId,
                    email: userEmail,
                    role: 'super_admin',
                    created_by: null,
                });

            if (insertError) {
                console.error('Error creating first super admin:', insertError);
            } else {
                console.log('First user registered as Super Admin');
            }
        }
    } catch (error) {
        console.error('Error in ensureFirstUserIsSuperAdmin:', error);
    }
}
