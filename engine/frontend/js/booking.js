import { supabase, supabaseUrl, supabaseAnonKey } from './supabase-config.js'

// Helper to log errors to Supabase
async function logError(context, message, stack, metadata = {}) {
    console.error(`Error in ${context}:`, message);
    try {
        await supabase.functions.invoke('log-error', {
            body: {
                source: 'client-browser',
                context,
                message,
                stack,
                metadata: {
                    url: window.location.href,
                    ...metadata
                }
            }
        });
    } catch (e) {
        console.error("Failed to log error to server:", e);
    }
}

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

    try {
        const { data: classes, error } = await supabase
            .from('class_availability')
            .select('*')
            .eq('is_private', false)
            .gte('start_time', new Date().toISOString())
            .order('start_time', { ascending: true });

        if (error) throw error;

        allClasses = classes || [];
        renderCalendarDays();
        renderClassesForDate(selectedDateStr);
    } catch (err) {
        logError('loadSchedule', err.message, err.stack);
        scheduleContainer.innerHTML = '<p class="text-red-400">Error loading schedule. Please try again later.</p>';
    }
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
        const bgClass = isSelected ? 'bg-studio-gold text-black' : 'bg-studio-dark border border-white/10 text-white hover:border-studio-gold/50';
        
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
            card.className = 'group border border-studio-gold/20 bg-studio-dark p-6 rounded-2xl flex flex-col md:flex-row justify-between items-center text-left hover:border-studio-gold/60 transition duration-500 shadow-xl';
            card.innerHTML = `
                <div class="mb-4 md:mb-0">
                    <p class="text-studio-gold font-sans text-xs tracking-widest uppercase mb-2 border-b border-studio-gold/30 pb-1 inline-block">${formatDate(cls.start_time)}</p>
                    <h4 class="text-2xl font-serif text-white mb-2 group-hover:text-studio-lightgold transition">${cls.title}</h4>
                    <p class="text-gray-400 font-sans text-sm font-light">${formatTime(cls.start_time)} - ${formatTime(cls.end_time)} | <span class="text-white/80">Instructor: ${cls.instructor_name}</span></p>
                </div>
                <div>
                    <button onclick="openBookingModal('${cls.id}', '${cls.title}', '${cls.start_time}')" class="px-8 py-4 rounded-full bg-studio-gold text-studio-black font-sans uppercase tracking-widest text-sm font-semibold hover:bg-white transition-colors duration-300 shadow-[0_0_15px_rgba(212,175,55,0.2)] whitespace-nowrap">
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

    // Reset membership verification state
    const paymentSelect = document.getElementById('booking-payment');
    const membershipStatus = document.getElementById('membership-status');
    const submitBtn = document.getElementById('submit-booking-btn');
    if (paymentSelect) paymentSelect.classList.add('hidden');
    if (membershipStatus) {
        membershipStatus.classList.remove('hidden');
        membershipStatus.innerHTML = 'Enter your email above to verify your membership';
        membershipStatus.className = 'w-full bg-studio-black border border-studio-gold/20 rounded-xl px-4 py-3 text-gray-500 font-sans text-sm';
    }
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }

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
        // Auto-trigger membership check if email is pre-filled
        setTimeout(() => document.getElementById('booking-email').dispatchEvent(new Event('blur')), 100);
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
    emailInput.classList.remove('bg-studio-dark/50', 'text-gray-500', 'cursor-not-allowed');
    emailInput.classList.add('bg-studio-dark', 'text-white', 'focus:border-studio-gold');
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
        // --- STRIPE PAY-PER-CLASS PATH ---
        if (paymentMethod === 'stripe') {
            // Redirect to Stripe Checkout — stripe-checkout function handles booking + payment
            const { data, error } = await supabase.functions.invoke('stripe-checkout', {
                body: { classId, name, email, userId: null }
            });
            if (error) throw error;
            if (data?.url) {
                window.location.href = data.url;
                return;
            }
            throw new Error('Failed to create checkout session.');
        }

        // --- PAY AT STUDIO (CASH) PATH ---
        if (paymentMethod === 'cash') {
            // Ensure customer record exists via edge function (anon can't SELECT customers directly)
            const { data: cashCheck } = await supabase.functions.invoke('customer-lookup', {
                body: { type: 'booking_eligibility', email }
            });
            if (!cashCheck || cashCheck.found === false) {
                // New customer — create their record (INSERT is allowed by RLS)
                await supabase.from('customers').insert({
                    email, name, membership_type: 'User'
                });
            }

            // Waiver pre-check — reuse the lookup data from above
            const cashLookupData = cashCheck;
            if (cashLookupData && cashLookupData.found !== false) {
                let needsWaiver = false;
                if (!cashLookupData.waiver_signed_at) {
                    needsWaiver = true;
                } else {
                    const signedDate = new Date(cashLookupData.waiver_signed_at);
                    const oneYearAgo = new Date();
                    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                    if (signedDate < oneYearAgo) needsWaiver = true;
                }
                if (needsWaiver) {
                    const userName = cashLookupData.name || name;
                    if (confirm(`${userName}, your annual liability waiver is missing or expired. Would you like us to email you a secure link to sign the waiver so you can complete your booking?`)) {
                        await supabase.functions.invoke('booking-alert', {
                            body: { type: 'send_waiver_link', email, name: userName }
                        });
                        alert("Email sent! Please check your inbox, sign the waiver, and then return here to finish booking.");
                    }
                    btn.innerText = 'Confirm Booking';
                    btn.disabled = false;
                    return;
                }
            }

            // Insert cash booking — pending payment status (admin sees this as owing)
            const { error: cashBookingErr } = await supabase
                .from('bookings')
                .insert([{
                    class_id: classId,
                    user_id: null,
                    guest_name: name,
                    guest_email: email,
                    payment_method: 'cash',
                    payment_status: 'pending'
                }]);
            if (cashBookingErr) {
                if (cashBookingErr.code === '23505') {
                    throw new Error("You have already booked this class.");
                }
                throw cashBookingErr;
            }

            // Save for future auto-fill
            localStorage.setItem('app_user', JSON.stringify({ name, email }));

            // Show success with payment reminder
            document.getElementById('booking-form').classList.add('hidden');
            document.getElementById('booking-success-msg').classList.remove('hidden');
            return;
        }

        // --- MEMBERSHIP/CREDITS PATH ---
        const { data: lookupData, error: lookupErr } = await supabase.functions.invoke('customer-lookup', {
            body: { type: 'booking_eligibility', email }
        });
        if (lookupErr) throw lookupErr;
        const customerData = lookupData;

        // Verify they actually have what they selected
        if (paymentMethod === 'credits') {
            if (!customerData || customerData.class_credits <= 0) {
                throw new Error("No class credits remaining. Please select 'Pay for This Class' or purchase a class experience pack.");
            }
            // Check credit expiration (the DB trigger also checks, but gives a raw SQL error)
            if (customerData.credits_expires_at && new Date(customerData.credits_expires_at) < new Date()) {
                throw new Error("Your class credits have expired. Please purchase a new class experience pack.");
            }
        }
        if (paymentMethod === 'membership') {
            const UNLIMITED_TYPES = ['1 Month Unlimited', '3 Months Unlimited', '6 Months Unlimited', '12 Months Unlimited', 'Founder'];
            const isFounder = customerData?.membership_type === 'Founder';
            const valid = customerData && (
                UNLIMITED_TYPES.includes(customerData.membership_type) && 
                (isFounder || (customerData.membership_expires_at && 
                 new Date(customerData.membership_expires_at) > new Date()))
            );
            if (!valid) {
                throw new Error("Your membership has expired. Please select 'Pay for This Class' or renew your plan.");
            }
        }

        // --- WAIVER PRE-CHECK ---
        if (customerData) {
            let needsWaiver = false;
            if (!customerData.waiver_signed_at) {
                needsWaiver = true;
            } else {
                const signedDate = new Date(customerData.waiver_signed_at);
                const oneYearAgo = new Date();
                oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                if (signedDate < oneYearAgo) {
                    needsWaiver = true;
                }
            }

            if (needsWaiver) {
                const userName = customerData.name || name;
                if (confirm(`${userName}, your annual liability waiver is missing or expired. Would you like us to email you a secure link to sign the waiver so you can complete your booking?`)) {
                    await supabase.functions.invoke('booking-alert', {
                        body: { type: 'send_waiver_link', email: email, name: userName }
                    });
                    alert("Email sent! Please check your inbox, sign the waiver, and then return here to finish booking.");
                }
                return;
            }
        }
        // --- END WAIVER PRE-CHECK ---

        // Credit deduction is handled atomically by the database trigger (tr_deduct_credits)
        // on booking INSERT for both 'credits' and 'membership' payment methods.
        // No client-side RPC call needed — this prevents race conditions.

        // Insert Booking
        const { error: bookingError } = await supabase
            .from('bookings')
            .insert([
                { 
                    class_id: classId, 
                    user_id: null,
                    guest_name: name,
                    guest_email: email,
                    payment_method: paymentMethod,
                    payment_status: 'paid'
                }
            ]);

        if (bookingError) {
            if(bookingError.code === '23505') {
                throw new Error("You have already booked this class.");
            }
            throw bookingError;
        }

        // --- LAST CREDIT NOTIFICATION ---
        if (paymentMethod === 'credits') {
            const { data: updated } = await supabase.functions.invoke('customer-lookup', {
                body: { type: 'member_credits', email }
            });

            if (updated && updated.class_credits === 0) {
                // Fire-and-forget notification that credits are depleted
                supabase.functions.invoke('booking-alert', {
                    body: { type: 'credits_depleted', email: email, name: name }
                }).catch(err => console.error('Credits depleted notification failed:', err));
            }
        }

        // Show Success
        document.getElementById('booking-form').classList.add('hidden');
        document.getElementById('booking-success-msg').classList.remove('hidden');

        // Save to localStorage for future auto-fill
        localStorage.setItem('app_user', JSON.stringify({ name, email }));

    } catch (err) {
        logError('submitBooking', err.message, err.stack, { classId, email, paymentMethod });
        console.error('Booking failed:', err);
        if (err.code === '23505') {
            alert("Booking failed: You have already booked this class.");
        } else {
            alert('Booking failed: ' + err.message);
        }
    } finally {
        btn.innerText = 'Confirm Booking';
        btn.disabled = false;
    }
};

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
        emailInput.classList.remove('bg-studio-dark/50', 'text-gray-500', 'cursor-not-allowed');
        emailInput.classList.add('bg-studio-dark', 'text-white', 'focus:border-studio-gold');
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
        emailInput.classList.add('bg-studio-dark/50', 'text-gray-500', 'cursor-not-allowed');
        emailInput.classList.remove('bg-studio-dark', 'text-white', 'focus:border-studio-gold');
        
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
    const sex = 'Female'; // Defaulted for women's studio
    const address = document.getElementById('profile-address').value;
    const goals_medical = document.getElementById('profile-goals')?.value || '';

    try {

        // Route through edge function — RLS blocks anon UPDATE
        const { data: saveResult, error: saveErr } = await supabase.functions.invoke('customer-lookup', {
            body: {
                type: 'save_profile',
                email,
                profile_data: {
                    name,
                    phone,
                    sex,
                    address,
                    fitness_goals: goals_medical,
                }
            }
        });

        if (saveErr) throw saveErr;
        if (saveResult?.error) throw new Error(saveResult.error);

        // Trigger the Welcome Email
        await supabase.functions.invoke('welcome-email', {
            body: { record: { email, name, phone, address, fitness_goals: goals_medical } }
        });

        // Save to localStorage for future auto-fill
        localStorage.setItem('app_user', JSON.stringify({ name, email, phone, address, goals_medical }));

        document.getElementById('profile-form').classList.add('hidden');
        document.getElementById('profile-header-text').classList.add('hidden');
        document.getElementById('profile-success-msg').classList.remove('hidden');

    } catch (err) {
        logError('profile-form', err.message, err.stack, { email });
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
        // Clean up the pending booking so the user can re-book
        if (bookingId) {
            try {
                const email = urlParams.get('email') || '';
                await supabase.functions.invoke('customer-lookup', {
                    body: { type: 'cancel_booking', email, booking_id: bookingId }
                });
            } catch (e) {
                console.warn("Could not clean up pending booking:", e);
            }
        }
        alert("Payment was cancelled. Your booking was not completed.");
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    }

    if (sessionId && bookingId) {
        try {
            const { data, error } = await supabase.functions.invoke('verify-payment', {
                body: { session_id: sessionId, booking_id: bookingId }
            });

            if (error) {
                logError('verify-payment-invoke', error.message, null, { sessionId, bookingId });
                throw error;
            }

            if (data?.status === 'success') {
                // Email alerts are handled automatically by the database webhook on bookings UPDATE (payment_status -> paid)
                // No manual invocation needed — the booking-alert Edge Function fires via Supabase webhook
                const userEmail = urlParams.get('email');
                
                window.location.href = `/waiver.html?email=${encodeURIComponent(userEmail || '')}`;
                return;
            } else {
                alert("Payment is still pending or failed. Please contact us if you believe this is an error.");
            }
        } catch (err) {
            logError('verifyStripePayment', err.message, err.stack, { sessionId, bookingId });
            console.error('Error verifying payment:', err);
            alert("There was an issue verifying your payment. We will check it manually.");
        } finally {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
};

window.openMembershipCheckoutModal = () => {
    document.getElementById('membership-checkout-modal').classList.remove('hidden');
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
        const response = await supabase.functions.invoke('stripe-membership-checkout', {
            body: { name, email, tier, preferred_time }
        });

        if (response.error) {
            logError('membership-checkout-invoke', response.error.message, null, { email, tier });
            throw response.error;
        }
        if (response.data?.url) {
            window.location.href = response.data.url;
        } else {
            const noUrlErr = "No checkout URL returned from server";
            logError('membership-checkout-no-url', noUrlErr, null, { email, tier });
            throw new Error(noUrlErr);
        }
    } catch (err) {
        logError('submitMembershipCheckout', err.message, err.stack, { email, tier });
        console.error('Checkout failed:', err);
        alert('Checkout failed: ' + err.message);
        btn.innerText = 'Secure Checkout';
        btn.disabled = false;
    }
};

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
            const { data, error } = await supabase.functions.invoke('verify-membership-payment', {
                body: { session_id: sessionId, tier, email, name, preferred_time: preferredTime }
            });

            if (error) {
                logError('verify-membership-payment-invoke', error.message, null, { sessionId, email });
                throw error;
            }

            if (data?.status === 'success' || data?.status === 'already_processed') {
                alert(`Membership successful! You purchased: ${tier}.`);
                window.location.href = `/waiver.html?email=${encodeURIComponent(email)}`;
                return;
            } else {
                alert("Payment is still pending or failed. Please contact us if you believe this is an error.");
            }
        } catch (err) {
            logError('verifyMembershipPayment', err.message, err.stack, { sessionId, email });
            console.error('Error verifying membership payment:', err);
            alert("There was an issue verifying your payment. We will check it manually.");
        } finally {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    loadSchedule();
    verifyStripePayment();
    verifyMembershipPayment();
    verifyOneOnOnePayment();

    // Check membership/credits when email is entered — gate booking access
    const bookingEmail = document.getElementById('booking-email');
    if (bookingEmail) {
        bookingEmail.addEventListener('blur', async () => {
            const email = bookingEmail.value.trim().toLowerCase();
            if (!email) return;

            const paymentSelect = document.getElementById('booking-payment');
            const membershipStatus = document.getElementById('membership-status');
            const submitBtn = document.getElementById('submit-booking-btn');
            const creditsOption = document.getElementById('option-credits');
            const membershipOption = document.getElementById('option-membership');
            const stripeOption = document.getElementById('option-stripe');

            // --- Secure lookup via Edge Function (replaces direct table queries) ---
            const { data: customer, error: lookupError } = await supabase.functions.invoke('customer-lookup', {
                body: { type: 'booking_eligibility', email }
            });
            if (lookupError) {
                console.error('Lookup error:', lookupError);
                return;
            }

            const UNLIMITED_TYPES = ['1 Month Unlimited', '3 Months Unlimited', '6 Months Unlimited', '12 Months Unlimited', 'Founder'];
            const isFounder = customer?.membership_type === 'Founder';
            const hasUnlimitedMembership = customer && customer.found !== false && UNLIMITED_TYPES.includes(customer.membership_type) && 
                (isFounder || (customer.membership_expires_at && new Date(customer.membership_expires_at) > new Date()));

            // Check credit expiration (30-day rule)
            const creditsExpired = customer && customer.credits_expires_at && new Date(customer.credits_expires_at) < new Date();
            const hasCredits = customer && customer.class_credits > 0 && !creditsExpired && !hasUnlimitedMembership;

            // --- PAST-DUE BALANCE CHECK (members never owe) ---
            if (!hasUnlimitedMembership) {
                const hasPastDue = customer && customer.unpaid_count > 0;

                if (hasPastDue) {
                    // Block booking — must settle balance first
                    if (paymentSelect) paymentSelect.classList.add('hidden');
                    if (membershipStatus) {
                        membershipStatus.classList.remove('hidden');
                        membershipStatus.innerHTML = `
                            <span class="text-red-400 font-bold">⚠️ Outstanding Balance</span><br/>
                            <span class="text-gray-400 text-xs">You have ${customer.unpaid_count} unpaid class${customer.unpaid_count > 1 ? 'es' : ''}. Please settle your balance in-studio or contact us before booking another class.</span>
                        `;
                        membershipStatus.className = 'w-full bg-red-900/10 border border-red-500/30 rounded-xl px-4 py-3 font-sans text-sm';
                    }
                    if (submitBtn) {
                        submitBtn.disabled = true;
                        submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
                    }
                    return;
                }
            }
            // --- END PAST-DUE CHECK ---

            // ─── SMART PAYMENT ROUTING ────────────────────────────
            // Members & credit holders skip payment selection entirely.
            // Non-members see cash or online pay options only.

            if (hasUnlimitedMembership) {
                // ── UNLIMITED MEMBER: auto-book, no dropdown ──
                if (paymentSelect) paymentSelect.classList.add('hidden');
                if (membershipStatus) {
                    membershipStatus.classList.remove('hidden');
                    membershipStatus.innerHTML = `
                        <span class="text-studio-gold font-semibold">✦ ${customer.membership_type} Member</span><br/>
                        <span class="text-gray-400 text-xs">Your membership covers this class — just hit confirm!</span>
                    `;
                    membershipStatus.className = 'w-full bg-studio-gold/5 border border-studio-gold/30 rounded-xl px-4 py-3 font-sans text-sm';
                }
                paymentSelect.value = 'membership';

            } else if (hasCredits) {
                // ── CREDIT HOLDER: auto-use credits, no dropdown ──
                const daysLeft = customer.credits_expires_at ? Math.ceil((new Date(customer.credits_expires_at) - new Date()) / (1000 * 60 * 60 * 24)) : null;
                if (paymentSelect) paymentSelect.classList.add('hidden');
                if (membershipStatus) {
                    membershipStatus.classList.remove('hidden');
                    membershipStatus.innerHTML = `
                        <span class="text-studio-gold font-semibold">✦ ${customer.class_credits} Class Credit${customer.class_credits > 1 ? 's' : ''} Available</span><br/>
                        <span class="text-gray-400 text-xs">1 credit will be used for this booking${daysLeft ? ` · ${daysLeft} day${daysLeft > 1 ? 's' : ''} remaining` : ''}.</span>
                    `;
                    membershipStatus.className = 'w-full bg-studio-gold/5 border border-studio-gold/30 rounded-xl px-4 py-3 font-sans text-sm';
                }
                paymentSelect.value = 'credits';

            } else {
                // ── NON-MEMBER: show payment options (cash or online) ──
                if (membershipStatus) membershipStatus.classList.add('hidden');
                if (paymentSelect) paymentSelect.classList.remove('hidden');

                // Hide member-only options
                if (creditsOption) { creditsOption.hidden = true; creditsOption.disabled = true; }
                if (membershipOption) { membershipOption.hidden = true; membershipOption.disabled = true; }

                // Show available payment methods
                if (stripeOption) { stripeOption.hidden = false; stripeOption.disabled = false; }
                const cashOption = document.getElementById('option-cash');
                if (cashOption) { cashOption.hidden = false; cashOption.disabled = false; }

                paymentSelect.value = 'stripe';
            }

            // Enable submit
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        });
    }
});

// ==========================================
// 1:1 Private Session Logic
// ==========================================

window.openOneOnOneModal = () => {
    document.getElementById('one-on-one-modal').classList.remove('hidden');
    
    // Auto-fill from local storage if available
    const savedUser = localStorage.getItem('app_user');
    if (savedUser) {
        try {
            const { name, email } = JSON.parse(savedUser);
            if (name) document.getElementById('1on1-name').value = name;
            if (email) document.getElementById('1on1-email').value = email;
        } catch (e) {
            console.error(e);
        }
    }
};

window.closeOneOnOneModal = () => {
    document.getElementById('one-on-one-modal').classList.add('hidden');
};

window.update1on1Total = () => {
    const qty = parseInt(document.getElementById('1on1-quantity').value) || 1;
    document.getElementById('1on1-total').innerText = '$' + (qty * 75);
};

window.submitOneOnOnePurchase = async (event) => {
    event.preventDefault();
    const btn = document.getElementById('submit-1on1-btn');
    btn.innerText = 'Redirecting to Secure Checkout...';
    btn.disabled = true;

    const name = document.getElementById('1on1-name').value;
    const email = document.getElementById('1on1-email').value;
    const quantity = document.getElementById('1on1-quantity').value;
    const goalSummary = document.getElementById('1on1-goals').value;

    try {
        localStorage.setItem('app_user', JSON.stringify({ name, email }));

        const response = await supabase.functions.invoke('stripe-1on1-checkout', {
            body: { quantity, goalSummary, name, email }
        });

        if (response.error) {
            logError('stripe-1on1-checkout-invoke', response.error.message, null, { email, quantity });
            throw response.error;
        }
        if (response.data?.url) {
            window.location.href = response.data.url;
        } else {
            const noUrlErr = "No checkout URL returned from server";
            logError('stripe-1on1-checkout-no-url', noUrlErr, null, { email });
            throw new Error(noUrlErr);
        }
    } catch (err) {
        logError('submitOneOnOnePurchase', err.message, err.stack, { email });
        console.error('1:1 Purchase Error:', err);
        alert('Checkout initialization failed: ' + err.message);
        btn.innerText = 'Pay Now';
        btn.disabled = false;
    }
};

const verifyOneOnOnePayment = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('one_on_one_success');
    const cancel = urlParams.get('one_on_one_cancel');
    const sessionId = urlParams.get('oo_session_id');
    const email = urlParams.get('email');
    const quantity = parseInt(urlParams.get('quantity')) || 1;

    if (cancel) {
        alert("1:1 Session purchase was cancelled.");
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    }

    if (success && sessionId && email) {
        try {
            const { data, error } = await supabase.functions.invoke('verify-membership-payment', {
                body: { 
                    session_id: sessionId, 
                    tier: 'one_on_one', 
                    email, 
                    name: JSON.parse(localStorage.getItem('app_user') || '{}').name || '',
                    quantity 
                }
            });

            if (error) throw error;

            if (data?.status === 'success' || data?.status === 'already_processed') {
                alert("Payment successful! A {{CLIENT_NAME}} instructor will reach out within 24 hours to schedule your individual 1:1 sessions.");
            } else {
                alert("Payment is still pending. If you believe this is an error, please contact us.");
            }
        } catch (err) {
            logError('verifyOneOnOnePayment', err.message, err.stack, { sessionId, email });
            console.error('1:1 Payment verification failed:', err);
            alert("Payment successful! A {{CLIENT_NAME}} instructor will reach out within 24 hours to schedule your sessions.");
        } finally {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    } else if (success) {
        // Legacy fallback — no session_id in URL
        alert("Payment successful! A {{CLIENT_NAME}} instructor will reach out within 24 hours to schedule your individual 1:1 sessions.");
        window.history.replaceState({}, document.title, window.location.pathname);
    }
};
