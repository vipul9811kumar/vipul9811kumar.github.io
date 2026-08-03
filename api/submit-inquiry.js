export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { name, email, phone, company, inquiryType, budget, message, website } = req.body;

    // Honeypot: real users never see or fill this field, so any value means a bot.
    // Return success without writing to Airtable/Resend so the bot thinks it worked.
    if (website) {
        console.warn('Honeypot triggered on submit-inquiry, dropping submission');
        return res.status(200).json({ success: true });
    }

    if (!name || !email || !inquiryType) {
        return res.status(400).json({ error: 'Name, email and inquiry type are required' });
    }

    const AIRTABLE_TOKEN   = process.env.AIRTABLE_TOKEN;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
    const RESEND_API_KEY   = process.env.RESEND_API_KEY;

    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
        console.error('Missing env vars: AIRTABLE_TOKEN or AIRTABLE_BASE_ID');
        return res.status(500).json({ error: 'Server misconfiguration' });
    }

    // ── 1. Write to Airtable ──────────────────────────────────────────────
    let airtableRes;
    try {
        airtableRes = await fetch(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Leads`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
                    'Content-Type':  'application/json',
                },
                body: JSON.stringify({
                    fields: {
                        Name:             name,
                        Email:            email,
                        Phone:            phone        || '',
                        Company:          company      || '',
                        'Inquiry Type':   inquiryType,
                        'Budget Range':   budget       || '',
                        Message:          message      || '',
                        Status:           'New',
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
        return res.status(500).json({ error: 'Failed to save inquiry', detail: errText });
    }

    // ── 2. Send emails via Resend (awaited but non-fatal) ─────────────────
    if (RESEND_API_KEY) {
        try {
            await Promise.all([
                // Owner notification
                fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        from:    'VKDesignLabs <noreply@vkdesignlabs.com>',
                        to:      ['vk@vkdesignlabs.com'],
                        subject: `New inquiry — ${inquiryType} · ${name}`,
                        html: `
                            <div style="font-family:sans-serif; max-width:560px; margin:0 auto; color:#1e293b;">
                                <div style="background:#06090f; padding:24px 32px; border-radius:12px 12px 0 0;">
                                    <span style="color:#c9a03e; font-weight:800; font-size:20px;">VK</span>
                                    <span style="color:#475569;">.</span>
                                    <span style="color:#475569; font-size:13px; margin-left:8px;">New inquiry received</span>
                                </div>
                                <div style="border:1px solid #e2e8f0; border-top:none; padding:32px; border-radius:0 0 12px 12px;">
                                    <table style="width:100%; border-collapse:collapse;">
                                        <tr><td style="padding:8px 0; color:#64748b; font-size:13px; width:130px;">Name</td><td style="padding:8px 0; font-weight:600;">${name}</td></tr>
                                        <tr><td style="padding:8px 0; color:#64748b; font-size:13px;">Email</td><td style="padding:8px 0;"><a href="mailto:${email}" style="color:#c9a03e;">${email}</a></td></tr>
                                        <tr><td style="padding:8px 0; color:#64748b; font-size:13px;">Phone</td><td style="padding:8px 0;">${phone || '—'}</td></tr>
                                        <tr><td style="padding:8px 0; color:#64748b; font-size:13px;">Company</td><td style="padding:8px 0;">${company || '—'}</td></tr>
                                        <tr><td style="padding:8px 0; color:#64748b; font-size:13px;">Inquiry Type</td><td style="padding:8px 0;"><strong style="color:#c9a03e;">${inquiryType}</strong></td></tr>
                                        <tr><td style="padding:8px 0; color:#64748b; font-size:13px;">Budget</td><td style="padding:8px 0;">${budget || '—'}</td></tr>
                                        <tr><td style="padding:8px 0; color:#64748b; font-size:13px; vertical-align:top;">Message</td><td style="padding:8px 0;">${message || '—'}</td></tr>
                                    </table>
                                    <div style="margin-top:24px; padding-top:24px; border-top:1px solid #f1f5f9; font-size:12px; color:#94a3b8;">
                                        Submitted via vkdesignlabs.com
                                    </div>
                                </div>
                            </div>
                        `,
                    }),
                }),
                // Submitter confirmation
                fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        from:    'Vipul Kumar <noreply@vkdesignlabs.com>',
                        to:      [email],
                        subject: `Got your message, ${name.split(' ')[0]} — I'll be in touch shortly`,
                        html: `
                            <div style="font-family:sans-serif; max-width:560px; margin:0 auto; color:#1e293b;">
                                <div style="background:#06090f; padding:24px 32px; border-radius:12px 12px 0 0;">
                                    <span style="color:#c9a03e; font-weight:800; font-size:20px;">VK</span>
                                    <span style="color:#475569; font-size:13px; margin-left:8px;">· vkdesignlabs.com</span>
                                </div>
                                <div style="border:1px solid #e2e8f0; border-top:none; padding:32px; border-radius:0 0 12px 12px;">
                                    <p style="font-size:16px; font-weight:600; margin:0 0 12px;">Hi ${name.split(' ')[0]},</p>
                                    <p style="color:#475569; line-height:1.6; margin:0 0 16px;">Thanks for reaching out — I've received your inquiry and will get back to you within 24 hours.</p>
                                    <p style="color:#475569; line-height:1.6; margin:0 0 24px;">In the meantime, feel free to book a 30-minute discovery call directly:</p>
                                    <a href="https://cal.com/vipul_kumar/discovery-call"
                                       style="display:inline-block; background:#c9a03e; color:#06090f; text-decoration:none; font-weight:700; padding:12px 24px; border-radius:8px; font-size:14px;">
                                        Book a Discovery Call →
                                    </a>
                                    <div style="margin-top:32px; padding-top:24px; border-top:1px solid #f1f5f9; font-size:12px; color:#94a3b8;">
                                        Vipul Kumar · Fractional CTO &amp; AI Transformation Practice Lead · vkdesignlabs.com
                                    </div>
                                </div>
                            </div>
                        `,
                    }),
                }),
            ]);
            console.log('Resend OK: both emails sent');
        } catch (err) {
            console.error('Resend fetch error:', err);
        }
    }

    return res.status(200).json({ success: true });
}
