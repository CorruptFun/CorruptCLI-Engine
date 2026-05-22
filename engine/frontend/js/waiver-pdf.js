// ── Waiver PDF Generator ──────────────────────────────────────────────────
// Opens a print-formatted window with the full signed waiver document.
// Called from the customer details modal "View Waiver" button.
// Uses window.currentCustomerDetails set by openCustomerDetailsModal().

window.generateWaiverPDF = () => {
    const mem = window.currentCustomerDetails;
    if (!mem || !mem.waiver_signed_at) {
        alert('This customer has not signed a waiver yet.');
        return;
    }

    const signedDate = new Date(mem.waiver_signed_at);
    const formattedDate = signedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const formattedTime = signedDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    const dobFormatted = mem.date_of_birth
        ? new Date(mem.date_of_birth + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : 'N/A';

    const minorSection = mem.waiver_minor_guardian_name
        ? `<div class="sig-item" style="grid-column: 1 / -1;"><label>Parent/Guardian (Minor)</label><span>${mem.waiver_minor_guardian_name}</span></div>`
        : '';
    const minorBadge = mem.waiver_minor_guardian_name
        ? '<span class="consent-badge consent-yes">Minor Participant</span>'
        : '';
    const secEmailRow = mem.secondary_email
        ? `<div class="info-item full"><label>Secondary Email</label><span>${mem.secondary_email}</span></div>`
        : '';
    const goalsRow = mem.fitness_goals
        ? `<div class="info-item full"><label>Fitness Goals &amp; Medical Concerns</label><span>${mem.fitness_goals}</span></div>`
        : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>{{CLIENT_NAME}} Waiver — ${mem.name}</title>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@300;400;500;600&family=Great+Vibes&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', sans-serif; color: #1a1a1a; padding: 40px 60px; max-width: 850px; margin: 0 auto; line-height: 1.6; font-size: 11pt; }
        @media print {
            body { padding: 20px 40px; }
            .no-print { display: none !important; }
            @page { margin: 0.6in; size: letter; }
        }
        h1 { font-family: 'Playfair Display', serif; font-size: 24pt; text-align: center; margin-bottom: 4px; letter-spacing: 2px; }
        .subtitle { text-align: center; color: #8c6b2e; font-size: 10pt; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 30px; font-weight: 600; }
        .divider { border: none; border-top: 2px solid #cba153; margin: 20px 0; }
        .section-title { font-family: 'Playfair Display', serif; font-size: 13pt; font-weight: 700; margin: 24px 0 12px; color: #1a1a1a; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 16px; }
        .info-item label { display: block; font-size: 8pt; text-transform: uppercase; letter-spacing: 1.5px; color: #999; font-weight: 600; margin-bottom: 2px; }
        .info-item span { font-size: 10.5pt; color: #1a1a1a; }
        .info-item.full { grid-column: 1 / -1; }
        .waiver-text { font-size: 9.5pt; color: #333; line-height: 1.55; }
        .waiver-text p { margin-bottom: 10px; }
        .waiver-text .clause-title { font-weight: 700; color: #1a1a1a; margin-top: 14px; }
        .waiver-text .release-clause { text-transform: uppercase; font-size: 9pt; }
        .signature-block { margin-top: 30px; padding: 24px; border: 2px solid #cba153; border-radius: 12px; background: #fdfbf7; }
        .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .sig-item label { display: block; font-size: 8pt; text-transform: uppercase; letter-spacing: 1.5px; color: #8c6b2e; font-weight: 600; margin-bottom: 4px; }
        .sig-item span { font-size: 10.5pt; }
        .sig-name { font-family: 'Great Vibes', cursive; font-size: 28pt; color: #1a1a1a; border-bottom: 1px solid #cba153; display: inline-block; padding-bottom: 2px; }
        .consent-badges { display: flex; gap: 12px; margin-top: 12px; flex-wrap: wrap; }
        .consent-badge { font-size: 8.5pt; padding: 4px 12px; border-radius: 20px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
        .consent-yes { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
        .consent-no { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
        .print-bar { text-align: center; margin-bottom: 24px; }
        .print-bar button { font-family: 'Inter', sans-serif; padding: 10px 28px; border: none; border-radius: 24px; cursor: pointer; font-size: 11pt; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; margin: 0 6px; }
        .btn-print { background: #cba153; color: #0a0a0a; }
        .btn-print:hover { background: #8c6b2e; color: white; }
        .btn-close { background: #e5e5e5; color: #333; }
        .btn-close:hover { background: #ccc; }
        .footer { margin-top: 30px; text-align: center; font-size: 8pt; color: #aaa; border-top: 1px solid #e5e5e5; padding-top: 12px; }
    </style>
</head>
<body>
    <div class="print-bar no-print">
        <button class="btn-print" onclick="window.print()">Print / Save PDF</button>
        <button class="btn-close" onclick="window.close()">Close</button>
    </div>

    <h1>{{CLIENT_NAME}}</h1>
    <div class="subtitle">Liability Waiver &amp; Release Agreement</div>
    <hr class="divider">

    <div class="section-title">Participant Information</div>
    <div class="info-grid">
        <div class="info-item"><label>Full Name</label><span>${mem.name || 'N/A'}</span></div>
        <div class="info-item"><label>Email</label><span>${mem.email || 'N/A'}</span></div>
        <div class="info-item"><label>Phone</label><span>${mem.phone || 'N/A'}</span></div>
        <div class="info-item"><label>Date of Birth</label><span>${dobFormatted}</span></div>
        <div class="info-item full"><label>Address</label><span>${mem.address || 'N/A'}</span></div>
        <div class="info-item"><label>Emergency Contact</label><span>${mem.emergency_contact_name || 'N/A'}</span></div>
        <div class="info-item"><label>Emergency Phone</label><span>${mem.emergency_contact_phone || 'N/A'}</span></div>
        ${secEmailRow}
        ${goalsRow}
    </div>

    <div class="section-title">Agreement</div>
    <div class="waiver-text">
        <!-- LEGAL TEXT PLACEHOLDER: Add your own liability waiver text here. Consult with a legal professional for your jurisdiction. -->
    </div>

    <div class="signature-block">
        <div style="margin-bottom: 16px;">
            <label style="font-size: 8pt; text-transform: uppercase; letter-spacing: 1.5px; color: #8c6b2e; font-weight: 600;">Electronic Signature</label><br>
            <span class="sig-name">${mem.waiver_legal_name}</span>
        </div>
        <div class="sig-grid">
            <div class="sig-item"><label>Date Signed</label><span>${formattedDate}</span></div>
            <div class="sig-item"><label>Time</label><span>${formattedTime}</span></div>
            <div class="sig-item"><label>IP Address</label><span style="font-family: monospace; font-size: 9.5pt;">${mem.waiver_ip_address || 'N/A'}</span></div>
            <div class="sig-item"><label>Signatory</label><span>${mem.name}</span></div>
            ${minorSection}
        </div>
        <div class="consent-badges">
            <span class="consent-badge ${mem.waiver_photo_release ? 'consent-yes' : 'consent-no'}">${mem.waiver_photo_release ? '✓ Photo Release Granted' : '✗ Photo Release Declined'}</span>
            ${minorBadge}
        </div>
    </div>

    <div class="footer">
        {{CLIENT_NAME}} &mdash; Signed Liability Waiver &amp; Release Agreement<br>
        Document generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} &middot; This document is a digital record of the electronically signed waiver.
    </div>
</body>
</html>`;

    const waiverWindow = window.open('', '_blank', 'width=900,height=1100');
    waiverWindow.document.write(html);
    waiverWindow.document.close();
};
