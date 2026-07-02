const crypto = require('crypto');

const FB_PIXEL_ID = process.env.FB_PIXEL_ID || '1375851101356106';

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function getCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function sendToCapi({ contact, eventId, url, headers }) {
  const CAPI_TOKEN = process.env.CAPI_ACCESS_TOKEN;
  if (!CAPI_TOKEN) return Promise.resolve();

  const cookieHeader = headers.cookie || headers.Cookie || '';
  const clientIp = (headers['x-nf-client-connection-ip'] || (headers['x-forwarded-for'] || '').split(',')[0]).trim();
  const userAgent = headers['user-agent'] || '';
  const fbp = getCookie(cookieHeader, '_fbp');
  const fbc = getCookie(cookieHeader, '_fbc');

  const digits = contact.replace(/[^\d]/g, '');
  const looksLikePhone = digits.length >= 9;

  const userData = {};
  if (clientIp) userData.client_ip_address = clientIp;
  if (userAgent) userData.client_user_agent = userAgent;
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;
  if (looksLikePhone) userData.ph = [sha256(digits)];
  userData.external_id = [sha256(contact.toLowerCase())];

  const payload = {
    data: [{
      event_name: 'Lead',
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      event_source_url: url,
      action_source: 'website',
      user_data: userData
    }]
  };
  if (process.env.FB_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.FB_TEST_EVENT_CODE;
  }

  return fetch(`https://graph.facebook.com/v19.0/${FB_PIXEL_ID}/events?access_token=${CAPI_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(() => {});
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const name = (data.name || '').toString().trim().slice(0, 200);
  const contact = (data.contact || '').toString().trim().slice(0, 200);
  const biz = (data.biz || '').toString().trim().slice(0, 200);
  const eventId = (data.eventId || '').toString().trim().slice(0, 200);
  const url = (data.url || '').toString().trim().slice(0, 500);

  if (!name || !contact) {
    return { statusCode: 400, body: 'Missing required fields' };
  }

  const TG_TOKEN = process.env.TG_TOKEN;
  const TG_CHAT = process.env.TG_CHAT;

  if (!TG_TOKEN || !TG_CHAT) {
    return { statusCode: 500, body: 'Server not configured' };
  }

  const text = [
    '🔔 Нова заявка з сайту',
    '',
    `👤 Ім'я: ${name}`,
    `📬 Контакт: ${contact}`,
    biz ? `🏢 Бізнес: ${biz}` : ''
  ].filter(Boolean).join('\n');

  const capiPromise = eventId ? sendToCapi({ contact, eventId, url, headers: event.headers }) : Promise.resolve();

  try {
    const [res] = await Promise.all([
      fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TG_CHAT, text })
      }),
      capiPromise
    ]);
    if (!res.ok) throw new Error('Telegram API error');
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch {
    return { statusCode: 502, body: JSON.stringify({ ok: false }) };
  }
};
