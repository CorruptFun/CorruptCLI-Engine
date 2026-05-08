import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// Initialize Supabase
const supabaseUrl = 'YOUR_SUPABASE_URL'
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY'
const orgId = ORG_ID_PLACEHOLDER
const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Format date helpers
const formatTime = (isoString) => {
    return new Date(isoString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};
const formatDate = (isoString) => {
    return new Date(isoString).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const getLocalDateString = (d) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Fetch Available Classes
let allClasses = [];
let selectedDateStr = getLocalDateString(new Date());

export async function loadSchedule() {
    const scheduleContainer = document.getElementById('schedule-container');
    if (!scheduleContainer) return;

    scheduleContainer.innerHTML = '<p class="text-gray-400 text-center py-8">Loading calendar...</p>';

    let query = supabase
        .from('class_availability')
        .select('*')
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true });

    if (orgId) {
        query = query.eq('org_id', orgId);
    }

    const { data: classes, error } = await query;

    if (error) {
        scheduleContainer.innerHTML = '<p class="text-red-400">Error loading schedule. Please try again later.</p>';
        return;
    }

    allClasses = classes || [];
    renderCalendarDays();
    renderClassesForDate(selectedDateStr);
}

window.selectDate = (dateStr) => {
    selectedDateStr = dateStr;
    renderCalendarDays();
    renderClassesForDate(dateStr);
}

function renderCalendarDays() {
    const daysContainer = document.getElementById('calendar-days');
    if(!daysContainer) return;
    
    daysContainer.innerHTML = '';
    const today = new Date();
    
    for(let i=0; i<14; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const dateStr = getLocalDateString(d);
        
        const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
        const dayNum = d.getDate();
        
        const isSelected = dateStr === selectedDateStr;
        const bgClass = isSelected ? 'bg-organization-gold text-black' : 'bg-organization-dark border border-white/10 text-white hover:border-organization-gold/50';
        
        const btn = document.createElement('button');
        btn.onclick = () => selectDate(dateStr);
        btn.className = `flex flex-col items-center justify-center min-w-[70px] h-[80px] rounded-xl transition-all cursor-pointer ${bgClass}`;
        btn.innerHTML = `<span class="text-[10px] uppercase tracking-widest font-semibold mb-1">${dayName}</span><span class="text-xl font-serif">${dayNum}</span>`;
        
        daysContainer.appendChild(btn);
    }
}

function renderClassesForDate(dateStr) {
    const scheduleContainer = document.getElementById('schedule-container');
    if (!scheduleContainer) return;
    
    const filtered = allClasses.filter(cls => {
        const classDate = new Date(cls.start_time);
        return getLocalDateString(classDate) === dateStr;
    });
    
    if (filtered.length === 0) {
        scheduleContainer.innerHTML = `<div class="text-center py-12 bg-white/5 border border-white/10 rounded-2xl"><p class="text-gray-400 font-light">No classes scheduled for this day.</p></div>`;
        return;
    }
    
    scheduleContainer.innerHTML = '';
    filtered.forEach(cls => {
        const isFull = cls.booked_count >= (cls.capacity || 6);
        
        const card = document.createElement('div');
        
        if (isFull) {
            card.className = 'group border border-white/5 bg-black/40 p-6 rounded-2xl flex flex-col md:flex-row justify-between items-center text-left opacity-50 shadow-none';
            card.innerHTML = `
                <div class="mb-4 md:mb-0">
                    <p class="text-gray-500 font-sans text-xs tracking-widest uppercase mb-2 border-b border-gray-600/30 pb-1 inline-block">${formatDate(cls.start_time)}</p>
                    <h4 class="text-2xl font-serif text-gray-500 mb-2">${cls.title}</h4>
                    <p class="text-gray-600 font-sans text-sm font-light">${formatTime(cls.start_time)} - ${formatTime(cls.end_time)} | <span class="text-gray-500">Instructor: ${cls.instructor_name}</span></p>
                </div>
                <div>
                    <button disabled class="px-8 py-4 rounded-full bg-white/10 text-gray-400 font-sans uppercase tracking-widest text-sm font-semibold cursor-not-allowed whitespace-nowrap">
                        FULL / SOLD OUT
                    </button>
                </div>
            `;
        } else {
            card.className = 'group border border-organization-gold/20 bg-organization-dark p-6 rounded-2xl flex flex-col md:flex-row justify-between items-center text-left hover:border-organization-gold/60 transition duration-500 shadow-xl';
            card.innerHTML = `
                <div class="mb-4 md:mb-0">
                    <p class="text-organization-gold font-sans text-xs tracking-widest uppercase mb-2 border-b border-organization-gold/30 pb-1 inline-block">${formatDate(cls.start_time)}</p>
                    <h4 class="text-2xl font-serif text-white mb-2 group-hover:text-organization-lightgold transition">${cls.title}</h4>
                    <p class="text-gray-400 font-sans text-sm font-light">${formatTime(cls.start_time)} - ${formatTime(cls.end_time)} | <span class="text-white/80">Instructor: ${cls.instructor_name}</span></p>
                </div>
                <div>
                    <button onclick="openBookingModal('${cls.id}', '${cls.title}', '${cls.start_time}')" class="px-8 py-4 rounded-full bg-organization-gold text-organization-black font-sans uppercase tracking-widest text-sm font-semibold hover:bg-white transition-colors duration-300 shadow-[0_0_15px_rgba(212,175,55,0.2)] whitespace-nowrap">
                        Book Now
                    </button>
                </div>
            `;
        }
        scheduleContainer.appendChild(card);
    });
}

// Global functions for modal
window.openBookingModal = (classId, title, startTime) => {
    document.getElementById('booking-modal').classList.remove('hidden');
    document.getElementById('modal-class-id').value = classId;
    document.getElementById('modal-class-title').innerText = title + ' - ' + formatTime(startTime);
    document.getElementById('booking-success-msg').classList.add('hidden');
    document.getElementById('booking-form').classList.remove('hidden');

    // 24-Hour Rule Check
    const warningEl = document.getElementById('booking-warning');
    if (warningEl) {
        const classDate = new Date(startTime);
        const now = new Date();
        const diffHours = (classDate - now) / (1000 * 60 * 60);
        
        if (diffHours < 24 && diffHours > 0) {
            warningEl.classList.remove('hidden');
        } else {
            warningEl.classList.add('hidden');
        }
    }

    // Auto-fill from localStorage if available
    const savedUser = JSON.parse(localStorage.getItem('app_user') || '{}');
    if (savedUser.name) {
        document.getElementById('booking-name').value = savedUser.name;
        document.getElementById('clear-booking-btn').classList.remove('hidden');
    }
    if (savedUser.email) {
        document.getElementById('booking-email').value = savedUser.email;
    }
};

window.closeBookingModal = () => {
    document.getElementById('booking-modal').classList.add('hidden');
};

window.clearSavedUser = () => {
    localStorage.removeItem('app_user');
    document.getElementById('booking-name').value = '';
    document.getElementById('booking-email').value = '';
    
    document.getElementById('profile-name').value = '';
    document.getElementById('profile-email').value = '';
    document.getElementById('profile-phone').value = '';
    
    document.getElementById('profile-address').value = '';
    const goalsEl = document.getElementById('profile-goals');
    if (goalsEl) goalsEl.value = '';
    
    document.getElementById('clear-booking-btn')?.classList.add('hidden');
    document.getElementById('clear-profile-btn')?.classList.add('hidden');
    
    const emailInput = document.getElementById('profile-email');
    emailInput.removeAttribute('readonly');
    emailInput.classList.remove('bg-organization-dark/50', 'text-gray-500', 'cursor-not-allowed');
    emailInput.classList.add('bg-organization-dark', 'text-white', 'focus:border-organization-gold');
};

// Handle Form Submission
window.submitBooking = async (event) => {
    event.preventDefault();
    const btn = document.getElementById('submit-booking-btn');
    btn.innerText = 'Booking...';
    btn.disabled = true;

    const classId = document.getElementById('modal-class-id').value;
    const name = document.getElementById('booking-name').value;
    const email = document.getElementById('booking-email').value;
    const paymentMethod = document.getElementById('booking-payment').value;

    try {
        // --- NEW: WAIVER & CAPACITY PRE-CHECK ---
        // Fetch user from DB to check terms status
        const { data: customerData } = await supabase
            .from('customers')
            .select('terms_signed_at, class_credits, membership_expires_at')
            .eq('email', email)
            .maybeSingle();

        let needsTerms = false;

        // If they exist in DB, check terms expiration
        if (customerData) {
            if (!customerData.terms_signed_at) {
                needsTerms = true;
            } else {
                const signedDate = new Date(customerData.terms_signed_at);
                const oneYearAgo = new Date();
                oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                if (signedDate < oneYearAgo) {
                    needsTerms = true;
                }
            }
        } else {
            // If they DO NOT exist in DB, they definitely need a terms.
            // If they are paying via Stripe right now, the post-checkout redirect handles it.
            // But if they try to use Cash/Credits without an account, block them.
            if (paymentMethod !== 'stripe') {
                needsTerms = true;
            }
        }

        // If terms is missing/expired, explicitly block the booking unless it's a new Stripe checkout
        if (needsTerms) {
            if (paymentMethod !== 'stripe' || customerData) {
                alert("Action Required: Your annual liability terms is missing or expired. Please sign the terms to continue booking classes.");
                window.location.href = `/terms.html?email=${encodeURIComponent(email)}`;
                return;
            }
        }
        // --- END WAIVER PRE-CHECK ---

        // 1. Frictionless Anonymous Sign-In
        const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
        
        if (authError) throw authError;

        if (paymentMethod === 'stripe') {
            btn.innerText = 'Redirecting to Secure Checkout...';
            // Save to localStorage for future auto-fill
            localStorage.setItem('app_user', JSON.stringify({ name, email }));

            const response = await supabase.functions.invoke('stripe-checkout', {
                body: { classId, name, email, userId: authData.user.id }
            });

            if (response.error) throw response.error;
            if (response.data?.url) {
                window.location.href = response.data.url;
                return; // halt execution here since we redirect
            } else {
                throw new Error("Could not initialize checkout. Please try again.");
            }
        }

        // 2. Insert Booking (Cash/In-Organization Flow)
        const { error: bookingError } = await supabase
            .from('bookings')
            .insert([
                { 
                    class_id: classId, 
                    user_id: authData.user.id,
                    guest_name: name,
                    guest_email: email,
                    payment_method: paymentMethod,
                    payment_status: 'pending'
                }
            ]);

        if (bookingError) {
            // Handle unique constraint error (already booked)
            if(bookingError.code === '23505') {
                throw new Error("You have already booked this class.");
            }
            throw bookingError;
        }

        // Trigger email alert for Cash booking
        await supabase.functions.invoke('event-alert', {
            body: { 
                record: { 
                    class_id: classId, 
                    guest_name: name, 
                    guest_email: email, 
                    payment_method: paymentMethod 
                } 
            }
        });

        // Show Success
        document.getElementById('booking-form').classList.add('hidden');
        document.getElementById('booking-success-msg').classList.remove('hidden');

        // Save to localStorage for future auto-fill
        localStorage.setItem('app_user', JSON.stringify({ name, email }));

    } catch (err) {
        console.error('Booking failed:', err);
        alert('Booking failed: ' + err.message);
    } finally {
        btn.innerText = 'Confirm Booking';
        btn.disabled = false;
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', loadSchedule);
window.openProfileModal = () => {
    document.getElementById('profile-modal').classList.remove('hidden');
    document.getElementById('profile-form').classList.remove('hidden');
    document.getElementById('profile-header-text').classList.remove('hidden');
    document.getElementById('profile-success-msg').classList.add('hidden');
    
    const emailInput = document.getElementById('profile-email');
    const nameInput = document.getElementById('profile-name');
    const phoneInput = document.getElementById('profile-phone');
    
    const addressInput = document.getElementById('profile-address');
    const goalsInput = document.getElementById('profile-goals');

    // Enable the email field if they clicked a button instead of using the waitlist form
    if (!emailInput.value) {
        emailInput.removeAttribute('readonly');
        emailInput.classList.remove('bg-organization-dark/50', 'text-gray-500', 'cursor-not-allowed');
        emailInput.classList.add('bg-organization-dark', 'text-white', 'focus:border-organization-gold');
    }

    // Auto-fill from localStorage if available
    const savedUser = JSON.parse(localStorage.getItem('app_user') || '{}');
    if (savedUser.name) {
        nameInput.value = savedUser.name;
        document.getElementById('clear-profile-btn').classList.remove('hidden');
    }
    if (savedUser.email && !emailInput.value) emailInput.value = savedUser.email;
    if (savedUser.phone) phoneInput.value = savedUser.phone;
    
    if (savedUser.address) addressInput.value = savedUser.address;
    if (savedUser.goals_medical && goalsInput) goalsInput.value = savedUser.goals_medical;
};

document.getElementById('waitlist-init-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('waitlist-init-email').value;
    if(email) {
        const emailInput = document.getElementById('profile-email');
        emailInput.value = email;
        emailInput.setAttribute('readonly', 'true');
        emailInput.classList.add('bg-organization-dark/50', 'text-gray-500', 'cursor-not-allowed');
        emailInput.classList.remove('bg-organization-dark', 'text-white', 'focus:border-organization-gold');
        
        openProfileModal();
    }
});

window.closeProfileModal = () => {
    document.getElementById('profile-modal').classList.add('hidden');
    document.getElementById('waitlist-init-email').value = '';
};

document.getElementById('profile-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('profile-submit-btn');
    btn.innerText = "Saving...";
    btn.disabled = true;

    const email = document.getElementById('profile-email').value;
    const name = document.getElementById('profile-name').value;
    const phone = document.getElementById('profile-phone').value;
    const sex = 'Other'; // Defaulted for women's organization
    const address = document.getElementById('profile-address').value;
    const goals_medical = document.getElementById('profile-goals')?.value || '';

    try {
        // We must authenticate anonymously first so RLS policies evaluating auth.uid() or similar don't reject outright
        const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
        if (authError) throw authError;

        const { error } = await supabase.from('customers').upsert({
            email: email,
            name: name,
            phone: phone,
            sex: sex,
            address: address,
            goals_medical: goals_medical,
            membership_type: 'Waitlist'
        });

        if (error) throw error;

        // Trigger the Welcome Email
        await supabase.functions.invoke('welcome-email', {
            body: { record: { email, name } }
        });

        // Save to localStorage for future auto-fill
        localStorage.setItem('app_user', JSON.stringify({ name, email, phone, address, goals_medical }));

        document.getElementById('profile-form').classList.add('hidden');
        document.getElementById('profile-header-text').classList.add('hidden');
        document.getElementById('profile-success-msg').classList.remove('hidden');

    } catch (err) {
        console.error('Profile creation failed:', err);
        alert('Could not save profile: ' + err.message);
    } finally {
        btn.innerText = "Create Profile";
        btn.disabled = false;
    }
});

// Check for Stripe Checkout return
const verifyStripePayment = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    const bookingId = urlParams.get('booking_id');
    const isCancel = urlParams.get('cancel');

    if (isCancel) {
        alert("Payment was cancelled. Your booking was not completed.");
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    }

    if (sessionId && bookingId) {
        try {
            const { data, error } = await supabase.functions.invoke('verify-payment', {
                body: { session_id: sessionId, booking_id: bookingId }
            });

            if (error) throw error;

            if (data?.status === 'success') {
                // Get class_id, email, and name from URL params as they were passed in success_url
                const classId = urlParams.get('class_id');
                const userEmail = urlParams.get('email');
                const userName = urlParams.get('name');
                
                // Trigger email alert for Stripe checkout success
                if (classId && userName && userEmail) {
                    await supabase.functions.invoke('event-alert', {
                        body: { 
                            record: { 
                                class_id: classId, 
                                guest_name: userName, 
                                guest_email: userEmail, 
                                payment_method: 'stripe' 
                            } 
                        }
                    });
                }
                
                alert("Payment successful! Your booking is confirmed.");
                window.location.href = `/terms.html?email=${encodeURIComponent(userEmail || '')}`;
                return;
            } else {
                alert("Payment is still pending or failed. Please contact us if you believe this is an error.");
            }
        } catch (err) {
            console.error('Error verifying payment:', err);
            alert("There was an issue verifying your payment. We will check it manually.");
        } finally {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
};

// Membership Checkout Modal Handlers
window.openMembershipCheckoutModal = () => {
    document.getElementById('membership-checkout-modal').classList.remove('hidden');
    // Pre-fill if we have local storage cache
    const cachedStr = localStorage.getItem('app_user');
    if (cachedStr) {
        try {
            const cache = JSON.parse(cachedStr);
            if (cache.name) document.getElementById('mem-checkout-name').value = cache.name;
            if (cache.email) document.getElementById('mem-checkout-email').value = cache.email;
        } catch(e) {}
    }
};

window.closeMembershipCheckoutModal = () => {
    document.getElementById('membership-checkout-modal').classList.add('hidden');
};

window.submitMembershipCheckout = async (event) => {
    event.preventDefault();
    const btn = document.getElementById('submit-mem-btn');
    btn.innerText = 'Redirecting to Secure Checkout...';
    btn.disabled = true;

    const name = document.getElementById('mem-checkout-name').value;
    const email = document.getElementById('mem-checkout-email').value;
    const tier = document.getElementById('mem-checkout-tier').value;
    const preferred_time = document.getElementById('mem-checkout-time')?.value || "";

    try {
        const response = await supabase.functions.invoke('stripe-subscription-checkout', {
            body: { name, email, tier, preferred_time }
        });

        if (response.error) throw response.error;
        if (response.data?.url) {
            window.location.href = response.data.url;
        } else {
            throw new Error("Could not initialize checkout. Please try again.");
        }
    } catch (err) {
        console.error('Checkout failed:', err);
        alert('Checkout failed: ' + err.message);
        btn.innerText = 'Secure Checkout';
        btn.disabled = false;
    }
};

// Check for Membership Stripe Checkout return
const verifyMembershipPayment = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('mem_session_id');
    const tier = urlParams.get('tier');
    const email = urlParams.get('email');
    const name = urlParams.get('name');
    const preferredTime = urlParams.get('preferred_time');
    const isCancel = urlParams.get('mem_cancel');

    if (isCancel) {
        alert("Payment was cancelled.");
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    }

    if (sessionId && tier && email) {
        try {
            const { data, error } = await supabase.functions.invoke('verify-subscription-payment', {
                body: { session_id: sessionId, tier, email, name, preferred_time: preferredTime }
            });

            if (error) throw error;

            if (data?.status === 'success') {
                alert(`Membership successful! You purchased: ${tier}.`);
                window.location.href = `/terms.html?email=${encodeURIComponent(email)}`;
                return;
            } else {
                alert("Payment is still pending or failed. Please contact us if you believe this is an error.");
            }
        } catch (err) {
            console.error('Error verifying membership payment:', err);
            alert("There was an issue verifying your payment. We will check it manually.");
        } finally {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    loadSchedule();
    verifyStripePayment();
    verifyMembershipPayment();
});
