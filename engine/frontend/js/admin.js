import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const supabaseUrl = 'YOUR_SUPABASE_URL'
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY'
const orgId = localStorage.getItem('impersonate_org_id') || ORG_ID_PLACEHOLDER
const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Global State (Moved to top to prevent hoisting issues)
let allAdminEvents = [];
let allAdminBookings = [];
let currentMonthDate = new Date(); // Tracks the currently displayed month
let selectedAdminDateStr = new Date().toISOString().split('T')[0];

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const waitingScreen = document.getElementById('waiting-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const logoutBtn = document.getElementById('logout-btn');

const rosterTbody = document.getElementById('roster-tbody');
const customersTbody = document.getElementById('customers-tbody');
const tabEvents = document.getElementById('tab-events');
const tabCustomers = document.getElementById('tab-customers');
const viewEvents = document.getElementById('view-events');
const viewCustomers = document.getElementById('view-customers');
const tabManage = document.getElementById('tab-manage');
const viewManage = document.getElementById('view-manage');

// Auth State
supabase.auth.onAuthStateChange(async (event, session) => {
    // Magic links come back as hashes like #access_token=..., so we should clear the URL after processing
    if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    // Check if the user opted to be remembered when logging in
    // If not, and they close the tab, Supabase will keep them logged in anyway by default.
    // To truly handle "don't remember", we would normally set the session to SessionStorage.
    // However, since Supabase handles its own token refresh via LocalStorage by default, 
    // we'll rely on its native state persistence to fix the "getting logged out" bug.

    if (session && (session.user.email === 'admin@example.com' || session.user.email === 'YOUR_SUPER_ADMIN_EMAIL')) {
        loginScreen.classList.add('hidden');
        dashboardScreen.classList.remove('hidden');
        logoutBtn.classList.remove('hidden');
        
        // Only load dashboard if it isn't already loaded to prevent duplicate loads on token refresh
        if (allAdminEvents.length === 0) {
            loadDashboard();
        }
    } else if (event === 'SIGNED_OUT') {
        loginScreen.classList.remove('hidden');
        waitingScreen.classList.add('hidden');
        dashboardScreen.classList.add('hidden');
        logoutBtn.classList.add('hidden');
    } else if (!session) {
        // Double check session in case onAuthStateChange fired too early
        const { data } = await supabase.auth.getSession();
        if (data.session && (data.session.user.email === 'admin@example.com' || data.session.user.email === 'YOUR_SUPER_ADMIN_EMAIL')) {
            loginScreen.classList.add('hidden');
            waitingScreen.classList.add('hidden');
            dashboardScreen.classList.remove('hidden');
            logoutBtn.classList.remove('hidden');
            if (allAdminEvents.length === 0) loadDashboard();
        } else {
            // Only revert to login screen if we AREN'T currently waiting for a magic link
            if (waitingScreen.classList.contains('hidden')) {
                loginScreen.classList.remove('hidden');
                dashboardScreen.classList.add('hidden');
                logoutBtn.classList.add('hidden');
            }
        }
    }
});

// Force check session on page load just in case the event listener missed it
document.addEventListener('DOMContentLoaded', async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session && (data.session.user.email === 'admin@example.com' || data.session.user.email === 'YOUR_SUPER_ADMIN_EMAIL')) {
        loginScreen.classList.add('hidden');
        dashboardScreen.classList.remove('hidden');
        logoutBtn.classList.remove('hidden');
        if (allAdminEvents.length === 0) loadDashboard();
    }
});


// Login with Magic Link
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const errObj = document.getElementById('login-error');
    const successObj = document.getElementById('login-success');
    const btn = document.getElementById('login-btn');
    
    errObj.classList.add('hidden');
    successObj.classList.add('hidden');
    btn.innerText = "Sending...";
    
    if(email !== 'admin@example.com' && email !== 'YOUR_SUPER_ADMIN_EMAIL') {
        errObj.innerText = 'Unauthorized email address.';
        errObj.classList.remove('hidden');
        btn.innerText = "Send Login Link";
        return;
    }

    console.log("Attempting magic link for:", email);
    
    try {
        const { error } = await supabase.auth.signInWithOtp({ 
            email,
            options: {
                emailRedirectTo: window.location.origin + window.location.pathname
            }
        });

        if (error) {
            console.error("Supabase Auth Error:", error);
            errObj.innerText = error.message;
            errObj.classList.remove('hidden');
            btn.innerText = "Send Magic Link";
        } else {
            console.log("Magic link sent successfully");
            document.getElementById('display-email').innerText = email;
            loginScreen.classList.add('hidden');
            waitingScreen.classList.remove('hidden');
        }
    } catch (err) {
        console.error("Unexpected Error:", err);
        errObj.innerText = "An unexpected error occurred. Check console.";
        errObj.classList.remove('hidden');
        btn.innerText = "Send Magic Link";
    }
});

// Logout
logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
});

// Tabs
tabEvents.addEventListener('click', () => {
    tabEvents.classList.replace('text-gray-500', 'text-organization-gold');
    tabEvents.classList.add('border-b-2', 'border-organization-gold');
    
    tabCustomers.classList.replace('text-organization-gold', 'text-gray-500');
    tabCustomers.classList.remove('border-b-2', 'border-organization-gold');
    
    tabManage.classList.replace('text-organization-gold', 'text-gray-500');
    tabManage.classList.remove('border-b-2', 'border-organization-gold');
    
    viewEvents.classList.remove('hidden');
    viewCustomers.classList.add('hidden');
    viewManage.classList.add('hidden');
});

tabManage.addEventListener('click', () => {
    tabManage.classList.replace('text-gray-500', 'text-organization-gold');
    tabManage.classList.add('border-b-2', 'border-organization-gold');
    
    tabEvents.classList.replace('text-organization-gold', 'text-gray-500');
    tabEvents.classList.remove('border-b-2', 'border-organization-gold');
    
    tabCustomers.classList.replace('text-organization-gold', 'text-gray-500');
    tabCustomers.classList.remove('border-b-2', 'border-organization-gold');
    
    viewManage.classList.remove('hidden');
    viewEvents.classList.add('hidden');
    viewCustomers.classList.add('hidden');
    loadScheduleManager();
});

tabCustomers.addEventListener('click', () => {
    tabCustomers.classList.replace('text-gray-500', 'text-organization-gold');
    tabCustomers.classList.add('border-b-2', 'border-organization-gold');
    
    tabEvents.classList.replace('text-organization-gold', 'text-gray-500');
    tabEvents.classList.remove('border-b-2', 'border-organization-gold');
    
    tabManage.classList.replace('text-organization-gold', 'text-gray-500');
    tabManage.classList.remove('border-b-2', 'border-organization-gold');
    
    viewCustomers.classList.remove('hidden');
    viewEvents.classList.add('hidden');
    viewManage.classList.add('hidden');
    loadCustomers();
});

// Removed duplicate declarations
// let allAdminEvents = [];
// ...

document.getElementById('admin-calendar-prev').onclick = () => {
    currentMonthDate.setMonth(currentMonthDate.getMonth() - 1);
    renderAdminCalendarDays();
};
document.getElementById('admin-calendar-next').onclick = () => {
    currentMonthDate.setMonth(currentMonthDate.getMonth() + 1);
    renderAdminCalendarDays();
};

// Load Dashboard
async function loadDashboard() {
    let eventsQuery = supabase.from('events').select('*').order('start_time', { ascending: true });
    let bookingsQuery = supabase.from('bookings').select('event_id, status').neq('status', 'cancelled');
    
    if (orgId) {
        eventsQuery = eventsQuery.eq('org_id', orgId);
        bookingsQuery = bookingsQuery.eq('org_id', orgId);
    }

    const [eventsRes, bookingsRes] = await Promise.all([
        eventsQuery,
        bookingsQuery
    ]);

    if (eventsRes.error) return console.error(eventsRes.error);
    
    allAdminEvents = eventsRes.data || [];
    allAdminBookings = bookingsRes.data || [];
    
    renderAdminCalendarDays();
    renderAdminEventsForDate(selectedAdminDateStr);
}

window.selectAdminDate = (dateStr) => {
    selectedAdminDateStr = dateStr;
    renderAdminCalendarDays();
    renderAdminEventsForDate(dateStr);
    
    // Clear roster until a event is clicked
    document.getElementById('roster-tbody').innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">Select a event to view roster</td></tr>';
}

function renderAdminCalendarDays() {
    const daysContainer = document.getElementById('admin-calendar-days');
    const monthLabel = document.getElementById('admin-calendar-month-label');
    if(!daysContainer || !monthLabel) return;
    
    daysContainer.innerHTML = '';
    
    // Update Label
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    monthLabel.textContent = `${monthNames[currentMonthDate.getMonth()]} ${currentMonthDate.getFullYear()}`;
    
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();
    
    const firstDay = new Date(year, month, 1).getDay(); // 0 (Sun) to 6 (Sat)
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Fill empty spots for first week
    for(let i=0; i<firstDay; i++) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'w-full h-10';
        daysContainer.appendChild(emptyDiv);
    }
    
    const todayStr = new Date().toISOString().split('T')[0];
    
    for(let i=1; i<=daysInMonth; i++) {
        // Construct YYYY-MM-DD safely
        const d = new Date(year, month, i);
        // adjust for local timezone offset when getting ISO string
        const offset = d.getTimezoneOffset() * 60000;
        const localDateStr = (new Date(d.getTime() - offset)).toISOString().split('T')[0];
        
        const isSelected = localDateStr === selectedAdminDateStr;
        const isToday = localDateStr === todayStr;
        
        let bgEvent = 'bg-white/5 border border-white/5 text-gray-300 hover:border-organization-gold/50';
        if (isSelected) {
            bgEvent = 'bg-organization-gold text-black border-organization-gold shadow-[0_0_10px_rgba(212,175,55,0.3)]';
        } else if (isToday) {
            bgEvent = 'bg-white/10 border border-white/30 text-white font-bold';
        }
        
        const btn = document.createElement('button');
        btn.onclick = () => selectAdminDate(localDateStr);
        btn.className = `flex items-center justify-center h-10 rounded-lg transition-all cursor-pointer ${bgEvent} text-sm`;
        btn.textContent = i;
        
        daysContainer.appendChild(btn);
    }
}

function renderAdminEventsForDate(dateStr) {
    const pillsContainer = document.getElementById('admin-event-pills');
    if (!pillsContainer) return;
    
    const filtered = allAdminEvents.filter(c => c.start_time.startsWith(dateStr));
    
    if (filtered.length === 0) {
        pillsContainer.innerHTML = `<div class="text-gray-500 text-sm py-2">No events scheduled for this day.</div>`;
        return;
    }
    
    pillsContainer.innerHTML = '';
    filtered.forEach(cls => {
        const timeStr = new Date(cls.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const bookedCount = allAdminBookings.filter(b => b.event_id === cls.id).length;
        const capacityStr = `${bookedCount}/${cls.capacity || 6}`;
        const isFull = bookedCount >= (cls.capacity || 6);
        
        const btn = document.createElement('button');
        btn.onclick = () => {
            // Remove active state from all pills
            Array.from(pillsContainer.children).forEach(b => {
                b.classList.remove('bg-white', 'text-black');
                b.classList.add('bg-white/5', 'text-gray-300');
            });
            // Add active state to this pill
            btn.classList.remove('bg-white/5', 'text-gray-300');
            btn.classList.add('bg-white', 'text-black');
            
            loadRoster(cls.id);
        };
        
        const baseEvent = `px-6 py-3 rounded-full border text-sm transition-colors cursor-pointer flex items-center space-x-2`;
        const inactiveEvent = isFull ? `bg-red-900/20 border-red-500/30 text-red-200 hover:bg-red-900/40` : `bg-white/5 border-white/10 text-gray-300 hover:bg-white/10`;
        
        btn.className = `${baseEvent} ${inactiveEvent}`;
        
        btn.innerHTML = `
            <span class="font-bold">${timeStr}</span> 
            <span>${cls.title}</span>
            <span class="text-[10px] bg-black/50 px-2 py-0.5 rounded-full ml-2 ${isFull ? 'text-red-400' : 'text-organization-gold'}">${capacityStr}</span>
        `;
        
        pillsContainer.appendChild(btn);
    });
}

// Load Roster
window.loadRoster = async (eventId) => {
    rosterTbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">Loading...</td></tr>';
    
    const { data: bookings, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });

    if (error) {
        rosterTbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-red-500">Error loading roster</td></tr>';
        return;
    }

    if (bookings.length === 0) {
        rosterTbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">No bookings for this event yet.</td></tr>';
        return;
    }

    rosterTbody.innerHTML = '';
    bookings.forEach(b => {
        const statusBadge = b.payment_status === 'paid' 
            ? '<span class="bg-green-900 text-green-300 px-2 py-1 rounded text-xs uppercase tracking-widest">Paid</span>'
            : '<span class="bg-yellow-900 text-yellow-300 px-2 py-1 rounded text-xs uppercase tracking-widest">Pending</span>';

        const methodBadge = b.payment_method === 'cash' ? 'CASH/STUDIO' : 'STRIPE';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="px-6 py-4 text-white">${b.guest_name}</td>
            <td class="px-6 py-4 text-gray-400">${b.guest_email}</td>
            <td class="px-6 py-4 text-gray-400">${methodBadge}</td>
            <td class="px-6 py-4">${statusBadge}</td>
            <td class="px-6 py-4 text-right space-x-2">
                ${b.payment_status === 'pending' ? `<button onclick="markPaid('${b.id}', '${b.event_id}')" class="text-xs text-green-400 hover:text-green-300 uppercase tracking-widest">Mark Paid</button>` : ''}
                <button onclick="cancelBooking('${b.id}', '${b.event_id}')" class="text-xs text-red-400 hover:text-red-300 uppercase tracking-widest ml-4">Cancel</button>
            </td>
        `;
        rosterTbody.appendChild(row);
    });
};

// Actions
window.markPaid = async (bookingId, eventId) => {
    if(!confirm('Mark this booking as paid?')) return;
    await supabase.from('bookings').update({ payment_status: 'paid' }).eq('id', bookingId);
    loadRoster(eventId);
};

window.cancelBooking = async (bookingId, eventId) => {
    if(!confirm('Are you sure you want to cancel and remove this booking?')) return;
    await supabase.from('bookings').delete().eq('id', bookingId);
    loadRoster(eventId);
};

// Manage Memberships
const memModal = document.getElementById('membership-modal');
const memTypeSelect = document.getElementById('membership-type');
const memExpiresInput = document.getElementById('membership-expires');

// Customer Directory
async function loadCustomers() {
    customersTbody.innerHTML = '<tr><td colspan="8" class="px-6 py-8 text-center text-gray-500">Loading...</td></tr>';
    
    // Fetch bookings to count totals
    const { data: bookings, error: bErr } = await supabase.from('bookings').select('guest_name, guest_email');
    if(bErr) return console.error(bErr);

    // Fetch memberships & profiles
    const { data: memData, error: mErr } = await supabase.from('customers').select('*');
    if(mErr) return console.error(mErr);

    const memberships = {};
    if (memData) memData.forEach(m => memberships[m.email.toLowerCase()] = m);

    // Aggregate Bookings
    const customersMap = {};
    bookings.forEach(b => {
        if(!b.guest_email) return;
        const key = b.guest_email.toLowerCase().trim();
        if(!customersMap[key]) customersMap[key] = { name: b.guest_name, email: key, count: 0 };
        customersMap[key].count++;
    });

    // Merge people who signed up for waitlist but never booked a event
    if (memData) {
        memData.forEach(m => {
            const key = m.email.toLowerCase().trim();
            if(!customersMap[key]) customersMap[key] = { name: m.name, email: key, count: 0 };
        });
    }

    const arr = Object.values(customersMap).sort((a,b) => b.count - a.count);
    window.customerData = arr; // For export
    window.fullMembershipsData = memberships; // Global reference for details modal

    window.renderCustomersList = (searchQuery = '') => {
        customersTbody.innerHTML = '';
        const lowerQuery = searchQuery.toLowerCase();
        
        const filtered = arr.filter(c => {
            const mem = memberships[c.email] || {};
            return c.name.toLowerCase().includes(lowerQuery) || 
                   c.email.toLowerCase().includes(lowerQuery) || 
                   (mem.phone && mem.phone.includes(lowerQuery));
        });

        if (filtered.length === 0) {
            customersTbody.innerHTML = '<tr><td colspan="7" class="px-8 py-12 text-center text-gray-500">No customers found.</td></tr>';
            return;
        }

        filtered.forEach(c => {
            const mem = memberships[c.email] || { membership_type: 'A La Carte', membership_expires_at: null, phone: '', waiver_signed_at: null };
            const phoneDisplay = mem.phone ? mem.phone : '<span class="text-gray-600">-</span>';

            let waiverBadge = '<span class="text-[10px] bg-red-900/40 text-red-400 border border-red-500/30 px-2 py-1 rounded">Missing Waiver</span>';
            if (mem.waiver_signed_at) {
                const signedDate = new Date(mem.waiver_signed_at);
                const oneYearAgo = new Date();
                oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                
                if (signedDate < oneYearAgo) {
                    waiverBadge = '<span class="text-[10px] bg-red-900/40 text-red-400 border border-red-500/30 px-2 py-1 rounded">Expired</span>';
                } else {
                    const expDate = new Date(signedDate);
                    expDate.setFullYear(expDate.getFullYear() + 1);
                    const expStr = expDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                    waiverBadge = `<span class="text-[10px] bg-green-900/40 text-green-400 border border-green-500/30 px-2 py-1 rounded">Valid (${expStr})</span>`;
                }
            }

            const tr = document.createElement('tr');
            tr.className = 'cursor-pointer hover:bg-white/5 transition-colors group';
            tr.onclick = (e) => {
                if(e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
                openCustomerDetailsModal(c.email);
            };
            
            tr.innerHTML = `
                <td class="px-8 py-5 text-white font-medium group-hover:text-organization-gold transition-colors">${c.name}</td>
                <td class="px-8 py-5 text-gray-400">${c.email}</td>
                <td class="px-8 py-5 text-gray-400">${phoneDisplay}</td>
                <td class="px-8 py-5 text-organization-gold">${c.count}</td>
                <td class="px-8 py-5 text-white">${mem.membership_type}</td>
                <td class="px-8 py-5">${waiverBadge}</td>
                <td class="px-8 py-5 text-right space-x-4">
                    <button class="manage-btn text-[10px] text-gray-400 hover:text-organization-gold uppercase tracking-[0.2em] font-semibold transition-colors">Manage</button>
                    <button class="delete-btn text-[10px] text-red-900 hover:text-red-400 uppercase tracking-[0.2em] font-semibold transition-colors">Delete</button>
                </td>
            `;

            // Use event listeners instead of onclick to avoid string escaping issues
            tr.querySelector('.manage-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                editMembership(c.email, c.name, mem.membership_type, mem.membership_expires_at || '');
            });
            tr.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteCustomer(c.email);
            });

            customersTbody.appendChild(tr);
        });
    };

    window.renderCustomersList();
}

// Auto-calculate expiration date based on membership type selection
memTypeSelect.addEventListener('change', (e) => {
    const type = e.target.value;
    const now = new Date();
    
    if (type === 'A La Carte') {
        // Same day pass (24 hours)
        now.setDate(now.getDate() + 1);
        memExpiresInput.value = now.toISOString().split('T')[0];
    } else if (type === '1 Month') {
        now.setMonth(now.getMonth() + 1);
        memExpiresInput.value = now.toISOString().split('T')[0];
    } else if (type === '2 Months') {
        now.setMonth(now.getMonth() + 2);
        memExpiresInput.value = now.toISOString().split('T')[0];
    } else if (type === '3 Months') {
        now.setMonth(now.getMonth() + 3);
        memExpiresInput.value = now.toISOString().split('T')[0];
    } else if (type === 'Founder') {
        // Lifetime - set to far future or leave blank
        now.setFullYear(now.getFullYear() + 100);
        memExpiresInput.value = now.toISOString().split('T')[0];
    }
});

window.editMembership = (email, name, type, expires) => {
    memModal.classList.remove('hidden');
    document.getElementById('membership-email').value = email;
    document.getElementById('membership-customer-name').innerText = name;
    
    memTypeSelect.value = type;
    
    // If they already have an expiration, load it. If not, auto-calculate it based on current type.
    if (expires && expires !== 'null' && expires !== 'undefined') {
        memExpiresInput.value = expires;
    } else {
        memTypeSelect.dispatchEvent(new Event('change'));
    }
};

document.getElementById('close-membership-btn').addEventListener('click', () => {
    memModal.classList.add('hidden');
});

document.getElementById('membership-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('membership-save-btn');
    btn.innerText = "Saving...";
    
    const email = document.getElementById('membership-email').value;
    const name = document.getElementById('membership-customer-name').innerText;
    const type = document.getElementById('membership-type').value;
    const expires = document.getElementById('membership-expires').value || null;

    try {
        const { error } = await supabase.from('customers').upsert({
            email: email,
            name: name,
            membership_type: type,
            membership_expires_at: expires
        });
        if(error) throw error;
        
        memModal.classList.add('hidden');
        loadCustomers();
    } catch(err) {
        alert("Error saving membership: " + err.message);
    } finally {
        btn.innerText = "Update Membership";
    }
});

// Delete Customer
window.deleteCustomer = async (email) => {
    if(!confirm(`Are you absolutely sure you want to delete the customer ${email}? This will also wipe out their membership history.`)) return;
    
    // Delete from customers table
    const { error: cErr } = await supabase.from('customers').delete().eq('email', email);
    
    // Delete from bookings table to clear their roster history
    const { error: bErr } = await supabase.from('bookings').delete().eq('guest_email', email);
    
    if (cErr || bErr) {
        alert("Error deleting customer: " + (cErr?.message || bErr?.message));
    } else {
        loadCustomers();
    }
};

// Export CSV
document.getElementById('export-csv-btn').addEventListener('click', () => {
    if(!window.customerData) return;
    let csv = 'Name,Email,Phone,Total Bookings\n';
    window.customerData.forEach(c => {
        csv += `"${c.name}","${c.email}","",${c.count}\n`; // We can map phone properly later if needed in export
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `app_customers_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
});

// Add Customer Management
const addCustomerModal = document.getElementById('add-customer-modal');

document.getElementById('add-customer-btn').addEventListener('click', async () => {
    addCustomerModal.classList.remove('hidden');
    document.getElementById('add-customer-form').reset();
    
    // Fetch upcoming events for assignment
    const eventSelector = document.getElementById('add-customer-event');
    eventSelector.innerHTML = '<option value="">-- Do Not Assign --</option>';
    
    const { data: events, error } = await supabase
        .from('events')
        .select('*')
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true });

    if (!error && events) {
        events.forEach(cls => {
            const date = new Date(cls.start_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
            const opt = document.createElement('option');
            opt.value = cls.id;
            opt.innerText = `${date} - ${cls.title} (${cls.instructor_name})`;
            eventSelector.appendChild(opt);
        });
    }
});

document.getElementById('close-customer-btn').addEventListener('click', () => {
    addCustomerModal.classList.add('hidden');
});

document.getElementById('add-customer-tier').addEventListener('change', (e) => {
    const tier = e.target.value;
    const expiresInput = document.getElementById('add-customer-expires');
    const now = new Date();
    
    if (tier === '1 Month') now.setMonth(now.getMonth() + 1);
    else if (tier === '2 Months') now.setMonth(now.getMonth() + 2);
    else if (tier === '3 Months') now.setMonth(now.getMonth() + 3);
    else if (tier === 'Founder') now.setFullYear(now.getFullYear() + 100);
    else return expiresInput.value = ''; // A La Carte
    
    expiresInput.value = now.toISOString().split('T')[0];
});

document.getElementById('add-customer-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('add-customer-save-btn');
    btn.innerText = "Saving...";
    btn.disabled = true;

    const name = document.getElementById('add-customer-name').value;
    const email = document.getElementById('add-customer-email').value;
    const phone = document.getElementById('add-customer-phone').value;
    const tier = document.getElementById('add-customer-tier').value;
    const eventId = document.getElementById('add-customer-event').value;
    let expires = document.getElementById('add-customer-expires').value;
    
    if(!expires && tier !== 'A La Carte') {
        const now = new Date();
        now.setMonth(now.getMonth() + parseInt(tier) || 1);
        expires = now.toISOString();
    }

    try {
        const { error } = await supabase.from('customers').upsert({
            email: email,
            name: name,
            phone: phone,
            membership_type: tier,
            membership_expires_at: expires || null
        });

        if (error) throw error;

        // If they assigned to a event (Walk-in functionality mapped into profile creation)
        if (eventId) {
            const { error: bErr } = await supabase.from('bookings').insert([{
                event_id: eventId,
                guest_name: name,
                guest_email: email,
                payment_method: 'cash', // Admin-added so assumed handled in-person or via membership
                payment_status: tier === 'A La Carte' ? 'pending' : 'paid', 
            }]);
            if (bErr && bErr.code !== '23505') throw bErr;
        }

        addCustomerModal.classList.add('hidden');
        document.getElementById('add-customer-form').reset();
        loadCustomers();
        alert('Profile saved and updated successfully!');
    } catch(err) {
        alert('Error: ' + err.message);
    } finally {
        btn.innerText = "Create Profile";
        btn.disabled = false;
    }
});

// Removed standalone Walk-in Management as it is now merged into Add Customer Profile

// Manage Schedule
async function loadScheduleManager() {
    const tbody = document.getElementById('schedule-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">Loading...</td></tr>';
    
    const { data: events, error } = await supabase
        .from('events')
        .select('*')
        .gte('start_time', new Date().toISOString()) // Only show upcoming
        .order('start_time', { ascending: true });

    if (error) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-red-500">Error loading schedule</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    window.eventDataCache = events;

    events.forEach(cls => {
        const date = new Date(cls.start_time).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="px-4 py-3 text-organization-gold whitespace-nowrap">${date}</td>
            <td class="px-4 py-3 text-white font-medium">${cls.title}</td>
            <td class="px-4 py-3 text-gray-400">${cls.instructor_name}</td>
            <td class="px-4 py-3 text-green-400">$${cls.price}</td>
            <td class="px-4 py-3 text-gray-400">${cls.capacity}</td>
            <td class="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                <button onclick="editEvent('${cls.id}')" class="text-xs text-blue-400 hover:text-blue-300 uppercase tracking-widest">Edit</button>
                <button onclick="deleteEvent('${cls.id}')" class="text-xs text-red-400 hover:text-red-300 uppercase tracking-widest ml-3">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Form Submission (Create / Edit)
document.getElementById('event-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('manage-save-btn');
    btn.innerText = "Saving...";
    btn.disabled = true;

    const id = document.getElementById('manage-id').value;
    const title = document.getElementById('manage-title').value;
    const instructor = document.getElementById('manage-instructor').value;
    const price = parseFloat(document.getElementById('manage-price').value);
    const capacity = parseInt(document.getElementById('manage-capacity').value);
    const dateVal = document.getElementById('manage-date').value;
    const timeVal = document.getElementById('manage-time').value;
    const duration = parseInt(document.getElementById('manage-duration').value);
    
    const isRecurring = document.getElementById('manage-recurring').checked;
    const weeks = parseInt(document.getElementById('manage-weeks').value) || 4;

    // Construct Dates
    const startDateTime = new Date(`${dateVal}T${timeVal}`);
    const endDateTime = new Date(startDateTime.getTime() + duration * 60000);

    const baseRecord = {
        title,
        instructor_name: instructor,
        price,
        capacity
    };

    try {
        if (id) {
            // Edit existing
            const { error } = await supabase.from('events').update({
                ...baseRecord,
                start_time: startDateTime.toISOString(),
                end_time: endDateTime.toISOString()
            }).eq('id', id);
            if(error) throw error;
        } else {
            // Create new
            const recordsToInsert = [];
            let loops = isRecurring ? weeks : 1;
            
            for(let i=0; i<loops; i++) {
                const s = new Date(startDateTime.getTime() + (i * 7 * 24 * 60 * 60 * 1000));
                const e = new Date(endDateTime.getTime() + (i * 7 * 24 * 60 * 60 * 1000));
                recordsToInsert.push({
                    ...baseRecord,
                    start_time: s.toISOString(),
                    end_time: e.toISOString(),
                    org_id: orgId
                });
            }

            const { error } = await supabase.from('events').insert(recordsToInsert);
            if(error) throw error;
        }

        resetManageForm();
        loadScheduleManager();
        loadDashboard(); // Refresh the dropdown
    } catch (err) {
        alert('Error saving event: ' + err.message);
    } finally {
        btn.innerText = "Save";
        btn.disabled = false;
    }
});

window.editEvent = (id) => {
    const cls = window.eventDataCache.find(c => c.id === id);
    if(!cls) return;

    document.getElementById('manage-form-title').innerText = "Edit Event";
    document.getElementById('manage-id').value = cls.id;
    document.getElementById('manage-title').value = cls.title;
    document.getElementById('manage-instructor').value = cls.instructor_name;
    document.getElementById('manage-price').value = cls.price;
    document.getElementById('manage-capacity').value = cls.capacity;

    const st = new Date(cls.start_time);
    const et = new Date(cls.end_time);
    
    // YYYY-MM-DD
    document.getElementById('manage-date').value = st.toISOString().split('T')[0];
    
    // HH:MM
    document.getElementById('manage-time').value = st.toTimeString().substring(0,5);
    
    // Duration
    const diffMins = Math.round((et - st) / 60000);
    document.getElementById('manage-duration').value = diffMins.toString();

    // Hide recurring group when editing single event
    document.getElementById('recurring-group').classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.deleteEvent = async (id) => {
    if(!confirm('Are you sure you want to delete this event? This will also cancel any bookings associated with it!')) return;
    
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) {
        alert('Error deleting event: ' + error.message);
    } else {
        loadScheduleManager();
        loadDashboard();
    }
};

window.resetManageForm = () => {
    document.getElementById('event-form').reset();
    document.getElementById('manage-id').value = '';
    document.getElementById('manage-form-title').innerText = "Add New Event";
    document.getElementById('recurring-group').classList.remove('hidden');
    document.getElementById('recurring-weeks-group').classList.add('hidden');
};

window.bulkGenerateSchedule = async () => {
    if(!confirm('This will automatically generate the M&W and T&Th schedule for the next 12 weeks. Proceed?')) return;
    
    const btn = document.querySelector('button[onclick="bulkGenerateSchedule()"]');
    const oldText = btn.innerText;
    btn.innerText = "Generating...";
    btn.disabled = true;

    try {
        const recordsToInsert = [];
        const weeks = 12;
        const now = new Date();
        
        // Find the next Monday
        let nextMonday = new Date();
        nextMonday.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7));
        if(nextMonday.getDay() === 0) nextMonday.setDate(nextMonday.getDate() + 1); // fallback if it lands weirdly

        // Schedule Template
        const schedule = [
            // M & W Morning
            { daysOff: [0, 2], times: [[6,0], [7,20], [8,30]], duration: 60, title: "Morning Flow", price: 30 },
            // M & W Evening
            { daysOff: [0, 2], times: [[16,0], [17,15]], duration: 60, title: "Evening Sculpt", price: 30 },
            // T & Th Morning
            { daysOff: [1, 3], times: [[8,0], [9,15]], duration: 60, title: "Morning Flow", price: 30 },
            // T & Th Evening
            { daysOff: [1, 3], times: [[17,0], [18,15], [19,30]], duration: 60, title: "Evening Sculpt", price: 30 },
            // Lunch M-Th
            { daysOff: [0, 1, 2, 3], times: [[12,30]], duration: 30, title: "Lunch Express", price: 25 }
        ];

        for (let w = 0; w < weeks; w++) {
            for (const group of schedule) {
                for (const offset of group.daysOff) {
                    const targetDate = new Date(nextMonday);
                    targetDate.setDate(targetDate.getDate() + offset + (w * 7));
                    
                    for (const [h, m] of group.times) {
                        const start = new Date(targetDate);
                        start.setHours(h, m, 0, 0);
                        const end = new Date(start);
                        end.setMinutes(end.getMinutes() + group.duration);
                        
                        recordsToInsert.push({
                            title: group.title,
                            description: "",
                            capacity: 6,
                            instructor_name: "Staff",
                            price: group.price,
                            start_time: start.toISOString(),
                            end_time: end.toISOString(),
                            org_id: orgId
                        });
                    }
                }
            }
        }

        const { error } = await supabase.from('events').insert(recordsToInsert);
        if (error) throw error;
        
        alert(`Successfully generated ${recordsToInsert.length} events!`);
        loadScheduleManager();
        loadDashboard();
    } catch(err) {
        alert('Error: ' + err.message);
    } finally {
        btn.innerText = oldText;
        btn.disabled = false;
    }
};
