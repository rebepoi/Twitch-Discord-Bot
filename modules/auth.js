const { fetch } = require('undici');

async function getKey(clientID, clientSecret) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
        const url = `https://id.twitch.tv/oauth2/token?client_id=${clientID}&client_secret=${clientSecret}&grant_type=client_credentials`;
        const res = await fetch(url, { method: 'POST', signal: controller.signal });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Twitch auth failed: ${res.status} ${text}`);
        }
        const json = await res.json();
        return json.access_token;
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = { getKey };
