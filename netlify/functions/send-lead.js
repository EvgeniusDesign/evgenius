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

  try {
    const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text })
    });
    if (!res.ok) throw new Error('Telegram API error');
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch {
    return { statusCode: 502, body: JSON.stringify({ ok: false }) };
  }
};
