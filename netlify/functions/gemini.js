// netlify/functions/gemini.js
// Proxy untuk Gemini API - API key aman di server, tidak terlihat di frontend

exports.handler = async (event) => {
  // Hanya izinkan POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // API key disimpan di environment variable Netlify (aman)
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: { message: 'API key belum dikonfigurasi di Netlify' } }) 
    };
  }

  try {
    const body = JSON.parse(event.body);
    const model = body.model || 'gemini-1.5-flash';

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body.payload),
      }
    );

    const data = await response.json();

    return {
      statusCode: response.status,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: { message: err.message } }),
    };
  }
};
