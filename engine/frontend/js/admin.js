import { supabase, supabaseUrl, supabaseAnonKey } from './supabase-config.js'

// --- OTP LOGIN FLOW ---
let pendingEmail = ''; // Store email between send and verify steps

function initLogin() {
    // Step 1: Send OTP code
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const emailInput = document.getElementById('login-email');
            const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
            
            const errObj = document.getElementById('login-error');
            const btn = document.getElementById('login-btn');
            
            if (errObj) errObj.classList.add('hidden');
            if (btn) btn.innerText = "Sending...";
            
            try {
                const { error } = await supabase.auth.signInWithOtp({
                    email,
                    options: {
                        emailRedirectTo: `${window.location.origin}/admin.html`,
                        shouldCreateUser: false
                    }
                });
                
                if (error) throw error;

                pendingEmail = email;
                
                const displayEmail = document.getElementById('display-email');
                if (displayEmail) displayEmail.innerText = email;
                
                const loginScreen = document.getElementById('login-screen');
                const waitingScreen = document.getElementById('waiting-screen');
                if (loginScreen) loginScreen.classList.add('hidden');
                if (waitingScreen) waitingScreen.classList.remove('hidden');
                
                // Auto-focus the OTP input
                setTimeout(() => {
                    const otpInput = document.getElementById('otp-code');
                    if (otpInput) otpInput.focus();
                }, 100);
            } catch (err) {
                console.error("OTP Send Error:", err);
                if (errObj) {
                    errObj.innerText = err.message || 'Failed to send access code.';
                    errObj.classList.remove('hidden');
                }
                if (btn) btn.innerText = "Send Access Code";
            }
        });
    }
    
    // Step 2: Verify OTP code
    const otpForm = document.getElementById('otp-form');
    if (otpForm) {
        otpForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const codeInput = document.getElementById('otp-code');
            const token = codeInput ? codeInput.value.trim() : '';
            const otpBtn = document.getElementById('otp-btn');
            const otpError = document.getElementById('otp-error');
            
            if (otpError) otpError.classList.add('hidden');
            if (otpBtn) otpBtn.innerText = "Verifying...";
            
            try {
                if (!token || token.length !== 6) {
                    throw new Error('Please enter the 6-digit code from your email.');
                }
                
                const { data, error } = await supabase.auth.verifyOtp({
                    email: pendingEmail,
                    token: token,
                    type: 'email'
                });
                
                if (error) throw error;
                
                // Handle "Remember this device" preference
                const rememberCheckbox = document.getElementById('login-remember');
                if (rememberCheckbox && rememberCheckbox.checked) {
                    // Trust this device for 30 days
                    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
                    localStorage.setItem('app_trusted_until', String(Date.now() + thirtyDays));
                } else {
                    // Session-only — will be cleared when browser closes
                    localStorage.removeItem('app_trusted_until');
                    sessionStorage.setItem('app_session_only', 'true');
                }
                
                // Success — onAuthStateChange will handle the rest
                console.log("OTP verified, session created.");
            } catch (err) {
                console.error("OTP Verify Error:", err);
                if (otpError) {
                    otpError.innerText = err.message || 'Invalid code. Please try again.';
                    otpError.classList.remove('hidden');
                }
                if (otpBtn) otpBtn.innerText = "Verify Code";
                if (codeInput) {
                    codeInput.value = '';
                    codeInput.focus();
                }
            }
        });
    }
    
    // Resend OTP button
    const resendBtn = document.getElementById('resend-otp-btn');
    if (resendBtn) {
        resendBtn.addEventListener('click', async () => {
            if (!pendingEmail) return;
            resendBtn.innerText = 'Sending...';
            try {
                const { error } = await supabase.auth.signInWithOtp({
                    email: pendingEmail,
                    options: {
                        emailRedirectTo: `${window.location.origin}/admin.html`,
                        shouldCreateUser: false
                    }
                });
                if (error) throw error;
                resendBtn.innerText = 'Code Sent ✓';
                setTimeout(() => { resendBtn.innerText = 'Resend Code'; }, 3000);
            } catch (err) {
                resendBtn.innerText = 'Failed — Try Again';
                setTimeout(() => { resendBtn.innerText = 'Resend Code'; }, 3000);
            }
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLogin);
} else {
    initLogin();
}
// --- END OTP LOGIN ---

// Global State (Moved to top to prevent hoisting issues)
let allAdminClasses = [];
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
const tabClasses = document.getElementById('tab-classes');
const tabCustomers = document.getElementById('tab-customers');
const viewClasses = document.getElementById('view-classes');
const viewCustomers = document.getElementById('view-customers');
const tabManage = document.getElementById('tab-manage');
const viewManage = document.getElementById('view-manage');

    // Auth State
    supabase.auth.onAuthStateChange(async (event, session) => {
        console.log("Auth Event:", event, "Session Email:", session?.user?.email);

        // Clean URL hash after OTP or any auth redirect
        if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
        
        const userEmail = session?.user?.email?.toLowerCase();
        const isAdmin = userEmail === '{{ADMIN_EMAIL}}' || userEmail === '{{DEV_EMAIL}}';

        if (session && isAdmin) {
            console.log("Admin session verified.");
            if (loginScreen) loginScreen.classList.add('hidden');
            if (waitingScreen) waitingScreen.classList.add('hidden');
            if (dashboardScreen) dashboardScreen.classList.remove('hidden');
            if (logoutBtn) logoutBtn.classList.remove('hidden');
            
            if (allAdminClasses.length === 0) {
                loadDashboard();
            }
        } else if (event === 'SIGNED_OUT') {
            if (loginScreen) loginScreen.classList.remove('hidden');
            if (waitingScreen) waitingScreen.classList.add('hidden');
            if (dashboardScreen) dashboardScreen.classList.add('hidden');
            if (logoutBtn) logoutBtn.classList.add('hidden');
        }
    });

    // Force check session on page load + enforce trust expiry
    document.addEventListener('DOMContentLoaded', async () => {
        const { data } = await supabase.auth.getSession();
        
        if (data.session) {
            // Check device trust status
            const trustedUntil = localStorage.getItem('app_trusted_until');
            const isSessionOnly = sessionStorage.getItem('app_session_only');
            
            if (trustedUntil) {
                // Trusted device — check if trust has expired
                if (Date.now() > Number(trustedUntil)) {
                    console.log('Device trust expired — signing out.');
                    localStorage.removeItem('app_trusted_until');
                    await supabase.auth.signOut();
                    return;
                }
            } else if (!isSessionOnly) {
                // No trust marker AND no session-only marker = browser was closed after a session-only login
                // The old session is stale — clean it up
                console.log('Session-only login expired (browser was closed) — signing out.');
                await supabase.auth.signOut();
                return;
            }
            
            // Session is valid — show dashboard
            const userEmail = data.session?.user?.email?.toLowerCase();
            if (userEmail === '{{ADMIN_EMAIL}}' || userEmail === '{{DEV_EMAIL}}') {
                if (loginScreen) loginScreen.classList.add('hidden');
                if (dashboardScreen) dashboardScreen.classList.remove('hidden');
                if (logoutBtn) logoutBtn.classList.remove('hidden');
                if (allAdminClasses.length === 0) loadDashboard();
            }
        }
    });


// Logout — clear trust markers
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        localStorage.removeItem('app_trusted_until');
        sessionStorage.removeItem('app_session_only');
        await supabase.auth.signOut();
    });
}

// Tabs
if (tabClasses) {
    tabClasses.addEventListener('click', () => {
        tabClasses.classList.replace('text-gray-500', 'text-studio-gold');
        tabClasses.classList.add('border-b-2', 'border-studio-gold');
        
        if (tabCustomers) {
            tabCustomers.classList.replace('text-studio-gold', 'text-gray-500');
            tabCustomers.classList.remove('border-b-2', 'border-studio-gold');
        }
        
        if (tabManage) {
            tabManage.classList.replace('text-studio-gold', 'text-gray-500');
            tabManage.classList.remove('border-b-2', 'border-studio-gold');
        }
        
        if (viewClasses) viewClasses.classList.remove('hidden');
        if (viewCustomers) viewCustomers.classList.add('hidden');
        if (viewManage) viewManage.classList.add('hidden');
    });
}

if (tabManage) {
    tabManage.addEventListener('click', () => {
        tabManage.classList.replace('text-gray-500', 'text-studio-gold');
        tabManage.classList.add('border-b-2', 'border-studio-gold');
        
        if (tabClasses) {
            tabClasses.classList.replace('text-studio-gold', 'text-gray-500');
            tabClasses.classList.remove('border-b-2', 'border-studio-gold');
        }
        
        if (tabCustomers) {
            tabCustomers.classList.replace('text-studio-gold', 'text-gray-500');
            tabCustomers.classList.remove('border-b-2', 'border-studio-gold');
        }
        
        if (viewManage) viewManage.classList.remove('hidden');
        if (viewClasses) viewClasses.classList.add('hidden');
        if (viewCustomers) viewCustomers.classList.add('hidden');
        loadScheduleManager();
    });
}

if (tabCustomers) {
    tabCustomers.addEventListener('click', () => {
        tabCustomers.classList.replace('text-gray-500', 'text-studio-gold');
        tabCustomers.classList.add('border-b-2', 'border-studio-gold');
        
        if (tabClasses) {
            tabClasses.classList.replace('text-studio-gold', 'text-gray-500');
            tabClasses.classList.remove('border-b-2', 'border-studio-gold');
        }
        
        if (tabManage) {
            tabManage.classList.replace('text-studio-gold', 'text-gray-500');
            tabManage.classList.remove('border-b-2', 'border-studio-gold');
        }
        
        if (viewCustomers) viewCustomers.classList.remove('hidden');
        if (viewClasses) viewClasses.classList.add('hidden');
        if (viewManage) viewManage.classList.add('hidden');
        loadCustomers();
    });
}

// Removed duplicate declarations
// let allAdminClasses = [];
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
    const [classesRes, bookingsRes] = await Promise.all([
        supabase.from('classes').select('*').order('start_time', { ascending: true }),
        supabase.from('bookings').select('class_id, status').neq('status', 'cancelled')
    ]);

    if (classesRes.error) return console.error(classesRes.error);
    
    allAdminClasses = classesRes.data || [];
    allAdminBookings = bookingsRes.data || [];
    
    renderAdminCalendarDays();
    renderAdminClassesForDate(selectedAdminDateStr);
    loadDashboardStats();
}

async function loadDashboardStats() {
    try {
        const [customersRes, classesRes] = await Promise.all([
            supabase.from('customers').select('membership_type, membership_expires_at, class_credits, credits_expires_at, waiver_signed_at'),
            supabase.from('classes').select('start_time').gte('start_time', new Date().toISOString().split('T')[0]).lte('start_time', new Date().toISOString().split('T')[0] + 'T23:59:59')
        ]);

        const customers = customersRes.data || [];
        const todayClasses = classesRes.data || [];
        const now = new Date();
        const sevenDays = new Date(); sevenDays.setDate(now.getDate() + 7);
        const UNLIMITED_TYPES = ['1 Month Unlimited', '3 Months Unlimited', '6 Months Unlimited', '12 Months Unlimited', 'Founder'];

        let active = 0, expiring = 0, unsignedWaivers = 0;

        customers.forEach(c => {
            const memberType = (c.membership_type || '').trim();
            const isFounder = memberType === 'Founder';
            const isMember = UNLIMITED_TYPES.includes(memberType) && (isFounder || (c.membership_expires_at && new Date(c.membership_expires_at) > now));
            const hasActiveCredits = (c.class_credits || 0) > 0 && (!c.credits_expires_at || new Date(c.credits_expires_at) > now);

            // Membership expiring within 7 days
            const memberExpiringSoon = c.membership_expires_at && new Date(c.membership_expires_at) > now && new Date(c.membership_expires_at) < sevenDays;
            // Credit pack expiring within 7 days
            const creditsExpiringSoon = hasActiveCredits && c.credits_expires_at && new Date(c.credits_expires_at) > now && new Date(c.credits_expires_at) < sevenDays;

            if (isMember || hasActiveCredits) active++;
            if (memberExpiringSoon || creditsExpiringSoon) expiring++;
            if (!c.waiver_signed_at) unsignedWaivers++;
        });

        document.getElementById('stat-today-classes').textContent = todayClasses.length;
        document.getElementById('stat-active-members').textContent = active;
        document.getElementById('stat-expiring').textContent = expiring;
        document.getElementById('stat-unsigned-waivers').textContent = unsignedWaivers;
    } catch (err) {
        console.error('Stats load error:', err);
    }
}

window.selectAdminDate = (dateStr) => {
    selectedAdminDateStr = dateStr;
    renderAdminCalendarDays();
    renderAdminClassesForDate(dateStr);
    
    // Clear roster until a class is clicked
    document.getElementById('roster-tbody').innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">Select a class to view roster</td></tr>';
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
        
        let bgClass = 'bg-white/5 border border-white/5 text-gray-300 hover:border-studio-gold/50';
        if (isSelected) {
            bgClass = 'bg-studio-gold text-black border-studio-gold shadow-[0_0_10px_rgba(212,175,55,0.3)]';
        } else if (isToday) {
            bgClass = 'bg-white/10 border border-white/30 text-white font-bold';
        }
        
        const btn = document.createElement('button');
        btn.onclick = () => selectAdminDate(localDateStr);
        btn.className = `flex items-center justify-center h-10 rounded-lg transition-all cursor-pointer ${bgClass} text-sm`;
        btn.textContent = i;
        
        daysContainer.appendChild(btn);
    }
}

function renderAdminClassesForDate(dateStr) {
    const pillsContainer = document.getElementById('admin-class-pills');
    if (!pillsContainer) return;
    
    const filtered = allAdminClasses.filter(c => c.start_time.startsWith(dateStr));
    
    if (filtered.length === 0) {
        pillsContainer.innerHTML = `<div class="text-gray-500 text-sm py-2">No classes scheduled for this day.</div>`;
        return;
    }
    
    pillsContainer.innerHTML = '';
    filtered.forEach(cls => {
        const timeStr = new Date(cls.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const bookedCount = allAdminBookings.filter(b => b.class_id === cls.id).length;
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
        
        const baseClass = `px-6 py-3 rounded-full border text-sm transition-colors cursor-pointer flex items-center space-x-2`;
        const inactiveClass = isFull ? `bg-red-900/20 border-red-500/30 text-red-200 hover:bg-red-900/40` : `bg-white/5 border-white/10 text-gray-300 hover:bg-white/10`;
        
        btn.className = `${baseClass} ${inactiveClass}`;
        
        btn.innerHTML = `
            <span class="font-bold">${timeStr}</span> 
            <span>${cls.title}</span>
            <span class="text-[10px] bg-black/50 px-2 py-0.5 rounded-full ml-2 ${isFull ? 'text-red-400' : 'text-studio-gold'}">${capacityStr}</span>
        `;
        
        pillsContainer.appendChild(btn);
    });
}
// Track currently selected class for add-student feature
let currentRosterClassId = null;

// Load Roster
window.loadRoster = async (classId) => {
    currentRosterClassId = classId;
    rosterTbody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">Loading...</td></tr>';
    
    // Fetch class details for capacity check
    const { data: classInfo } = await supabase
        .from('classes')
        .select('capacity, title')
        .eq('id', classId)
        .single();

    const classCapacity = classInfo?.capacity || 6;
    const className = classInfo?.title || 'Class';

    const { data: bookings, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('class_id', classId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true });

    if (error) {
        rosterTbody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-red-500">Error loading roster</td></tr>';
        return;
    }

    const activeBookings = bookings || [];
    const bookedCount = activeBookings.length;
    const isFull = bookedCount >= classCapacity;
    const spotsLeft = classCapacity - bookedCount;

    const checkedInCount = activeBookings.filter(b => b.checked_in).length;
    const noShowCount = activeBookings.filter(b => b.status === 'no_show').length;
    const totalCount = activeBookings.length;
    const uncheckedCount = activeBookings.filter(b => !b.checked_in && b.status !== 'no_show').length;

    rosterTbody.innerHTML = '';

    // Check-in summary row with capacity indicator
    const summaryRow = document.createElement('tr');
    summaryRow.className = 'bg-white/3 border-b border-white/10';
    summaryRow.innerHTML = `
        <td colspan="6" class="px-6 py-3">
            <div class="flex items-center justify-between flex-wrap gap-2">
                <span class="text-[10px] text-gray-400 uppercase tracking-[0.2em] font-semibold">
                    Checked In: <span class="text-studio-gold">${checkedInCount}</span> / ${totalCount}
                    ${noShowCount > 0 ? ` · <span class="text-red-400">${noShowCount} No-Show</span>` : ''}
                </span>
                <span class="text-[10px] uppercase tracking-[0.2em] font-semibold ${isFull ? 'text-red-400' : spotsLeft <= 2 ? 'text-yellow-400' : 'text-green-400'}">
                    ${isFull ? '● Full' : `${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} available`} · ${bookedCount}/${classCapacity}
                </span>
                ${checkedInCount === totalCount && totalCount > 0 ? '<span class="text-[10px] text-green-400 uppercase tracking-[0.2em] font-bold">✓ All Present</span>' : ''}
            </div>
        </td>
    `;
    rosterTbody.appendChild(summaryRow);

    if (activeBookings.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = '<td colspan="6" class="px-6 py-8 text-center text-gray-500">No bookings for this class yet.</td>';
        rosterTbody.appendChild(emptyRow);
    }

    activeBookings.forEach(b => {
        // Payment method display
        let methodBadge = 'CASH/STUDIO';
        if (b.payment_method === 'membership') methodBadge = 'MEMBERSHIP';
        else if (b.payment_method === 'credits') methodBadge = 'CREDITS';
        else if (b.payment_method === 'stripe') methodBadge = 'STRIPE';

        // Payment status
        const isCoveredByPlan = b.payment_method === 'membership' || b.payment_method === 'credits';
        let statusBadge;
        if (b.status === 'no_show') {
            statusBadge = '<span class="bg-red-900 text-red-300 px-2 py-1 rounded text-xs uppercase tracking-widest">No Show</span>';
        } else if (isCoveredByPlan) {
            statusBadge = '<span class="bg-blue-900 text-blue-300 px-2 py-1 rounded text-xs uppercase tracking-widest">Covered</span>';
        } else if (b.payment_status === 'paid') {
            statusBadge = '<span class="bg-green-900 text-green-300 px-2 py-1 rounded text-xs uppercase tracking-widest">Paid</span>';
        } else {
            statusBadge = '<span class="bg-yellow-900 text-yellow-300 px-2 py-1 rounded text-xs uppercase tracking-widest">Pending</span>';
        }

        const showMarkPaid = b.payment_method === 'cash' && b.payment_status === 'pending' && b.status !== 'no_show';

        // Check-in toggle
        const checkedIn = b.checked_in;
        const isNoShow = b.status === 'no_show';

        let checkInToggle;
        if (isNoShow) {
            checkInToggle = `<span class="w-7 h-7 rounded-full bg-red-500/20 flex items-center justify-center" title="No Show">
                <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </span>`;
        } else if (checkedIn) {
            checkInToggle = `<button onclick="toggleCheckIn('${b.id}', '${b.class_id}', false)" class="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center shadow-[0_0_10px_rgba(34,197,94,0.4)] hover:bg-green-400 transition-all" title="Checked in — click to undo">
                <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
               </button>`;
        } else {
            checkInToggle = `<button onclick="toggleCheckIn('${b.id}', '${b.class_id}', true)" class="w-7 h-7 rounded-full border-2 border-gray-600 hover:border-studio-gold flex items-center justify-center transition-all group" title="Click to check in">
                <span class="w-2 h-2 rounded-full bg-gray-700 group-hover:bg-studio-gold transition-colors"></span>
               </button>`;
        }

        const row = document.createElement('tr');
        row.className = checkedIn ? 'bg-green-500/5' : isNoShow ? 'bg-red-500/5 opacity-60' : '';
        row.innerHTML = `
            <td class="px-4 md:px-6 py-4 text-center">${checkInToggle}</td>
            <td class="px-6 py-4 ${checkedIn ? 'text-white font-medium' : isNoShow ? 'text-gray-500 line-through' : 'text-white'}">${b.guest_name}</td>
            <td class="px-6 py-4 text-gray-400">${b.guest_email}</td>
            <td class="px-6 py-4 text-gray-400">${methodBadge}</td>
            <td class="px-6 py-4">${statusBadge}</td>
            <td class="px-6 py-4 text-right space-x-2">
                ${showMarkPaid ? `<button onclick="markPaid('${b.id}', '${b.class_id}')" class="text-xs text-green-400 hover:text-green-300 uppercase tracking-widest">Mark Paid</button>` : ''}
                ${!isNoShow ? `<button onclick="cancelBooking('${b.id}', '${b.class_id}')" class="text-xs text-red-400 hover:text-red-300 uppercase tracking-widest ml-4">Cancel</button>` : ''}
            </td>
        `;
        rosterTbody.appendChild(row);
    });

    // Finalize Class button — only if there are unchecked-in students who aren't already marked no-show
    if (uncheckedCount > 0) {
        const finalizeRow = document.createElement('tr');
        finalizeRow.className = 'border-t border-white/10';
        finalizeRow.innerHTML = `
            <td colspan="6" class="px-6 py-4 text-center">
                <button onclick="finalizeClass('${classId}')" class="px-6 py-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-full text-xs uppercase tracking-[0.15em] font-bold hover:bg-red-500/20 transition-colors">
                    Finalize Class — Mark ${uncheckedCount} No-Show${uncheckedCount > 1 ? 's' : ''} & Send Notifications
                </button>
            </td>
        `;
        rosterTbody.appendChild(finalizeRow);
    }

    // ─── ADD STUDENT ROW ───────────────────────────────────────
    const addRow = document.createElement('tr');
    addRow.className = 'border-t border-white/10 bg-white/[0.02]';
    addRow.id = 'add-student-row';
    addRow.innerHTML = `
        <td colspan="6" class="px-6 py-4">
            <div id="add-student-trigger" class="flex items-center justify-center">
                <button onclick="showAddStudentSearch()" class="flex items-center space-x-2 px-5 py-2.5 rounded-full border border-dashed ${isFull ? 'border-red-500/30 text-red-400' : 'border-studio-gold/30 text-studio-gold'} hover:bg-white/5 transition-all text-xs uppercase tracking-[0.15em] font-semibold">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                    <span>${isFull ? 'Class Full — Add Anyway' : 'Add Student'}</span>
                </button>
            </div>
            <div id="add-student-form" class="hidden">
                <div class="flex items-center space-x-3 mb-3">
                    <span class="text-[10px] text-gray-400 uppercase tracking-[0.2em] font-semibold">Add Student to ${className}</span>
                    <button onclick="hideAddStudentSearch()" class="text-gray-500 hover:text-white text-xs ml-auto">✕ Cancel</button>
                </div>
                <div class="relative">
                    <input type="text" id="roster-student-search" placeholder="Search by name or email..." 
                        class="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-studio-gold outline-none text-sm transition-all font-light focus:bg-black/60"
                        oninput="searchStudentForRoster(this.value)">
                    <div id="roster-search-results" class="absolute left-0 right-0 top-full mt-2 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl z-50 max-h-48 overflow-y-auto hidden"></div>
                </div>
                <div class="mt-3 flex items-center">
                    <button onclick="showWalkinForm()" class="text-[10px] text-studio-gold/60 hover:text-studio-gold uppercase tracking-[0.15em] transition-colors">
                        + New Walk-in (not in system)
                    </button>
                </div>
                <div id="walkin-form" class="hidden mt-4 space-y-3 p-4 bg-white/5 rounded-xl border border-white/5">
                    <div class="text-[10px] text-gray-400 uppercase tracking-[0.2em] font-semibold mb-2">New Walk-in Customer</div>
                    <input type="text" id="walkin-name" placeholder="Full Name" 
                        class="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-studio-gold outline-none text-sm font-light">
                    <input type="email" id="walkin-email" placeholder="Email Address" 
                        class="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-studio-gold outline-none text-sm font-light">
                    <button onclick="addWalkinToClass()" class="w-full py-2.5 rounded-full bg-studio-gold text-studio-black text-xs uppercase tracking-[0.15em] font-bold hover:bg-white transition-colors">
                        Add Walk-in
                    </button>
                </div>
            </div>
        </td>
    `;
    rosterTbody.appendChild(addRow);
};

// Actions
window.markPaid = async (bookingId, classId) => {
    if(!confirm('Mark this booking as paid?')) return;
    await supabase.from('bookings').update({ payment_status: 'paid' }).eq('id', bookingId);
    loadRoster(classId);
};

window.toggleCheckIn = async (bookingId, classId, checkedIn) => {
    await supabase.from('bookings').update({ 
        checked_in: checkedIn,
        checked_in_at: checkedIn ? new Date().toISOString() : null
    }).eq('id', bookingId);
    loadRoster(classId);
};

window.cancelBooking = async (bookingId, classId) => {
    if(!confirm('Are you sure you want to cancel this booking?')) return;
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId);
    loadRoster(classId);
    // Refresh dashboard counts
    loadDashboard();
};

// ─── ADD STUDENT TO CLASS ──────────────────────────────────────

window.showAddStudentSearch = () => {
    document.getElementById('add-student-trigger').classList.add('hidden');
    document.getElementById('add-student-form').classList.remove('hidden');
    setTimeout(() => document.getElementById('roster-student-search')?.focus(), 100);
};

window.hideAddStudentSearch = () => {
    document.getElementById('add-student-trigger').classList.remove('hidden');
    document.getElementById('add-student-form').classList.add('hidden');
    document.getElementById('walkin-form')?.classList.add('hidden');
    const searchInput = document.getElementById('roster-student-search');
    if (searchInput) searchInput.value = '';
    document.getElementById('roster-search-results')?.classList.add('hidden');
};

window.showWalkinForm = () => {
    document.getElementById('walkin-form').classList.remove('hidden');
};

let rosterSearchDebounce = null;
window.searchStudentForRoster = (query) => {
    clearTimeout(rosterSearchDebounce);
    const resultsDiv = document.getElementById('roster-search-results');
    
    if (query.trim().length < 2) {
        resultsDiv.classList.add('hidden');
        return;
    }

    rosterSearchDebounce = setTimeout(async () => {
        const { data, error } = await supabase
            .from('customers')
            .select('name, email, membership_type, class_credits')
            .or(`name.ilike.%${query.trim()}%,email.ilike.%${query.trim()}%`)
            .limit(6);

        if (error || !data || data.length === 0) {
            resultsDiv.innerHTML = '<div class="px-4 py-3 text-gray-500 text-sm">No customers found</div>';
            resultsDiv.classList.remove('hidden');
            return;
        }

        const UNLIMITED_TYPES = ['1 Month Unlimited', '3 Months Unlimited', '6 Months Unlimited', '12 Months Unlimited', 'Founder'];
        
        resultsDiv.innerHTML = data.map(c => {
            const isMember = UNLIMITED_TYPES.includes(c.membership_type);
            const hasCredits = (c.class_credits || 0) > 0;
            let badge = '';
            if (isMember) badge = '<span class="text-[9px] bg-studio-gold/20 text-studio-gold px-1.5 py-0.5 rounded ml-2 uppercase tracking-wider">Member</span>';
            else if (hasCredits) badge = `<span class="text-[9px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded ml-2 uppercase tracking-wider">${c.class_credits} Credits</span>`;

            // Escape quotes in names for onclick
            const safeName = (c.name || '').replace(/'/g, "\\'");
            const safeEmail = (c.email || '').replace(/'/g, "\\'");

            return `
                <div class="px-4 py-3 hover:bg-studio-gold/10 cursor-pointer border-b border-white/5 last:border-0 transition-colors" onclick="confirmAddStudent('${safeEmail}', '${safeName}')">
                    <div class="flex items-center">
                        <span class="text-white text-sm font-medium">${c.name}</span>
                        ${badge}
                    </div>
                    <div class="text-gray-500 text-xs">${c.email}</div>
                </div>
            `;
        }).join('');
        resultsDiv.classList.remove('hidden');
    }, 250);
};

window.confirmAddStudent = async (email, name) => {
    if (!currentRosterClassId) return;

    // Check for duplicate booking
    const { data: existing } = await supabase
        .from('bookings')
        .select('id')
        .eq('class_id', currentRosterClassId)
        .eq('guest_email', email)
        .neq('status', 'cancelled');

    if (existing && existing.length > 0) {
        alert(`${name} is already booked for this class.`);
        return;
    }

    // Auto-detect payment method via edge function
    const { data: eligibility } = await supabase.functions.invoke('customer-lookup', {
        body: { type: 'booking_eligibility', email }
    });

    const UNLIMITED_TYPES = ['1 Month Unlimited', '3 Months Unlimited', '6 Months Unlimited', '12 Months Unlimited', 'Founder'];
    let paymentMethod = 'cash';
    let paymentStatus = 'pending';
    let methodLabel = 'Cash (pending)';

    if (eligibility && UNLIMITED_TYPES.includes(eligibility.membership_type)) {
        const isFounder = eligibility.membership_type === 'Founder';
        const notExpired = isFounder || (eligibility.membership_expires_at && new Date(eligibility.membership_expires_at) > new Date());
        if (notExpired) {
            paymentMethod = 'membership';
            paymentStatus = 'paid';
            methodLabel = `Membership (${eligibility.membership_type})`;
        }
    } else if (eligibility && eligibility.class_credits > 0) {
        const creditsNotExpired = !eligibility.credits_expires_at || new Date(eligibility.credits_expires_at) > new Date();
        if (creditsNotExpired) {
            paymentMethod = 'credits';
            paymentStatus = 'paid';
            methodLabel = `Credits (${eligibility.class_credits} remaining)`;
        }
    }

    if (!confirm(`Add ${name} to this class?\n\nPayment: ${methodLabel}`)) return;

    // Insert booking — triggers webhook email + credit deduction trigger
    const { error: bookingErr } = await supabase
        .from('bookings')
        .insert([{
            class_id: currentRosterClassId,
            user_id: null,
            guest_name: name,
            guest_email: email,
            payment_method: paymentMethod,
            payment_status: paymentStatus
        }]);

    if (bookingErr) {
        if (bookingErr.code === '23505') {
            alert(`${name} is already booked for this class.`);
        } else {
            alert('Error adding student: ' + bookingErr.message);
        }
        return;
    }

    // Refresh roster and dashboard
    hideAddStudentSearch();
    loadRoster(currentRosterClassId);
    loadDashboard();
};

window.addWalkinToClass = async () => {
    const name = document.getElementById('walkin-name')?.value.trim();
    const email = document.getElementById('walkin-email')?.value.trim().toLowerCase();

    if (!name || !email) {
        alert('Please enter both name and email.');
        return;
    }
    if (!email.includes('@')) {
        alert('Please enter a valid email address.');
        return;
    }
    if (!currentRosterClassId) return;

    // Check if customer already exists
    const { data: existingCustomer } = await supabase
        .from('customers')
        .select('email')
        .eq('email', email)
        .maybeSingle();

    if (!existingCustomer) {
        // Create new customer as "À La Carte" (walk-in paying per class)
        await supabase.from('customers').insert({
            email, name, membership_type: 'À La Carte'
        });
    }

    // Now add them to the class using the normal flow
    await confirmAddStudent(email, name);

    // Clear walk-in form
    document.getElementById('walkin-name').value = '';
    document.getElementById('walkin-email').value = '';
    document.getElementById('walkin-form')?.classList.add('hidden');
};

// ─── ESCAPE KEY HANDLER ────────────────────────────────────────
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        // Close manage modal
        const manageModal = document.getElementById('manage-modal');
        if (manageModal && !manageModal.classList.contains('hidden')) {
            closeManageModal();
            return;
        }
        // Close customer details modal
        const cdModal = document.getElementById('customer-details-modal');
        if (cdModal && !cdModal.classList.contains('hidden')) {
            cdModal.classList.add('hidden');
            return;
        }
        // Close add customer modal
        const addModal = document.getElementById('add-customer-modal');
        if (addModal && !addModal.classList.contains('hidden')) {
            addModal.classList.add('hidden');
            return;
        }
        // Close membership modal
        const memModal = document.getElementById('membership-modal');
        if (memModal && !memModal.classList.contains('hidden')) {
            memModal.classList.add('hidden');
            return;
        }
        // Close billing modal
        const billModal = document.getElementById('billing-modal');
        if (billModal && !billModal.classList.contains('hidden')) {
            billModal.classList.add('hidden');
            return;
        }
        // Collapse add-student search if open
        const addForm = document.getElementById('add-student-form');
        if (addForm && !addForm.classList.contains('hidden')) {
            hideAddStudentSearch();
            return;
        }
    }
});

window.clearCustomerBalance = async () => {
    const email = document.getElementById('cd-email').innerText.toLowerCase();
    const name = document.getElementById('cd-name').innerText;
    
    const { data: unpaid } = await supabase
        .from('bookings')
        .select('id')
        .eq('guest_email', email)
        .eq('payment_method', 'cash')
        .eq('payment_status', 'pending')
        .eq('status', 'confirmed');

    if (!unpaid || unpaid.length === 0) {
        alert('No outstanding balance.');
        return;
    }

    if (!confirm(`Mark ${unpaid.length} unpaid class${unpaid.length > 1 ? 'es' : ''} as paid for ${name}?`)) return;

    const ids = unpaid.map(b => b.id);
    await supabase
        .from('bookings')
        .update({ payment_status: 'paid' })
        .in('id', ids);

    // Update local cache
    if (window.unpaidBalances) delete window.unpaidBalances[email];

    // Send receipt
    supabase.functions.invoke('booking-alert', {
        body: { type: 'balance_cleared', email, name, count: unpaid.length }
    }).catch(err => console.error('Receipt failed:', err));

    // Refresh the modal UI
    document.getElementById('cd-past-due-box').classList.add('hidden');
    alert(`Balance cleared for ${name}. ${unpaid.length} booking${unpaid.length > 1 ? 's' : ''} marked as paid.`);

    // Refresh customer list to remove the "Owes" badge
    loadCustomers();
};

window.finalizeClass = async (classId) => {
    // Get unchecked-in bookings
    const { data: noShows } = await supabase
        .from('bookings')
        .select('id, guest_name, guest_email, payment_method, payment_status')
        .eq('class_id', classId)
        .eq('checked_in', false)
        .neq('status', 'cancelled')
        .neq('status', 'no_show');

    if (!noShows || noShows.length === 0) {
        alert('All students are checked in!');
        return;
    }

    const names = noShows.map(b => `  • ${b.guest_name} (${b.guest_email})`).join('\n');
    if (!confirm(`Mark ${noShows.length} student${noShows.length > 1 ? 's' : ''} as No-Show?\n\n${names}\n\nThis will send no-show notifications to each student. Credits/payments are non-refundable.`)) return;

    // Get class info for the email
    const { data: classInfo } = await supabase
        .from('classes')
        .select('title, start_time')
        .eq('id', classId)
        .single();

    const className = classInfo?.title || 'Class';
    const classTime = classInfo?.start_time ? new Date(classInfo.start_time).toLocaleString('en-US', { 
        weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' 
    }) : '';

    // Mark all as no-show in one batch
    const noShowIds = noShows.map(b => b.id);
    await supabase
        .from('bookings')
        .update({ status: 'no_show' })
        .in('id', noShowIds);

    // Send no-show notifications for each student
    for (const b of noShows) {
        try {
            await supabase.functions.invoke('booking-alert', {
                body: { 
                    type: 'no_show',
                    email: b.guest_email,
                    name: b.guest_name,
                    className,
                    classTime,
                    paymentMethod: b.payment_method,
                    paymentStatus: b.payment_status
                }
            });
        } catch (err) {
            console.error(`No-show notification failed for ${b.guest_email}:`, err);
        }
    }

    alert(`${noShows.length} student${noShows.length > 1 ? 's' : ''} marked as No-Show. Notifications sent.`);
    loadRoster(classId);
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

    // Fetch unpaid cash bookings for past-due tracking
    const { data: unpaidData } = await supabase
        .from('bookings')
        .select('guest_email')
        .eq('payment_method', 'cash')
        .eq('payment_status', 'pending')
        .eq('status', 'confirmed');
    
    const unpaidMap = {};
    if (unpaidData) {
        unpaidData.forEach(b => {
            if (!b.guest_email) return;
            const key = b.guest_email.toLowerCase().trim();
            unpaidMap[key] = (unpaidMap[key] || 0) + 1;
        });
    }
    window.unpaidBalances = unpaidMap;

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

    // Merge people who signed up for waitlist but never booked a class
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
            customersTbody.innerHTML = '<tr><td colspan="8" class="px-8 py-12 text-center text-gray-500">No customers found.</td></tr>';
            return;
        }

        filtered.forEach(c => {
            const mem = memberships[c.email] || { membership_type: 'A La Carte', membership_expires_at: null, phone: '', waiver_signed_at: null, class_credits: 0, one_on_one_credits: 0 };
            const phoneDisplay = mem.phone ? mem.phone : '<span class="text-gray-600">-</span>';

            // --- MEMBER STATUS ---
            const UNLIMITED_TYPES = ['1 Month Unlimited', '3 Months Unlimited', '6 Months Unlimited', '12 Months Unlimited', 'Founder'];
            const memType = (mem.membership_type || '').trim();
            const isMember = UNLIMITED_TYPES.includes(memType) && (memType === 'Founder' || (mem.membership_expires_at && new Date(mem.membership_expires_at) > new Date()));
            const unpaidCount = window.unpaidBalances?.[c.email] || 0;
            const classCredits = mem.class_credits || 0;
            const oneOnOneCredits = mem.one_on_one_credits || 0;
            const creditsExpired = mem.credits_expires_at && new Date(mem.credits_expires_at) < new Date();
            const hasActiveCredits = classCredits > 0 && !creditsExpired;

            let statusBadge = '';
            if (isMember) {
                const tierLabel = mem.membership_type === 'Founder' ? 'Founder' : mem.membership_type;
                statusBadge = `<span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)]"></span><span class="text-[10px] text-green-400 uppercase tracking-tighter font-bold">${tierLabel}</span></span>`;
            } else if (hasActiveCredits) {
                const daysLeft = mem.credits_expires_at ? Math.max(0, Math.ceil((new Date(mem.credits_expires_at) - new Date()) / (1000*60*60*24))) : '—';
                statusBadge = `<span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-studio-gold shadow-[0_0_6px_rgba(203,161,83,0.4)]"></span><span class="text-[10px] text-studio-gold uppercase tracking-tighter font-bold">${classCredits} cr · ${daysLeft}d</span></span>`;
            } else {
                statusBadge = '<span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-gray-600"></span><span class="text-[10px] text-gray-500 uppercase tracking-tighter font-bold">—</span></span>';
            }
            if (unpaidCount > 0) {
                statusBadge += ` <span class="text-[9px] bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded-full uppercase font-bold ml-1">Owes ${unpaidCount}</span>`;
            }

            // --- CREDITS DISPLAY ---
            let creditsDisplay = '';
            if (isMember) {
                creditsDisplay = '<span class="text-green-400/70 text-[10px]">∞</span>';
            } else if (hasActiveCredits) {
                creditsDisplay = `<span class="text-studio-gold font-semibold">${classCredits}</span>`;
            } else if (classCredits > 0 && creditsExpired) {
                creditsDisplay = `<span class="text-red-400/60 line-through">${classCredits}</span> <span class="text-[9px] text-red-400">exp</span>`;
            } else {
                creditsDisplay = '<span class="text-gray-600">0</span>';
            }
            if (oneOnOneCredits > 0) {
                creditsDisplay += ` · <span class="text-purple-400 font-semibold">${oneOnOneCredits}<span class="text-[9px] text-gray-500 ml-0.5">1:1</span></span>`;
            }

            // --- WAIVER BADGE ---
            let waiverBadge = '';
            if (mem.waiver_signed_at) {
                const signedDate = new Date(mem.waiver_signed_at);
                const oneYearAgo = new Date();
                oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                
                if (signedDate < oneYearAgo) {
                    waiverBadge = '<span class="text-[10px] bg-red-500 text-white px-2 py-1 rounded-full uppercase tracking-tighter font-bold shadow-sm">Expired</span>';
                } else {
                    waiverBadge = '<span class="text-[10px] bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-1 rounded-full uppercase tracking-tighter font-bold">Signed</span>';
                }
            } else {
                waiverBadge = '<button class="send-waiver-btn text-[10px] bg-amber-500 text-black px-2 py-1 rounded-full uppercase tracking-tighter font-bold shadow-sm hover:bg-amber-400 transition-colors">No Waiver</button>';
            }

            const tr = document.createElement('tr');
            tr.className = 'cursor-pointer hover:bg-white/5 transition-colors group';
            tr.onclick = (e) => {
                if(e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
                openCustomerDetailsModal(c.email);
            };
            
            tr.innerHTML = `
                <td class="px-8 py-5 text-white font-medium group-hover:text-studio-gold transition-colors">${c.name}</td>
                <td class="px-8 py-5 text-gray-400">${c.email}</td>
                <td class="px-8 py-5 text-gray-400">${phoneDisplay}</td>
                <td class="px-8 py-5 text-studio-gold">${c.count}</td>
                <td class="px-8 py-5">${creditsDisplay}</td>
                <td class="px-8 py-5">${statusBadge}</td>
                <td class="px-8 py-5">${waiverBadge}</td>
                <td class="px-8 py-5 text-right space-x-4">
                    <button class="manage-btn text-[10px] text-gray-400 hover:text-studio-gold uppercase tracking-[0.2em] font-semibold transition-colors">Manage</button>
                    <button class="delete-btn text-[10px] text-red-900 hover:text-red-400 uppercase tracking-[0.2em] font-semibold transition-colors">Delete</button>
                </td>
            `;

            if (tr.querySelector('.send-waiver-btn')) {
                tr.querySelector('.send-waiver-btn').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const btn = e.target;
                    btn.innerText = 'Sending...';
                    btn.disabled = true;
                    try {
                        await supabase.functions.invoke('booking-alert', {
                            body: { type: 'send_waiver_link', email: c.email, name: c.name }
                        });
                        btn.innerText = 'Sent!';
                        setTimeout(() => {
                            btn.innerText = 'Resend';
                            btn.classList.replace('bg-amber-500', 'bg-gray-600');
                            btn.classList.replace('text-black', 'text-white');
                        }, 2000);
                        btn.disabled = false;
                    } catch (err) {
                        alert("Failed to send waiver: " + err.message);
                        btn.innerText = 'Retry';
                        btn.disabled = false;
                    }
                });
            }

            // Use event listeners instead of onclick to avoid string escaping issues
            tr.querySelector('.manage-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                editMembership(c.email, c.name, mem.membership_type, mem.membership_expires_at || '', mem.class_credits || 0, mem.one_on_one_credits || 0);
            });
            tr.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteCustomer(c.email);
            });

            customersTbody.appendChild(tr);
        });
    };

    window.renderCustomersList();

    // Wire up search bar
    const searchBox = document.getElementById('customer-search');
    if (searchBox) {
        searchBox.oninput = (e) => window.renderCustomersList(e.target.value);
    }
}

// Modal Functions
window.closeCustomerDetailsModal = () => {
    const modal = document.getElementById('customer-details-modal');
    if (modal) modal.classList.add('hidden');
};

window.openCustomerDetailsModal = (email) => {
    // Reset modal to view mode
    document.getElementById('cd-view-mode').classList.remove('hidden');
    document.getElementById('cd-edit-mode').classList.add('hidden');

    const mem = window.fullMembershipsData[email.toLowerCase()] || {
        name: 'Guest',
        email: email,
        phone: '',
        membership_type: 'A La Carte',
        membership_expires_at: null,
        waiver_signed_at: null,
        address: '',
        date_of_birth: '',
        secondary_email: '',
        emergency_contact_name: '',
        emergency_contact_phone: '',
        fitness_goals: ''
    };

    document.getElementById('customer-details-modal').classList.remove('hidden');

    // Store for waiver PDF access
    window.currentCustomerDetails = mem;

    document.getElementById('cd-name').innerText = mem.name || 'N/A';
    document.getElementById('cd-email').innerText = mem.email || 'N/A';
    document.getElementById('cd-phone').innerText = mem.phone || 'N/A';
    document.getElementById('cd-dob').innerText = mem.date_of_birth || 'N/A';
    document.getElementById('cd-address').innerText = mem.address || 'N/A';
    document.getElementById('cd-sec-email').innerText = mem.secondary_email || 'N/A';
    document.getElementById('cd-em-name').innerText = mem.emergency_contact_name || 'N/A';
    document.getElementById('cd-em-phone').innerText = mem.emergency_contact_phone || 'N/A';

    // --- Membership & Access Card ---
    const memberCard = document.getElementById('cd-membership-card');
    const UNLIMITED_TYPES = ['1 Month Unlimited', '3 Months Unlimited', '6 Months Unlimited', '12 Months Unlimited', 'Founder'];
    const memberType = (mem.membership_type || '').trim();
    const isActiveMember = UNLIMITED_TYPES.includes(memberType) && (memberType === 'Founder' || (mem.membership_expires_at && new Date(mem.membership_expires_at) > new Date()));
    
    if (isActiveMember) {
        const daysLeft = Math.ceil((new Date(mem.membership_expires_at) - new Date()) / (1000 * 60 * 60 * 24));
        const tierLabel = mem.membership_type === 'Founder' ? 'Founder (Lifetime)' : mem.membership_type;
        const expiresLabel = mem.membership_type === 'Founder' ? '' : `<div class="text-gray-400 text-xs mt-1">Expires ${new Date(mem.membership_expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${daysLeft} days</div>`;
        memberCard.className = 'p-4 rounded-xl border border-green-500/20 bg-green-500/5';
        memberCard.innerHTML = `
            <span class="block text-green-400 text-[10px] uppercase tracking-[0.2em] font-semibold mb-2">Active Membership</span>
            <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]"></span>
                <span class="text-white font-semibold">${tierLabel}</span>
            </div>
            ${expiresLabel}
            <div class="text-green-400/60 text-[10px] mt-2 uppercase tracking-wider">1 class per business day included</div>`;
    } else {
        const classCredits = mem.class_credits || 0;
        const creditsExpired = mem.credits_expires_at && new Date(mem.credits_expires_at) < new Date();
        const hasActiveCredits = classCredits > 0 && !creditsExpired;
        
        if (hasActiveCredits) {
            const daysLeft = mem.credits_expires_at ? Math.max(0, Math.ceil((new Date(mem.credits_expires_at) - new Date()) / (1000*60*60*24))) : '—';
            const expiresDate = mem.credits_expires_at ? new Date(mem.credits_expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
            memberCard.className = 'p-4 rounded-xl border border-studio-gold/20 bg-studio-gold/5';
            memberCard.innerHTML = `
                <span class="block text-studio-gold text-[10px] uppercase tracking-[0.2em] font-semibold mb-2">Class Experience</span>
                <div class="flex items-baseline gap-2">
                    <span class="text-2xl text-studio-gold font-bold">${classCredits}</span>
                    <span class="text-gray-400 text-sm">credit${classCredits !== 1 ? 's' : ''} remaining</span>
                </div>
                <div class="text-gray-500 text-xs mt-1">Expires ${expiresDate} · ${daysLeft} days left</div>`;
        } else if (classCredits > 0 && creditsExpired) {
            memberCard.className = 'p-4 rounded-xl border border-red-500/20 bg-red-500/5';
            memberCard.innerHTML = `
                <span class="block text-red-400 text-[10px] uppercase tracking-[0.2em] font-semibold mb-2">Credits Expired</span>
                <div class="flex items-baseline gap-2">
                    <span class="text-2xl text-red-400/60 font-bold line-through">${classCredits}</span>
                    <span class="text-red-400 text-xs">expired ${new Date(mem.credits_expires_at).toLocaleDateString()}</span>
                </div>`;
        } else {
            memberCard.className = 'p-4 rounded-xl border border-white/5 bg-black/30';
            memberCard.innerHTML = `<span class="text-gray-500 text-sm">No active membership or credits</span>`;
        }
    }

    // 1:1 Credits (separate)
    const oneOnOneCredits = mem.one_on_one_credits || 0;
    const oneOnOneBox = document.getElementById('cd-1on1-box');
    if (oneOnOneCredits > 0) {
        oneOnOneBox.classList.remove('hidden');
        document.getElementById('cd-1on1-credits').innerText = oneOnOneCredits;
    } else {
        oneOnOneBox.classList.add('hidden');
    }

    document.getElementById('cd-goals').innerText = mem.fitness_goals || 'No goals specified.';

    // Past-due balance — members never owe
    const pastDueBox = document.getElementById('cd-past-due-box');
    const unpaidCount = isActiveMember ? 0 : (window.unpaidBalances?.[email.toLowerCase()] || 0);
    if (unpaidCount > 0) {
        pastDueBox.classList.remove('hidden');
        document.getElementById('cd-past-due').innerText = `${unpaidCount} unpaid class${unpaidCount > 1 ? 'es' : ''}`;
    } else {
        pastDueBox.classList.add('hidden');
    }
    
    // Waiver Info
    document.getElementById('cd-waiver-date').innerText = mem.waiver_signed_at ? new Date(mem.waiver_signed_at).toLocaleString() : 'Not Signed';
    document.getElementById('cd-waiver-name').innerText = mem.waiver_legal_name || 'N/A';
    document.getElementById('cd-waiver-ip').innerText = mem.waiver_ip_address || 'N/A';
    document.getElementById('cd-waiver-photo').innerText = mem.waiver_photo_release ? 'Yes' : 'No';
    
    const minorBox = document.getElementById('cd-waiver-minor-box');
    if (mem.waiver_minor_guardian_name) {
        minorBox.classList.remove('hidden');
        document.getElementById('cd-waiver-minor').innerText = mem.waiver_minor_guardian_name;
    } else {
        minorBox.classList.add('hidden');
    }

    // Load booking history
    const historyContainer = document.getElementById('cd-booking-history');
    historyContainer.innerHTML = '<p class="text-gray-600 text-sm">Loading...</p>';

    (async () => {
        try {
            const { data: bookings } = await supabase
                .from('bookings')
                .select('class_id, status, payment_status, checked_in, created_at, classes(title, start_time)')
                .eq('guest_email', email)
                .order('created_at', { ascending: false })
                .limit(20);

            if (!bookings || bookings.length === 0) {
                historyContainer.innerHTML = '<p class="text-gray-600 text-sm">No bookings yet.</p>';
                return;
            }

            const now = new Date();
            historyContainer.innerHTML = bookings.map(b => {
                const cls = b.classes || {};
                const classDate = cls.start_time ? new Date(cls.start_time) : null;
                const isPast = classDate && classDate < now;
                const isCancelled = b.status === 'cancelled';

                const dateStr = classDate 
                    ? classDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : '—';
                const timeStr = classDate 
                    ? classDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                    : '';

                let statusBadge = '';
                if (isCancelled) {
                    statusBadge = '<span class="text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full uppercase font-bold">Cancelled</span>';
                } else if (b.checked_in) {
                    statusBadge = '<span class="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full uppercase font-bold">Checked In</span>';
                } else if (isPast) {
                    statusBadge = '<span class="text-[9px] bg-red-500/10 text-red-300 px-1.5 py-0.5 rounded-full uppercase font-bold">No Show</span>';
                } else {
                    statusBadge = '<span class="text-[9px] bg-studio-gold/20 text-studio-gold px-1.5 py-0.5 rounded-full uppercase font-bold">Upcoming</span>';
                }

                return `<div class="flex items-center justify-between text-xs py-1.5 border-b border-white/5 last:border-0">
                    <div>
                        <span class="text-white">${cls.title || 'Class'}</span>
                        <span class="text-gray-500 ml-2">${dateStr} ${timeStr}</span>
                    </div>
                    ${statusBadge}
                </div>`;
            }).join('');
        } catch (err) {
            historyContainer.innerHTML = '<p class="text-red-400 text-sm">Failed to load history.</p>';
            console.error('Booking history error:', err);
        }
    })();
};

window.toggleEditCustomerMode = (editing) => {
    document.getElementById('cd-view-mode').classList.toggle('hidden', editing);
    document.getElementById('cd-edit-mode').classList.toggle('hidden', !editing);
    
    if (editing) {
        const email = document.getElementById('cd-email').innerText.toLowerCase();
        const mem = window.fullMembershipsData[email];
        
        document.getElementById('edit-name').value = mem.name || '';
        document.getElementById('edit-phone').value = mem.phone || '';
        document.getElementById('edit-dob').value = mem.date_of_birth || '';
        document.getElementById('edit-sec-email').value = mem.secondary_email || '';
        document.getElementById('edit-address').value = mem.address || '';
        document.getElementById('edit-em-name').value = mem.emergency_contact_name || '';
        document.getElementById('edit-em-phone').value = mem.emergency_contact_phone || '';
        document.getElementById('edit-goals').value = mem.fitness_goals || '';
    }
};

document.getElementById('edit-customer-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('cd-email').innerText.toLowerCase();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerText = "Saving...";
    
    const updates = {
        name: document.getElementById('edit-name').value,
        phone: document.getElementById('edit-phone').value,
        date_of_birth: document.getElementById('edit-dob').value || null,
        secondary_email: document.getElementById('edit-sec-email').value,
        address: document.getElementById('edit-address').value,
        emergency_contact_name: document.getElementById('edit-em-name').value,
        emergency_contact_phone: document.getElementById('edit-em-phone').value,
        fitness_goals: document.getElementById('edit-goals').value
    };

    try {
        const { data: updated, error } = await supabase.from('customers').update(updates).eq('email', email).select('email').maybeSingle();
        if (error) throw error;
        if (!updated) throw new Error('Update returned no rows — your admin session may have expired. Please log out and back in.');
        
        // Refresh local cache
        window.fullMembershipsData[email] = { ...window.fullMembershipsData[email], ...updates };
        toggleEditCustomerMode(false);
        openCustomerDetailsModal(email); // Refresh view mode
        loadCustomers(); // Refresh table
    } catch (err) {
        alert("Failed to update customer: " + err.message);
    } finally {
        btn.innerText = "Save Changes";
    }
});

window.closeCustomerModal = () => {
    document.getElementById('add-customer-modal').classList.add('hidden');
};

window.closeMembershipModal = () => {
    document.getElementById('membership-modal').classList.add('hidden');
};

// Auto-calculate expiration date based on membership type selection
memTypeSelect.addEventListener('change', (e) => {
    const type = e.target.value;
    const now = new Date();
    const MONTHS_MAP = { 'A La Carte': 0, '1 Month Unlimited': 1, '3 Months Unlimited': 3, '6 Months Unlimited': 6, '12 Months Unlimited': 12 };
    
    if (type === 'Founder') {
        now.setFullYear(now.getFullYear() + 100);
        memExpiresInput.value = now.toISOString().split('T')[0];
    } else if (MONTHS_MAP[type] !== undefined) {
        const months = MONTHS_MAP[type];
        if (months === 0) {
            now.setDate(now.getDate() + 1);
        } else {
            now.setMonth(now.getMonth() + months);
        }
        memExpiresInput.value = now.toISOString().split('T')[0];
    }
});

window.editMembership = (email, name, type, expires, credits, oneOnOne) => {
    memModal.classList.remove('hidden');
    document.getElementById('membership-email').value = email;
    document.getElementById('membership-customer-name').innerText = name;
    document.getElementById('membership-credits').value = credits || 0;
    document.getElementById('membership-1on1-credits').value = oneOnOne || 0;
    
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
    const credits = parseInt(document.getElementById('membership-credits').value) || 0;
    const oneOnOne = parseInt(document.getElementById('membership-1on1-credits').value) || 0;

    try {
        const UNLIMITED_TYPES = ['1 Month Unlimited', '3 Months Unlimited', '6 Months Unlimited', '12 Months Unlimited', 'Founder'];
        const isMemberTier = UNLIMITED_TYPES.includes(type);
        const updateData = {
            membership_type: type,
            membership_expires_at: expires,
            class_credits: isMemberTier ? 0 : credits,
            one_on_one_credits: oneOnOne,
            credits_expires_at: null
        };
        // Non-members with credits get a 30-day expiry window
        if (credits > 0 && !isMemberTier) {
            const exp = new Date(); exp.setDate(exp.getDate() + 30);
            updateData.credits_expires_at = exp.toISOString();
        }
        const { data: updated, error } = await supabase
            .from('customers')
            .update(updateData)
            .eq('email', email)
            .select('email')
            .maybeSingle();
            
        if(error) throw error;
        if(!updated) throw new Error('Membership update returned no rows — your admin session may have expired. Please log out and back in.');
        
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
    if(!confirm(`⚠️ PERMANENT ACTION ⚠️\n\nAre you absolutely sure you want to delete the customer ${email}?\n\nThis will wipe out their entire history, waiver data, and rosters. This CANNOT be undone.`)) return;
    
    // Final double-check for safety
    const safetyCheck = prompt(`Type "DELETE ${email}" to confirm:`);
    if (safetyCheck !== `DELETE ${email}`) {
        alert("Action cancelled. Input did not match.");
        return;
    }
    
    // Delete from customers table
    const { error: cErr } = await supabase.from('customers').delete().eq('email', email);
    
    // Cancel all bookings for this customer (delete is restricted by RLS to pending-only)
    const { error: bErr } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('guest_email', email);
    
    if (cErr || bErr) {
        alert("Error deleting customer: " + (cErr?.message || bErr?.message));
    } else {
        loadCustomers();
    }
};

// Export CSV
document.getElementById('export-csv-btn').addEventListener('click', () => {
    if(!window.customerData) return;
    let csv = 'Name,Email,Phone,Membership,Credits,Waiver,Total Bookings\n';
    window.customerData.forEach(c => {
        const mem = window.fullMembershipsData?.[c.email] || {};
        const phone = (mem.phone || '').replace(/"/g, '""');
        const membership = mem.membership_type || 'None';
        const credits = mem.class_credits || 0;
        const waiver = mem.waiver_signed_at ? 'Signed' : 'Unsigned';
        csv += `"${c.name}","${c.email}","${phone}","${membership}",${credits},"${waiver}",${c.count}\n`;
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
    
    // Fetch upcoming classes for assignment
    const classSelector = document.getElementById('add-customer-class');
    classSelector.innerHTML = '<option value="">-- Do Not Assign --</option>';
    
    const { data: classes, error } = await supabase
        .from('classes')
        .select('*')
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true });

    if (!error && classes) {
        classes.forEach(cls => {
            const date = new Date(cls.start_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
            const opt = document.createElement('option');
            opt.value = cls.id;
            opt.innerText = `${date} - ${cls.title} (${cls.instructor_name})`;
            classSelector.appendChild(opt);
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
    const MONTHS = { '1 Month Unlimited': 1, '3 Months Unlimited': 3, '6 Months Unlimited': 6, '12 Months Unlimited': 12 };
    
    if (tier === 'Founder') {
        now.setFullYear(now.getFullYear() + 100);
        expiresInput.value = now.toISOString().split('T')[0];
    } else if (MONTHS[tier]) {
        now.setMonth(now.getMonth() + MONTHS[tier]);
        expiresInput.value = now.toISOString().split('T')[0];
    } else {
        expiresInput.value = ''; // A La Carte
    }
});

document.getElementById('add-customer-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('add-customer-save-btn');
    btn.innerText = "Saving...";
    btn.disabled = true;

    const name = document.getElementById('add-customer-name').value;
    const email = document.getElementById('add-customer-email').value;
    const phone = document.getElementById('add-customer-phone').value;
    const credits = parseInt(document.getElementById('add-customer-credits').value) || 0;
    const tier = document.getElementById('add-customer-tier').value;
    const classId = document.getElementById('add-customer-class').value;
    let expires = document.getElementById('add-customer-expires').value;
    
    if(!expires && tier !== 'A La Carte') {
        const now = new Date();
        now.setMonth(now.getMonth() + parseInt(tier) || 1);
        expires = now.toISOString();
    }

    try {
        const { data: existing } = await supabase.from('customers').select('email').eq('email', email).maybeSingle();
        
        let error;
        if (existing) {
            const billingUpdate = {
                name: name,
                phone: phone,
                class_credits: credits,
                membership_type: tier,
                membership_expires_at: expires || null
            };
            // Set 30-day credit expiration for class experience packs
            const UNLIM = ['1 Month Unlimited', '3 Months Unlimited', '6 Months Unlimited', '12 Months Unlimited', 'Founder'];
            if (credits > 0 && !UNLIM.includes(tier)) {
                const exp = new Date(); exp.setDate(exp.getDate() + 30);
                billingUpdate.credits_expires_at = exp.toISOString();
            }
            const { error: updateErr } = await supabase.from('customers').update(billingUpdate).eq('email', email);
            error = updateErr;
        } else {
            const UNLIM = ['1 Month Unlimited', '3 Months Unlimited', '6 Months Unlimited', '12 Months Unlimited', 'Founder'];
            const insertData = {
                email: email,
                name: name,
                phone: phone,
                class_credits: credits,
                membership_type: tier,
                membership_expires_at: expires || null
            };
            if (credits > 0 && !UNLIM.includes(tier)) {
                const exp = new Date(); exp.setDate(exp.getDate() + 30);
                insertData.credits_expires_at = exp.toISOString();
            }
            const { error: insertErr } = await supabase.from('customers').insert(insertData);
            error = insertErr;
        }

        if (error) throw error;

        // If they assigned to a class (Walk-in functionality mapped into profile creation)
        if (classId) {
            const UNLIM_TIERS = ['1 Month Unlimited', '3 Months Unlimited', '6 Months Unlimited', '12 Months Unlimited', 'Founder'];
            const isUnlim = UNLIM_TIERS.includes(tier);
            const hasCredits = credits > 0 && !isUnlim;
            const payMethod = isUnlim ? 'membership' : (hasCredits ? 'credits' : 'cash');
            const payStatus = (isUnlim || hasCredits) ? 'paid' : 'pending';
            
            const { error: bErr } = await supabase.from('bookings').insert([{
                class_id: classId,
                guest_name: name,
                guest_email: email,
                payment_method: payMethod,
                payment_status: payStatus, 
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
    
    const { data: classes, error } = await supabase
        .from('classes')
        .select('*')
        .gte('start_time', new Date().toISOString()) // Only show upcoming
        .order('start_time', { ascending: true });

    if (error) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-red-500">Error loading schedule</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    window.classDataCache = classes;

    classes.forEach(cls => {
        const date = new Date(cls.start_time).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="px-3 md:px-4 py-3 text-studio-gold whitespace-nowrap">${date}</td>
            <td class="px-3 md:px-4 py-3 text-white font-medium">${cls.title}</td>
            <td class="hidden md:table-cell px-4 py-3 text-gray-400">${cls.instructor_name}</td>
            <td class="hidden md:table-cell px-4 py-3 text-green-400">$${cls.price}</td>
            <td class="px-3 md:px-4 py-3 text-gray-400">${cls.capacity}</td>
            <td class="px-3 md:px-4 py-3 text-right space-x-2 whitespace-nowrap">
                <button data-action="edit" data-id="${cls.id}" class="text-xs text-blue-400 hover:text-blue-300 uppercase tracking-widest">Edit</button>
                <button data-action="delete" data-id="${cls.id}" class="text-xs text-red-400 hover:text-red-300 uppercase tracking-widest ml-3">Delete</button>
            </td>
        `;

        // Use addEventListener instead of inline onclick — more reliable on mobile
        row.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            editClass(cls.id);
        });
        row.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteClass(cls.id);
        });

        tbody.appendChild(row);
    });
}


window.editClass = (id) => {
    const cls = window.classDataCache.find(c => c.id === id);
    if(!cls) return;

    document.getElementById('manage-form-title').innerText = "Edit Class";
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

    // Hide recurring group when editing single class
    document.getElementById('recurring-group').classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.deleteClass = async (id) => {
    if(!confirm('Are you sure you want to delete this class? This will also cancel any bookings associated with it!')) return;
    
    // Cancel bookings first so the credit refund trigger fires (CASCADE delete would bypass it)
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('class_id', id).neq('status', 'cancelled');
    
    const { error } = await supabase.from('classes').delete().eq('id', id);
    if (error) {
        alert('Error deleting class: ' + error.message);
    } else {
        loadScheduleManager();
        loadDashboard();
    }
};

window.resetManageForm = () => {
    document.getElementById('class-form').reset();
    document.getElementById('manage-id').value = '';
    document.getElementById('manage-form-title').innerText = "Add New Class";
    document.getElementById('recurring-group').classList.remove('hidden');
    document.getElementById('recurring-weeks-group').classList.add('hidden');
};

// 1:1 Session Logic
window.openPrivateClassModal = () => {
    const modal = document.getElementById('manage-modal');
    const portal = document.getElementById('modal-form-portal');
    const form = document.getElementById('class-form');
    
    // Clear and move form to modal
    resetManageForm();
    portal.appendChild(form);
    
    // Auto-select Private
    document.getElementById('manage-visibility').value = 'private';
    document.getElementById('private-customer-selection').classList.remove('hidden');
    document.getElementById('manage-title').value = "1:1 Private Session";
    
    // Set date to currently selected calendar date
    document.getElementById('manage-date').value = selectedAdminDateStr;
    
    document.getElementById('manage-form-container').classList.remove('hidden');
    document.getElementById('manage-summary-view').classList.add('hidden');
    modal.classList.remove('hidden');
};

window.closeManageModal = () => {
    const modal = document.getElementById('manage-modal');
    if (!modal) return;
    
    // Close modal FIRST — never let DOM errors prevent close
    modal.classList.add('hidden');
    
    // Move form back to original tab (safely)
    try {
        const form = document.getElementById('class-form');
        const originalContainer = document.querySelector('#view-manage > div > div:first-child');
        if (form && originalContainer && !originalContainer.contains(form)) {
            originalContainer.appendChild(form);
        }
    } catch (e) {
        console.warn('closeManageModal: form restore failed', e);
    }
    
    loadScheduleManager();
    loadDashboard();
};

// Toggle customer search based on visibility
document.getElementById('manage-visibility').addEventListener('change', (e) => {
    const isPrivate = e.target.value === 'private';
    const selection = document.getElementById('private-customer-selection');
    if (isPrivate) {
        selection.classList.remove('hidden');
        document.getElementById('manage-title').value = "1:1 Private Session";
        document.getElementById('manage-capacity').value = 1;
    } else {
        selection.classList.add('hidden');
        document.getElementById('manage-capacity').value = 6;
    }
});

// Autocomplete Logic
const searchInput = document.getElementById('private-customer-search');
const resultsDiv = document.getElementById('customer-search-results');

searchInput.addEventListener('input', async (e) => {
    const query = e.target.value.trim();
    if (query.length < 2) {
        resultsDiv.classList.add('hidden');
        return;
    }

    const { data, error } = await supabase
        .from('customers')
        .select('name, email')
        .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(5);

    if (error || !data.length) {
        resultsDiv.classList.add('hidden');
        return;
    }

    resultsDiv.innerHTML = data.map(c => `
        <div class="px-4 py-3 hover:bg-studio-gold/10 cursor-pointer border-b border-white/5 last:border-0" onclick="selectCustomer('${c.email}', '${c.name}')">
            <div class="text-white text-sm font-medium">${c.name}</div>
            <div class="text-gray-500 text-xs">${c.email}</div>
        </div>
    `).join('');
    resultsDiv.classList.remove('hidden');
});

window.selectCustomer = (email, name) => {
    document.getElementById('assigned-customer-email').value = email;
    searchInput.value = `${name} (${email})`;
    resultsDiv.classList.add('hidden');
};

// Modify class-form submission to handle 1:1 deduction and private state
const originalFormSubmit = document.getElementById('class-form').onsubmit;
document.getElementById('class-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const visibility = document.getElementById('manage-visibility').value;
    const isPrivate = visibility === 'private';
    const customerEmail = document.getElementById('assigned-customer-email').value;
    
    if (isPrivate && !customerEmail) {
        alert("Please select a customer for this 1:1 session.");
        return;
    }

    const btn = document.getElementById('manage-save-btn');
    const oldText = btn.innerText;
    btn.innerText = "Saving...";
    btn.disabled = true;

    try {
        const id = document.getElementById('manage-id').value;
        const title = document.getElementById('manage-title').value;
        const instructor = document.getElementById('manage-instructor').value;
        const price = parseFloat(document.getElementById('manage-price').value);
        const capacity = parseInt(document.getElementById('manage-capacity').value);
        const date = document.getElementById('manage-date').value;
        const time = document.getElementById('manage-time').value;
        const duration = parseInt(document.getElementById('manage-duration').value);
        const isRecurring = document.getElementById('manage-recurring').checked;
        const weeks = parseInt(document.getElementById('manage-weeks').value);

        const start = new Date(`${date}T${time}`);
        const end = new Date(start.getTime() + duration * 60000);

        const records = [];
        const iterations = isRecurring ? weeks : 1;

        for (let i = 0; i < iterations; i++) {
            const currentStart = new Date(start);
            currentStart.setDate(currentStart.getDate() + (i * 7));
            const currentEnd = new Date(end);
            currentEnd.setDate(currentEnd.getDate() + (i * 7));

            records.push({
                title,
                instructor_name: instructor,
                price,
                capacity,
                start_time: currentStart.toISOString(),
                end_time: currentEnd.toISOString(),
                is_private: isPrivate,
                assigned_customer_email: isPrivate ? customerEmail : null
            });
        }

        let error;
        if (id) {
            const { error: err } = await supabase.from('classes').update(records[0]).eq('id', id);
            error = err;
        } else {
            const { error: err } = await supabase.from('classes').insert(records);
            error = err;
            
            // Deduct credits if private and new
            if (isPrivate && !error) {
                const { data: deductOk } = await supabase.rpc('deduct_one_on_one_credit', { 
                    user_email: customerEmail,
                    amount: records.length
                });
                if (!deductOk) {
                    // Note: We already scheduled them, but alerted about credit issue.
                    console.warn("Credit deduction failed - may have 0 credits.");
                }
            }
        }

        if (error) throw error;

        // Show Summary if in modal
        const modal = document.getElementById('manage-modal');
        if (!modal.classList.contains('hidden')) {
            document.getElementById('manage-form-container').classList.add('hidden');
            const summaryList = document.getElementById('scheduled-sessions-list');
            summaryList.innerHTML = records.map((r, idx) => `
                <div class="flex items-center space-x-4 bg-white/5 p-3 rounded-xl border border-white/5">
                    <div class="text-studio-gold font-bold text-lg w-6">${idx + 1}</div>
                    <div>
                        <div class="text-white text-sm font-medium">${new Date(r.start_time).toLocaleDateString()}</div>
                        <div class="text-gray-500 text-xs">${new Date(r.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                    </div>
                </div>
            `).join('');
            document.getElementById('manage-summary-view').classList.remove('hidden');

            // --- NEW: TRIGGER SCHEDULE EMAIL ---
            if (isPrivate) {
                await supabase.functions.invoke('booking-alert', {
                    body: { 
                        type: 'one_on_one_scheduled',
                        customerEmail: customerEmail,
                        sessions: records.map(r => ({
                            start_time: r.start_time,
                            title: r.title
                        }))
                    }
                });
            }
        } else {
            alert('Class saved successfully!');
            resetManageForm();
            loadScheduleManager();
            loadDashboard();
        }

    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        btn.innerText = oldText;
        btn.disabled = false;
    }
});

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
                            end_time: end.toISOString()
                        });
                    }
                }
            }
        }

        const { error } = await supabase.from('classes').insert(recordsToInsert);
        if (error) throw error;
        
        alert(`Successfully generated ${recordsToInsert.length} classes!`);
        loadScheduleManager();
        loadDashboard();
    } catch(err) {
        alert('Error: ' + err.message);
    } finally {
        btn.innerText = oldText;
        btn.disabled = false;
    }
};

// ========================================
// BILLING MODAL
// ========================================

const BILLING_CREDIT_MAP = {
    '4 Class Plan': 4,
    '6 Class Plan': 6,
    '8 Class Plan': 8,
    '12 Class Plan': 12,
};

const BILLING_1ON1_MAP = {
    '1:1 Session (1x)': 1,
    '1:1 Sessions (3x)': 3,
    '1:1 Sessions (5x)': 5,
};

window.openBillingModal = () => {
    const email = document.getElementById('cd-email').innerText;
    const name = document.getElementById('cd-name').innerText;

    document.getElementById('billing-email').value = email;
    document.getElementById('billing-name').value = name;
    document.getElementById('billing-customer-name').innerText = name;

    // Reset to form state
    document.getElementById('billing-form').classList.remove('hidden');
    document.getElementById('billing-success').classList.add('hidden');
    document.getElementById('billing-submit-btn').disabled = false;
    document.getElementById('billing-submit-btn').innerText = 'Send Payment Link';

    // Reset payment method to stripe
    document.querySelector('input[name="billing-payment"][value="stripe"]').checked = true;
    document.getElementById('billing-stripe-note').classList.remove('hidden');
    document.getElementById('billing-cash-note').classList.add('hidden');

    // Close customer details modal first
    document.getElementById('customer-details-modal').classList.add('hidden');
    document.getElementById('billing-modal').classList.remove('hidden');
};

window.closeBillingModal = () => {
    document.getElementById('billing-modal').classList.add('hidden');
};

// Toggle payment method notes and button text
document.querySelectorAll('input[name="billing-payment"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        const isStripe = e.target.value === 'stripe';
        document.getElementById('billing-stripe-note').classList.toggle('hidden', !isStripe);
        document.getElementById('billing-cash-note').classList.toggle('hidden', isStripe);
        document.getElementById('billing-submit-btn').innerText = isStripe ? 'Send Payment Link' : 'Mark as Paid';
    });
});

// Billing form submission
document.getElementById('billing-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('billing-submit-btn');
    const email = document.getElementById('billing-email').value;
    const name = document.getElementById('billing-name').value;
    const tier = document.getElementById('billing-tier').value;
    const paymentMethod = document.querySelector('input[name="billing-payment"]:checked').value;

    btn.disabled = true;
    btn.innerText = paymentMethod === 'stripe' ? 'Sending...' : 'Activating...';

    try {
        if (paymentMethod === 'stripe') {
            // === STRIPE PATH: Call admin-billing edge function ===
            const { data, error } = await supabase.functions.invoke('admin-billing', {
                body: { email, name, tier }
            });

            if (error) throw error;

            // Show success
            document.getElementById('billing-form').classList.add('hidden');
            document.getElementById('billing-success').classList.remove('hidden');
            document.getElementById('billing-success-title').innerText = 'Invoice Sent!';
            document.getElementById('billing-success-msg').innerText = 
                `A payment link for ${tier} has been emailed to ${name} at ${email}. Their account will update automatically when they pay.`;

        } else {
            // === CASH PATH: Update customer directly ===
            const isOneOnOne = tier.includes('1:1');
            const credits = BILLING_CREDIT_MAP[tier] || 0;
            const oneOnOneCredits = BILLING_1ON1_MAP[tier] || 0;

            // Get existing data to add credits
            const { data: existing } = await supabase
                .from('customers')
                .select('class_credits, one_on_one_credits')
                .eq('email', email)
                .maybeSingle();

            const updatePayload = {};

            if (isOneOnOne) {
                updatePayload.one_on_one_credits = (existing?.one_on_one_credits || 0) + oneOnOneCredits;
            } else {
                // Only set membership_type for unlimited tiers — class packs keep existing membership
                const UNLIM_BILLING = ['1 Month Unlimited', '3 Months Unlimited', '6 Months Unlimited', '12 Months Unlimited', 'Founder'];
                if (UNLIM_BILLING.includes(tier)) {
                    updatePayload.membership_type = tier;
                }
                updatePayload.class_credits = (existing?.class_credits || 0) + credits;

                // Set expiration
                const now = new Date();
                if (tier.includes('12 Months')) {
                    now.setMonth(now.getMonth() + 12);
                } else if (tier.includes('6 Months')) {
                    now.setMonth(now.getMonth() + 6);
                } else if (tier.includes('3 Months')) {
                    now.setMonth(now.getMonth() + 3);
                } else {
                    now.setMonth(now.getMonth() + 1);
                }
                updatePayload.membership_expires_at = now.toISOString();

                // For class experience packs (non-unlimited), set 30-day credit expiration
                const UNLIM_CHECK = ['1 Month Unlimited', '3 Months Unlimited', '6 Months Unlimited', '12 Months Unlimited', 'Founder'];
                if (!UNLIM_CHECK.includes(tier) && credits > 0) {
                    const credExp = new Date(); credExp.setDate(credExp.getDate() + 30);
                    updatePayload.credits_expires_at = credExp.toISOString();
                }
            }

            const { error: updateError } = await supabase
                .from('customers')
                .update(updatePayload)
                .eq('email', email);

            if (updateError) throw updateError;

            // Send cash receipt email via admin-billing edge function
            try {
                await supabase.functions.invoke('admin-billing', {
                    body: { email, name, tier, payment_method: 'cash' }
                });
            } catch (receiptErr) {
                console.error('Cash receipt email failed:', receiptErr);
                // Don't block — the payment was already processed
            }

            // Show success
            document.getElementById('billing-form').classList.add('hidden');
            document.getElementById('billing-success').classList.remove('hidden');
            document.getElementById('billing-success-title').innerText = 'Account Activated!';
            document.getElementById('billing-success-msg').innerText = 
                `${name}'s ${tier} has been activated and a receipt has been emailed. Remember to collect cash payment in person.`;

            // Refresh customer data
            loadCustomers();
        }
    } catch (err) {
        console.error('Billing error:', err);
        alert('Billing failed: ' + (err.message || err));
        btn.disabled = false;
        btn.innerText = paymentMethod === 'stripe' ? 'Send Payment Link' : 'Mark as Paid';
    }
});
