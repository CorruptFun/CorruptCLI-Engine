import { supabase } from './supabase-config.js'

// State variables
let currentUser = null;
let membership = {};
let allClasses = [];
let selectedClasses = [];
let currentMonthDate = new Date();
let selectedDateStr = new Date().toISOString().split('T')[0];
let upcomingBookings = [];

async function loadUserBookings() {
    const { data, error } = await supabase.functions.invoke('customer-lookup', {
        body: { type: 'member_bookings', email: currentUser.email }
    });

    if (!error && data) {
        upcomingBookings = data.bookings || [];
        renderUpcomingBookings();
    } else {
        console.error("Error loading bookings:", error);
        const container = document.getElementById('upcoming-bookings-container');
        if (container) container.innerHTML = '<p class="text-red-400 text-xs">Failed to load schedule.</p>';
    }
}

function renderUpcomingBookings() {
    const container = document.getElementById('upcoming-bookings-container');
    if (!container) return;

    const now = new Date();
    const future = upcomingBookings.filter(b => new Date(b.classes.start_time) > now);
    
    if (future.length === 0) {
        container.innerHTML = '<p class="text-gray-500 italic text-sm">No upcoming classes scheduled.</p>';
        return;
    }

    container.innerHTML = future.map(b => {
        const startTime = new Date(b.classes.start_time);
        const diffHours = (startTime - now) / (1000 * 60 * 60);
        const isLocked = diffHours < 24;

        return `
            <div class="bg-white/5 border border-white/10 p-4 rounded-xl flex justify-between items-center mb-3">
                <div class="flex-grow pr-4">
                    <p class="text-studio-gold text-[10px] uppercase font-bold">${startTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} @ ${startTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
                    <p class="text-white font-serif">${b.classes.title}</p>
                </div>
                ${isLocked ? `
                    <button onclick="contactForCancel()" class="text-gray-600 hover:text-white text-[10px] uppercase tracking-widest transition border border-white/5 px-2 py-1 rounded">Help</button>
                ` : `
                    <button onclick="cancelBooking('${b.id}')" class="text-gray-500 hover:text-red-400 text-[10px] uppercase tracking-widest transition">Cancel</button>
                `}
            </div>
        `;
    }).join('');
}

window.contactForCancel = () => {
    alert("Our policy requires 24-hour notice for cancellations. Since this class is starting soon, please contact us at {{ADMIN_EMAIL}} for assistance.");
};

window.cancelBooking = async (id) => {
    // Find the booking in local state to check time as a safety measure
    const booking = upcomingBookings.find(b => b.id === id);
    if (booking) {
        const startTime = new Date(booking.classes.start_time);
        const diffHours = (startTime - new Date()) / (1000 * 60 * 60);
        
        if (diffHours < 24) {
            contactForCancel();
            return;
        }
    }

    if (!confirm("Are you sure you want to cancel this booking?")) return;

    // Route through edge function — RLS blocks direct UPDATE for non-admin users
    const { data, error } = await supabase.functions.invoke('customer-lookup', {
        body: { type: 'cancel_booking', email: currentUser.email, booking_id: id }
    });

    const cancelError = error || (data?.error ? { message: data.error } : null);

    if (cancelError) {
        alert("Cancellation failed: " + cancelError.message);
    } else {
        alert("Booking canceled successfully.");
        // Re-fetch customer credits via secure edge function
        const { data: updatedData } = await supabase.functions.invoke('customer-lookup', {
            body: { type: 'member_credits', email: currentUser.email }
        });
        if (updatedData) {
            membership.credits = updatedData.class_credits || 0;
            updateUIAllowance();
        }
        await loadUserBookings();
        await loadAllClasses();
        renderClassesForDay(selectedDateStr);
    }
}

// DOM Elements
const calDays = document.getElementById('cal-days');
const calMonthLabel = document.getElementById('cal-month-label');
const dayClassesContainer = document.getElementById('day-classes-container');
const currentDayLabel = document.getElementById('current-day-label');
const currentDateFull = document.getElementById('current-date-full');
const selectionCount = document.getElementById('selection-count');
const allowanceBadge = document.getElementById('allowance-badge');

// Auth Check & Init
async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    
    // In this flow, we might be using the "Anonymous" or "Email" user from localStorage if not signed in via Auth
    // But for a "Member" experience, we expect they have a record in `customers` table.
    const cachedUser = JSON.parse(localStorage.getItem('app_user') || '{}');
    const urlParams = new URLSearchParams(window.location.search);
    console.log("URL Params email:", urlParams.get('email'));
    console.log("Session email:", session?.user?.email);
    const email = session?.user?.email || urlParams.get('email') || cachedUser.email;
    console.log("Resolved email:", email);

    if (!email) {
        console.log("No user email found. Redirecting to landing.");
        window.location.href = '/#membership';
        return;
    }

    // Fetch Membership Data via secure Edge Function
    const { data: customer, error } = await supabase.functions.invoke('customer-lookup', {
        body: { type: 'member_profile', email }
    });

    if (error || !customer || customer.found === false) {
        console.error("Member profile not found.");
        alert("We couldn't find your membership profile. Please ensure you've purchased a membership.");
        window.location.href = '/#membership';
        return;
    }

    currentUser = customer;
    
    // Determine unlimited vs credit-pack membership
    const UNLIMITED_TYPES = ['1 Month Unlimited', '3 Months Unlimited', '6 Months Unlimited', '12 Months Unlimited', 'Founder'];
    const isUnlimited = UNLIMITED_TYPES.includes(customer.membership_type);

    // Check membership expiration for unlimited members
    if (isUnlimited && customer.membership_type !== 'Founder') {
        if (!customer.membership_expires_at || new Date(customer.membership_expires_at) < new Date()) {
            alert("Your membership has expired. Please renew to continue booking classes.");
            window.location.href = '/#membership';
            return;
        }
    }

    membership = {
        type: customer.membership_type,
        isUnlimited: isUnlimited,
        credits: isUnlimited ? Infinity : (customer.class_credits || 0),
        expires_at: customer.membership_expires_at,
        credits_expires_at: customer.credits_expires_at
    };

    // Check credit expiration BEFORE the access gate
    if (!isUnlimited && membership.credits > 0 && membership.credits_expires_at) {
        const creditsExpired = new Date(membership.credits_expires_at) < new Date();
        if (creditsExpired) {
            membership.credits = 0; // Treat expired credits as zero
        }
    }

    // Gate: non-paying users shouldn't access the member schedule
    if (!isUnlimited && membership.credits <= 0) {
        alert("You don't have an active membership or class credits. Please purchase a plan to access the class schedule.");
        window.location.href = '/#membership';
        return;
    }

    updateUIAllowance();
    document.getElementById('logout-btn').classList.remove('hidden');
    await loadAllClasses();
    await loadUserBookings(); // Fetch existing schedule
    renderCalendar();
    selectDay(selectedDateStr);
}

function updateUIAllowance() {
    if (membership.isUnlimited || membership.credits > 0) {
        if (membership.isUnlimited) {
            allowanceBadge.innerText = 'UNLIMITED ACCESS';
        } else if (membership.credits <= 0) {
            allowanceBadge.innerText = 'NO CREDITS — Purchase a class pack';
            allowanceBadge.classList.add('bg-red-900/20', 'border-red-500/30', 'text-red-400');
        } else {
            const daysLeft = membership.credits_expires_at 
                ? Math.max(0, Math.ceil((new Date(membership.credits_expires_at) - new Date()) / (1000*60*60*24))) 
                : null;
            allowanceBadge.innerText = `${membership.credits} CREDITS LEFT${daysLeft !== null ? ` · ${daysLeft}d remaining` : ''}`;
        }
        allowanceBadge.classList.remove('hidden');
    }
}

async function loadAllClasses() {
    const { data, error } = await supabase
        .from('class_availability')
        .select('*')
        .eq('is_private', false)
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true });

    if (!error) allClasses = data || [];
}

// Calendar Logic
function renderCalendar() {
    calDays.innerHTML = '';
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();
    
    calMonthLabel.innerText = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(currentMonthDate);

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Padding for first day of week
    for (let i = 0; i < firstDay; i++) {
        calDays.appendChild(document.createElement('div'));
    }

    const todayStr = new Date().toISOString().split('T')[0];

    for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(year, month, i);
        const dStr = d.toISOString().split('T')[0];
        
        const btn = document.createElement('button');
        btn.className = `h-10 w-10 flex items-center justify-center rounded-full text-xs transition-all duration-300`;
        btn.innerText = i;
        
        if (dStr < todayStr) {
            btn.className += ' text-gray-700 cursor-not-allowed';
        } else {
            if (dStr === selectedDateStr) {
                btn.className += ' bg-studio-gold text-black font-bold shadow-[0_0_15px_rgba(212,175,55,0.4)]';
            } else {
                btn.className += ' text-gray-400 hover:bg-white/10 hover:text-white';
            }
            btn.onclick = () => selectDay(dStr);
        }
        
        calDays.appendChild(btn);
    }
}

function selectDay(dateStr) {
    selectedDateStr = dateStr;
    const d = new Date(dateStr + 'T12:00:00'); // Midday to avoid TZ shifts
    
    currentDayLabel.innerText = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(d);
    currentDateFull.innerText = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(d);
    
    renderCalendar(); // Refresh selection UI
    renderClassesForDay(dateStr);
}

function renderClassesForDay(dateStr) {
    dayClassesContainer.innerHTML = '';
    const dayClasses = allClasses.filter(c => c.start_time.startsWith(dateStr));

    if (dayClasses.length === 0) {
        dayClassesContainer.innerHTML = `<div class="col-span-full flex flex-col items-center justify-center py-20 text-gray-600">
            <svg class="w-12 h-12 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            <p class="font-light italic">No classes scheduled for this date yet.</p>
        </div>`;
        return;
    }

    dayClasses.forEach(cls => {
        const isAlreadyBooked = upcomingBookings.some(b => b.class_id === cls.id);
        const isFull = cls.booked_count >= (cls.capacity || 6);
        const isSelected = selectedClasses.some(s => s.id === cls.id);
        
        const isUnavailable = isFull || isAlreadyBooked;
        
        const card = document.createElement('div');
        card.className = `relative p-6 rounded-2xl border transition-all duration-500 cursor-pointer group ${
            isAlreadyBooked ? 'bg-studio-gold/5 border-studio-gold/20 opacity-70 cursor-not-allowed' :
            isFull ? 'bg-black/40 border-white/5 opacity-50 cursor-not-allowed' : 
            isSelected ? 'bg-studio-gold/10 border-studio-gold shadow-[0_0_30px_rgba(212,175,55,0.15)]' : 
            'bg-white/5 border-white/10 hover:border-white/30'
        }`;
        
        card.onclick = () => !isUnavailable && toggleClassSelection(cls);

        card.innerHTML = `
            <div class="flex justify-between items-start mb-4">
                <div>
                    <p class="text-studio-gold text-[10px] uppercase tracking-widest font-bold mb-1">${new Date(cls.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
                    <h4 class="text-xl font-serif text-white">${cls.title}</h4>
                </div>
                ${isSelected ? `
                    <div class="w-6 h-6 rounded-full bg-studio-gold flex items-center justify-center">
                        <svg class="w-4 h-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                ` : isAlreadyBooked ? `
                    <div class="px-2 py-1 bg-studio-gold/20 text-studio-gold text-[10px] uppercase tracking-widest rounded font-bold">Booked</div>
                ` : ''}
            </div>
            <div class="flex items-center text-xs text-gray-500 font-light space-x-4">
                <span>Instructor: ${cls.instructor_name}</span>
                <span>•</span>
                <span>${isAlreadyBooked ? 'YOU ARE BOOKED' : isFull ? 'FULLY BOOKED' : `${(cls.capacity || 6) - cls.booked_count} slots left`}</span>
            </div>
        `;
        
        dayClassesContainer.appendChild(card);
    });
}

function toggleClassSelection(cls) {
    const idx = selectedClasses.findIndex(s => s.id === cls.id);
    if (idx > -1) {
        selectedClasses.splice(idx, 1);
    } else {
        // Allowance Check
        if (!membership.isUnlimited && (selectedClasses.length >= membership.credits)) {
            alert(`Wait! Your membership (${membership.type}) only allows for ${membership.credits} more classes this cycle. Please remove a selection or upgrade.`);
            return;
        }
        selectedClasses.push(cls);
    }
    
    selectionCount.innerText = selectedClasses.length;
    renderClassesForDay(selectedDateStr);
}

// Navigation
document.getElementById('cal-prev-month').onclick = () => {
    currentMonthDate.setMonth(currentMonthDate.getMonth() - 1);
    renderCalendar();
};
document.getElementById('cal-next-month').onclick = () => {
    currentMonthDate.setMonth(currentMonthDate.getMonth() + 1);
    renderCalendar();
};

document.getElementById('day-prev').onclick = () => {
    const d = new Date(selectedDateStr + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    selectDay(d.toISOString().split('T')[0]);
};
document.getElementById('day-next').onclick = () => {
    const d = new Date(selectedDateStr + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    selectDay(d.toISOString().split('T')[0]);
};

// Modal Logic
window.closeReviewModal = () => document.getElementById('review-modal').classList.add('hidden');

document.getElementById('review-btn').onclick = () => {
    if (selectedClasses.length === 0) {
        alert("Please select at least one class to review.");
        return;
    }
    
    const modal = document.getElementById('review-modal');
    const list = document.getElementById('selected-list');
    const msg = document.getElementById('modal-allowance-msg');
    
    list.innerHTML = '';
    selectedClasses.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    
    selectedClasses.forEach(cls => {
        const item = document.createElement('div');
        item.className = 'flex justify-between items-center bg-white/5 border border-white/10 p-5 rounded-2xl';
        item.innerHTML = `
            <div>
                <p class="text-studio-gold text-[10px] uppercase tracking-widest font-bold">${new Date(cls.start_time).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} @ ${new Date(cls.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
                <h5 class="text-white font-serif">${cls.title}</h5>
            </div>
            <button class="text-gray-500 hover:text-red-400 transition-colors" onclick="removeSelection('${cls.id}')">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
        `;
        list.appendChild(item);
    });

    const remaining = membership.isUnlimited ? 'Unlimited' : (membership.credits - selectedClasses.length);
    if (!membership.isUnlimited && remaining > 0) {
        msg.innerHTML = `You have <span class="text-studio-gold font-bold">${remaining} classes</span> remaining in your ${membership.type} quota for this period.`;
    } else if (!membership.isUnlimited) {
        msg.innerText = `You've used your full membership allowance. Excellent hustle!`;
    } else {
        msg.innerText = `Unlimited access active. Book as many slots as you like!`;
    }

    document.getElementById('modal-total-count').innerText = `${selectedClasses.length} Classes`;
    modal.classList.remove('hidden');
};

window.removeSelection = (id) => {
    selectedClasses = selectedClasses.filter(s => s.id !== id);
    selectionCount.innerText = selectedClasses.length;
    if (selectedClasses.length === 0) closeReviewModal();
    else document.getElementById('review-btn').click(); // Refresh modal
    renderClassesForDay(selectedDateStr);
};

document.getElementById('confirm-booking-btn').onclick = async () => {
    const btn = document.getElementById('confirm-booking-btn');
    btn.innerText = "Processing...";
    btn.disabled = true;

    try {
        const { data: { user } } = await supabase.auth.getUser();
        
        const payMethod = membership.isUnlimited ? 'membership' : 'credits';
        const failedClasses = [];
        let successCount = 0;

        // Insert one at a time so one full/duplicate class doesn't kill the batch
        for (const cls of selectedClasses) {
            const { error } = await supabase.from('bookings').insert({
                class_id: cls.id,
                user_id: user?.id || null,
                guest_name: currentUser.name,
                guest_email: currentUser.email,
                payment_method: payMethod,
                payment_status: 'paid'
            });

            if (error) {
                failedClasses.push({ title: cls.title, reason: error.message });
            } else {
                successCount++;
            }
        }

        if (failedClasses.length > 0 && successCount === 0) {
            // All failed
            const reasons = failedClasses.map(f => `• ${f.title}: ${f.reason}`).join('\n');
            throw new Error(`All bookings failed:\n${reasons}`);
        }

        if (failedClasses.length > 0) {
            // Partial success
            const reasons = failedClasses.map(f => `• ${f.title}: ${f.reason}`).join('\n');
            alert(`${successCount} class(es) booked successfully, but ${failedClasses.length} failed:\n${reasons}`);
        }

        // Email alerts handled automatically by database webhook on bookings INSERT

        document.getElementById('review-modal').classList.add('hidden');
        document.getElementById('confirmation-popup').classList.remove('hidden');

    } catch (err) {
        console.error(err);
        if (err.code === '23505') {
            alert("Booking failed: You have already booked one or more of these classes.");
        } else {
            alert("Booking failed: " + err.message);
        }
        btn.innerText = "Confirm Booking";
        btn.disabled = false;
    }
};

document.getElementById('logout-btn').onclick = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
};

// Initialize
document.addEventListener('DOMContentLoaded', init);
