const { fetch } = require('undici');

async function getData(channelName, clientID, authkey) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
        const headers = {
            'Client-Id': clientID,
            'Authorization': `Bearer ${authkey}`
        };
        const url = `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(channelName)}`;
        const res = await fetch(url, { method: 'GET', headers, signal: controller.signal });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Twitch streams failed: ${res.status} ${text}`);
        }
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            const text = await res.text();
            throw new Error(`Unexpected content-type: ${contentType}. Body: ${text}`);
        }
        return await res.json();
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = { getData };
