const { fetch } = require('undici');

async function getData(channelName, clientID, authkey) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
        const headers = {
            'Client-Id': clientID,
            'Authorization': `Bearer ${authkey}`
        };
        const url = `https://api.twitch.tv/helix/search/channels?query=${encodeURIComponent(channelName)}`;
        const res = await fetch(url, { method: 'GET', headers, signal: controller.signal });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Twitch search failed: ${res.status} ${text}`);
        }
        const json = await res.json();
        const channelTempData = json.data || [];
        for (let i = 0; i < channelTempData.length; i++) {
            if ((channelTempData[i].broadcaster_login).toLowerCase() === channelName.toLowerCase()) {
                return channelTempData[i];
            }
        }
        return false;
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = { getData };
