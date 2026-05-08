import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const supabaseUrl = 'YOUR_SUPABASE_URL'
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY'
const orgId = localStorage.getItem('impersonate_org_id') || ORG_ID_PLACEHOLDER
const supabase = createClient(supabaseUrl, supabaseAnonKey)

let allSubscriptions = [];

async function initBilling() {
    const tableBody = document.getElementById('subs-table-body');
    const searchInput = document.getElementById('search-subs');

    // Fetch Subscriptions
    let query = supabase
        .from('subscriptions')
        .select('*')
        .order('created_at', { ascending: false });

    if (orgId) {
        query = query.eq('org_id', orgId);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Billing Error:', error);
        tableBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-400 font-light">Failed to load revenue data.</td></tr>`;
        return;
    }

    allSubscriptions = data || [];
    renderDashboard(allSubscriptions);

    // Search Logic
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allSubscriptions.filter(s => 
            (s.email && s.email.toLowerCase().includes(term)) || 
            (s.first_name && s.first_name.toLowerCase().includes(term))
        );
        renderTable(filtered);
    });
}

function renderDashboard(subs) {
    renderStats(subs);
    renderTable(subs);
}

function renderStats(subs) {
    const container = document.getElementById('stats-container');
    
    const active = subs.filter(s => s.status === 'active');
    const pastDue = subs.filter(s => s.status === 'past_due');
    
    // Logic: 1-month = $100, 3-month = $250
    const mrr = active.reduce((acc, s) => {
        const val = s.plan_interval === '1-month' ? 100 : (250 / 3);
        return acc + val;
    }, 0);

    const stats = [
        { label: 'Estimated MRR', value: `$${mrr.toFixed(0)}`, color: 'text-organization-gold' },
        { label: 'Active Plans', value: active.length, color: 'text-white' },
        { label: 'Past Due', value: pastDue.length, color: 'text-red-400' },
        { label: 'Gross Revenue', value: `$${(active.length * 100).toLocaleString()}`, color: 'text-gray-400' }
    ];

    container.innerHTML = stats.map(s => `
        <div class="bg-white/5 border border-white/10 p-8 rounded-3xl shadow-xl backdrop-blur-md">
            <p class="text-gray-500 text-[10px] uppercase tracking-[0.2em] font-bold mb-2">${s.label}</p>
            <p class="text-4xl font-serif ${s.color}">${s.value}</p>
        </div>
    `).join('');
}

function renderTable(subs) {
    const tableBody = document.getElementById('subs-table-body');
    
    if (subs.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-gray-500 font-light">No subscriptions found.</td></tr>`;
        return;
    }

    tableBody.innerHTML = subs.map(s => {
        const statusColor = s.status === 'active' ? 'text-green-400 border-green-400/20 bg-green-400/5' : 'text-red-400 border-red-400/20 bg-red-400/5';
        const date = new Date(s.current_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        
        return `
            <tr class="border-t border-white/5 hover:bg-white/[0.02] transition-colors group">
                <td class="p-8">
                    <div class="text-white font-medium group-hover:text-organization-gold transition-colors">${s.first_name || 'Anonymous'}</div>
                    <div class="text-[11px] text-gray-500 tracking-wider">${s.email}</div>
                </td>
                <td class="p-8">
                    <span class="text-[11px] px-3 py-1 bg-white/5 rounded-full border border-white/10 uppercase tracking-widest text-gray-400">${s.plan_interval}</span>
                </td>
                <td class="p-8 text-center">
                    <span class="text-[10px] font-bold px-3 py-1 rounded-full border ${statusColor} uppercase tracking-widest">${s.status}</span>
                </td>
                <td class="p-8 text-sm text-gray-400 font-light">
                    ${date}
                </td>
                <td class="p-8 text-right font-serif text-organization-gold">
                    $${s.plan_interval === '1-month' ? '100.00' : '250.00'}
                </td>
            </tr>
        `;
    }).join('');
}

// Global scope for search/refresh if needed
window.refreshBilling = initBilling;

// Initialize
initBilling();
