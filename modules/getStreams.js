const request = require('request');

async function getData(channelName, clientID, authkey) {
    return new Promise((resolve, reject) => {
        const headers = {
            'Client-Id': clientID,
            'Authorization': `Bearer ${authkey}`
        };

        const options = {
            url: `https://api.twitch.tv/helix/streams?user_login=${channelName}`,
            headers: headers,
            timeout: 10000 // 10 seconds timeout
        };

        const makeRequest = (attemptsLeft) => {
            request.get(options, (error, res, body) => {
                if (error) {
                    console.error('Request error:', error);
                    if (attemptsLeft <= 1) {
                        return reject(error);
                    }
                    // Retry after a delay
                    setTimeout(() => makeRequest(attemptsLeft - 1), 2000);
                    return;
                }

                // Check if the response is JSON
                if (body.trim().startsWith('<')) {
                    console.error('Unexpected HTML response:', { statusCode: res.statusCode, headers: res.headers, body });
                    if (attemptsLeft <= 1) {
                        return reject(new Error('Unexpected HTML response'));
                    }
                    // Retry after a delay
                    setTimeout(() => makeRequest(attemptsLeft - 1), 2000);
                    return;
                }

                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(e);
                }
            });
        };

        makeRequest(3); // Try up to 3 times
    });
}

module.exports = { getData };
