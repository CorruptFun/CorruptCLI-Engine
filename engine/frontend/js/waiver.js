import { supabase } from './supabase-config.js'

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
                window.location.href = `/waiver.html?email=${encodeURIComponent(typedEmail)}`;
            }
        });
        return;
    }
    
    document.getElementById('waiver-form').classList.remove('hidden');
    document.getElementById('customer-email').value = userEmail;

    // Fetch existing data to pre-fill via secure Edge Function
    const { data: customer } = await supabase.functions.invoke('customer-lookup', {
        body: { type: 'waiver_prefill', email: userEmail }
    });
        
    if (customer) {
        // --- NEW: WAIVER PROTECTION ---
        if (customer.waiver_signed_at) {
            const signedDate = new Date(customer.waiver_signed_at);
            const elevenMonthsAgo = new Date();
            elevenMonthsAgo.setMonth(elevenMonthsAgo.getMonth() - 11);
            
            if (signedDate > elevenMonthsAgo) {
                // Waiver is still valid and signed recently
                document.getElementById('waiver-form').classList.add('hidden');
                const successScreen = document.getElementById('success-screen');
                successScreen.classList.remove('hidden');
                
                // Update text to reflect "Already Signed"
                const title = successScreen.querySelector('h2');
                const desc = successScreen.querySelector('p');
                if (title) title.innerText = "Waiver Already Signed";
                if (desc) desc.innerText = "Our records show that you have already signed your mandatory liability waiver for this year. You are all set to join us in the studio!";
                return;
            }
        }
        // --- END PROTECTION ---

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

document.getElementById('waiver-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const btn = document.getElementById('submit-waiver-btn');
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

        // Two-step approach: UPDATE existing customer (preserving membership_type),
        // or INSERT new customer if they don't exist yet.
        // This prevents the upsert from overwriting membership_type on re-signing.
        const waiverData = {
            name: name,
            phone: phone,
            address: address,
            emergency_contact_name: emName,
            emergency_contact_phone: emPhone,
            secondary_email: secEmail || null,
            date_of_birth: dob,
            fitness_goals: goals,
            waiver_signed_at: new Date().toISOString(),
            waiver_legal_name: signature,
            waiver_ip_address: ip,
            waiver_photo_release: photoConsent,
            waiver_minor_guardian_name: guardianName,
        };

        // Route through edge function — RLS blocks anon UPDATE
        // (anon can't SELECT to match the row for UPDATE)
        const { data: saveResult, error: saveErr } = await supabase.functions.invoke('customer-lookup', {
            body: {
                type: 'save_waiver',
                email,
                waiver_data: waiverData
            }
        });

        if (saveErr) throw saveErr;
        if (saveResult?.error) throw new Error(saveResult.error);

        // Trigger Welcome Email and Admin Notification for new signups
        try {
            await supabase.functions.invoke('welcome-email', {
                body: { record: { email, name, phone, address, fitness_goals: goals } }
            });
        } catch (e) { console.error('Welcome email failed:', e); }

        document.getElementById('waiver-form').classList.add('hidden');
        document.getElementById('success-screen').classList.remove('hidden');

    } catch (err) {
        console.error(err);
        alert('Error saving waiver. Please try again.');
        btn.disabled = false;
        btn.innerHTML = 'Sign & Complete Registration';
    }
});
