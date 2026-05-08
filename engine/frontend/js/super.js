import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const supabaseUrl = 'YOUR_SUPABASE_URL'
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY'
const supabase = createClient(supabaseUrl, supabaseAnonKey)

const SUPER_ADMIN_EMAIL = 'YOUR_SUPER_ADMIN_EMAIL';

// Global State
let allOrgs = [];
let selectedOrgId = null;

// Auth State
supabase.auth.onAuthStateChange(async (event, session) => {
    if (session && session.user.email === SUPER_ADMIN_EMAIL) {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('super-dashboard').classList.remove('hidden');
        document.getElementById('super-admin-email').innerText = session.user.email;
        loadFleet();
    } else {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('super-dashboard').classList.add('hidden');
    }
});

// Initial Session Check
document.addEventListener('DOMContentLoaded', async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session && data.session.user.email === SUPER_ADMIN_EMAIL) {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('super-dashboard').classList.remove('hidden');
        loadFleet();
    }
});

// Login
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const msg = document.getElementById('login-msg');
    
    if (email !== SUPER_ADMIN_EMAIL) {
        msg.innerText = "ACCESS DENIED: UNAUTHORIZED IDENTITY";
        msg.className = "text-xs text-center mt-6 text-red-500 font-mono";
        return;
    }

    msg.innerText = "SENDING PROTOCOL...";
    const { error } = await supabase.auth.signInWithOtp({ 
        email,
        options: { emailRedirectTo: window.location.href }
    });

    if (error) {
        msg.innerText = "LINK DISPATCH FAILED: " + error.message;
    } else {
        msg.innerText = "CHECK SECURE INBOX FOR MAGIC LINK.";
    }
});

// Logout
document.getElementById('logout-btn').onclick = () => supabase.auth.signOut();

// Fleet Commander
async function loadFleet() {
    const orgList = document.getElementById('org-list');
    const orgCount = document.getElementById('org-count');

    const { data: orgs, error } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) return console.error('Fleet Load Error:', error);

    allOrgs = orgs || [];
    orgCount.innerText = allOrgs.length;
    orgList.innerHTML = '';

    allOrgs.forEach(org => {
        const btn = document.createElement('button');
        btn.className = "w-full text-left p-4 rounded-2xl hover:bg-white/5 transition-all border border-transparent hover:border-white/5 group relative overflow-hidden";
        btn.onclick = () => selectOrg(org.id);
        
        btn.innerHTML = `
            <div class="flex justify-between items-center relative z-10">
                <div>
                    <p class="text-sm font-medium text-white group-hover:text-organization-gold transition-colors">${org.name}</p>
                    <p class="text-[10px] text-gray-500 font-mono uppercase">${org.slug}</p>
                </div>
                <div class="text-right">
                    <svg class="w-4 h-4 text-gray-700 group-hover:text-organization-gold transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"></path></svg>
                </div>
            </div>
            <div class="absolute inset-0 bg-organization-gold/0 group-hover:bg-organization-gold/5 transition-all"></div>
        `;
        orgList.appendChild(btn);
    });

    calculateGlobalStats();
}

async function calculateGlobalStats() {
    const statsContainer = document.getElementById('global-stats');

    // Fetch Global Subscriptions (RLS Super Admin Bypass)
    const { data: subs, error } = await supabase.from('subscriptions').select('plan_interval, status');
    if (error) return console.error('Global Audit Error:', error);

    const active = subs.filter(s => s.status === 'active');
    const totalMRR = active.reduce((acc, s) => {
        const val = s.plan_interval === '1-month' ? 100 : (250 / 3);
        return acc + val;
    }, 0);

    const stats = [
        { label: 'Total Fleet MRR', value: `$${totalMRR.toFixed(0)}`, color: 'text-organization-gold' },
        { label: 'Fleet Organizations', value: allOrgs.length, color: 'text-white' },
        { label: 'Active Subscribers', value: active.length, color: 'text-white' },
        { label: 'Platform Utilization', value: '94%', color: 'text-green-400' }
    ];

    statsContainer.innerHTML = stats.map(s => `
        <div class="bg-white/5 border border-white/10 p-8 rounded-3xl shadow-xl backdrop-blur-md">
            <p class="text-gray-500 text-[10px] uppercase tracking-[0.2em] font-bold mb-2">${s.label}</p>
            <p class="text-4xl font-serif ${s.color}">${s.value}</p>
        </div>
    `).join('');
}

async function selectOrg(orgId) {
    selectedOrgId = orgId;
    const org = allOrgs.find(o => o.id === orgId);
    
    document.getElementById('no-org-selected').classList.add('hidden');
    document.getElementById('selected-org-header').classList.remove('hidden');
    document.getElementById('org-intel-grid').classList.remove('hidden');
    
    document.getElementById('target-org-name').innerText = org.name;
    document.getElementById('target-org-slug').innerText = org.slug;
    
    // Load Org Specific Intel
    loadOrgActivity(orgId);

    // Update Action Buttons
    // Since this is a static engine, we point to the generic admin.html 
    // but in a real Super Admin portal we would append the org_id to the session or storage
    document.getElementById('btn-view-admin').onclick = () => {
        localStorage.setItem('impersonate_org_id', orgId);
        window.open('admin.html', '_blank');
    };
    document.getElementById('btn-view-billing').onclick = () => {
        localStorage.setItem('impersonate_org_id', orgId);
        window.open('billing.html', '_blank');
    };
}

async function loadOrgActivity(orgId) {
    const list = document.getElementById('recent-activity-list');
    list.innerHTML = '<p class="text-gray-600 text-sm animate-pulse">Syncing activity stream...</p>';

    // Fetch recent bookings for this org
    const { data: bookings, error } = await supabase
        .from('bookings')
        .select('created_at, status, event_id')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(5);

    if (error || !bookings.length) {
        list.innerHTML = '<p class="text-gray-600 text-sm italic">No recent activity detected.</p>';
        return;
    }

    list.innerHTML = bookings.map(b => `
        <div class="flex items-center justify-between border-b border-white/5 pb-4">
            <div>
                <p class="text-sm text-white">New Booking Received</p>
                <p class="text-[10px] text-gray-500 font-mono">${new Date(b.created_at).toLocaleString()}</p>
            </div>
            <span class="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 uppercase tracking-tighter">${b.status}</span>
        </div>
    `).join('');
}
