import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const supabaseUrl = 'YOUR_SUPABASE_URL'
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY'
const supabase = createClient(supabaseUrl, supabaseAnonKey)

document.addEventListener('DOMContentLoaded', async () => {
    // Check URL for email parameter
    const urlParams = new URLSearchParams(window.location.search);
    const userEmail = urlParams.get('email');
    
    if (!userEmail) {
        document.getElementById('email-prompt-screen').classList.remove('hidden');
        document.getElementById('email-prompt-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const typedEmail = document.getElementById('prompt-email').value;
            if (typedEmail) {
                window.location.href = `/terms.html?email=${encodeURIComponent(typedEmail)}`;
            }
        });
        return;
    }
    
    document.getElementById('terms-form').classList.remove('hidden');
    document.getElementById('customer-email').value = userEmail;

    // Fetch existing data to pre-fill if any
    const { data: customer } = await supabase
        .from('customers')
        .select('*')
        .eq('email', userEmail)
        .single();
        
    if (customer) {
        if (customer.name) document.getElementById('w-name').value = customer.name;
        if (customer.phone) document.getElementById('w-phone').value = customer.phone;
        if (customer.address) document.getElementById('w-address').value = customer.address;
        if (customer.emergency_contact_name) document.getElementById('w-em-name').value = customer.emergency_contact_name;
        if (customer.emergency_contact_phone) document.getElementById('w-em-phone').value = customer.emergency_contact_phone;
        if (customer.secondary_email) document.getElementById('w-sec-email').value = customer.secondary_email;
        if (customer.date_of_birth) document.getElementById('w-dob').value = customer.date_of_birth;
        if (customer.fitness_goals) document.getElementById('w-goals').value = customer.fitness_goals;
        
        // If they already signed, we could technically skip, but let them resign if they want to update info
    }
});

document.getElementById('terms-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const btn = document.getElementById('submit-terms-btn');
    btn.disabled = true;
    btn.innerHTML = 'Saving...';
    
    const email = document.getElementById('customer-email').value;
    const name = document.getElementById('w-name').value;
    const dob = document.getElementById('w-dob').value;
    const phone = document.getElementById('w-phone').value;
    const address = document.getElementById('w-address').value;
    const emName = document.getElementById('w-em-name').value;
    const emPhone = document.getElementById('w-em-phone').value;
    const secEmail = document.getElementById('w-sec-email').value;
    const goals = document.getElementById('w-goals').value;
    
    const signature = document.getElementById('w-signature').value;
    const photoConsent = document.getElementById('w-photo-consent').checked;
    const isMinor = document.getElementById('w-is-minor').checked;
    const guardianName = isMinor ? document.getElementById('w-guardian-name').value : null;

    if (isMinor && !guardianName) {
        alert("Please provide the Parent/Guardian name.");
        btn.disabled = false;
        btn.innerHTML = 'Sign & Complete Registration';
        return;
    }

    if (signature.trim().toLowerCase() !== name.trim().toLowerCase()) {
        const confirmSign = confirm(`Your signature "${signature}" does not exactly match the name you provided "${name}". Do you want to proceed?`);
        if(!confirmSign) {
            btn.disabled = false;
            btn.innerHTML = 'Sign & Complete Registration';
            return;
        }
    }

    try {
        // We get client IP via an external free API for clickwrap compliance
        let ip = 'Unknown';
        try {
            const ipRes = await fetch('https://api.ipify.org?format=json');
            const ipData = await ipRes.json();
            ip = ipData.ip;
        } catch (e) { console.log('IP fetch failed'); }

        const { error } = await supabase.from('customers').upsert({
            email: email,
            name: name,
            phone: phone,
            address: address,
            emergency_contact_name: emName,
            emergency_contact_phone: emPhone,
            secondary_email: secEmail || null,
            date_of_birth: dob,
            fitness_goals: goals,
            terms_signed_at: new Date().toISOString(),
            terms_legal_name: signature,
            terms_ip_address: ip,
            terms_photo_release: photoConsent,
            terms_minor_guardian_name: guardianName,
            org_id: orgId
        }, { onConflict: 'email' });

        if (error) throw error;

        document.getElementById('terms-form').classList.add('hidden');
        document.getElementById('success-screen').classList.remove('hidden');

    } catch (err) {
        console.error(err);
        alert('Error saving terms. Please try again.');
        btn.disabled = false;
        btn.innerHTML = 'Sign & Complete Registration';
    }
});
