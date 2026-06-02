export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { name, email, phone, yearsExp, currentRole, targetRole, prepGap, linkedin } = req.body;

    if (!name || !email || !currentRole || !targetRole) {
        return res.status(400).json({ error: 'Name, email, current role and target role are required' });
    }

    const AIRTABLE_TOKEN   = process.env.AIRTABLE_TOKEN;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
    const RESEND_API_KEY   = process.env.RESEND_API_KEY;

    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
        console.error('Missing env vars: AIRTABLE_TOKEN or AIRTABLE_BASE_ID');
        return res.status(500).json({ error: 'Server misconfiguration' });
    }

    // ── 1. Write to Airtable Mock2Momentum table ──────────────────────────
    let airtableRes;
    try {
        airtableRes = await fetch(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Mock2Momentum`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
                    'Content-Type':  'application/json',
                },
                body: JSON.stringify({
                    fields: {
                        Name:               name,
                        Email:              email,
                        Phone:              phone        || '',
                        'Years Experience': yearsExp    || '',
                        'Current Role':     currentRole,
                        'Target AI Role':   targetRole,
                        'Biggest Challenge': prepGap    || '',
                        'LinkedIn URL':     linkedin     || '',
                        Status:             'New',
                    },
                }),
            }
        );
    } catch (err) {
        console.error('Airtable fetch error:', err);
        return res.status(500).json({ error: 'Failed to reach Airtable' });
    }

    if (!airtableRes.ok) {
        const errText = await airtableRes.text();
        console.error('Airtable error response:', airtableRes.status, errText);
        return res.status(500).json({ error: 'Failed to save', detail: errText });
    }

    // ── 2. Notify via Resend (awaited but non-fatal) ──────────────────────
    if (RESEND_API_KEY) {
        try {
            const resendRes = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${RESEND_API_KEY}`,
                    'Content-Type':  'application/json',
                },
                body: JSON.stringify({
                    from:    'Mock2Momentum <noreply@vkdesignlabs.com>',
                    to:      ['vk@vkdesignlabs.com'],
                    subject: `Mock2Momentum booking — ${name} · ${targetRole}`,
                    html: `
                        <div style="font-family:sans-serif; max-width:560px; margin:0 auto; color:#1e293b;">
                            <div style="background:#06090f; padding:24px 32px; border-radius:12px 12px 0 0;">
                                <span style="color:#c9a03e; font-weight:800; font-size:18px;">Mock2Momentum</span>
                                <span style="color:#475569; font-size:13px; margin-left:8px;">· New coaching request</span>
                            </div>
                            <div style="border:1px solid #e2e8f0; border-top:none; padding:32px; border-radius:0 0 12px 12px;">
                                <table style="width:100%; border-collapse:collapse;">
                                    <tr><td style="padding:8px 0; color:#64748b; font-size:13px; width:150px;">Name</td><td style="padding:8px 0; font-weight:600;">${name}</td></tr>
                                    <tr><td style="padding:8px 0; color:#64748b; font-size:13px;">Email</td><td style="padding:8px 0;"><a href="mailto:${email}" style="color:#c9a03e;">${email}</a></td></tr>
                                    <tr><td style="padding:8px 0; color:#64748b; font-size:13px;">Phone</td><td style="padding:8px 0;">${phone || '—'}</td></tr>
                                    <tr><td style="padding:8px 0; color:#64748b; font-size:13px;">Years in IT</td><td style="padding:8px 0;">${yearsExp || '—'}</td></tr>
                                    <tr><td style="padding:8px 0; color:#64748b; font-size:13px;">Current Role</td><td style="padding:8px 0;">${currentRole}</td></tr>
                                    <tr><td style="padding:8px 0; color:#64748b; font-size:13px;">Target AI Role</td><td style="padding:8px 0;"><strong style="color:#c9a03e;">${targetRole}</strong></td></tr>
                                    <tr><td style="padding:8px 0; color:#64748b; font-size:13px; vertical-align:top;">Biggest Gap</td><td style="padding:8px 0;">${prepGap || '—'}</td></tr>
                                    <tr><td style="padding:8px 0; color:#64748b; font-size:13px;">LinkedIn</td><td style="padding:8px 0;">${linkedin ? `<a href="${linkedin}" style="color:#c9a03e;">${linkedin}</a>` : '—'}</td></tr>
                                </table>
                                <div style="margin-top:24px; padding-top:24px; border-top:1px solid #f1f5f9; font-size:12px; color:#94a3b8;">
                                    Submitted via vkdesignlabs.com · Mock2Momentum
                                </div>
                            </div>
                        </div>
                    `,
                }),
            });
            if (!resendRes.ok) {
                const body = await resendRes.text();
                console.error('Resend error:', resendRes.status, body);
            } else {
                console.log('Resend OK:', resendRes.status);
            }
        } catch (err) {
            console.error('Resend fetch error:', err);
        }
    }

    return res.status(200).json({ success: true });
}
