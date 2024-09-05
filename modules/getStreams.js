const request = require('request');

async function getData(channelName, clientID, authkey) {
    return new Promise((resolve, reject) => {
        var headers = {
            'Client-Id': clientID,
            'Authorization': `Bearer ${authkey}`
        };
        request.get(
            `https://api.twitch.tv/helix/streams?user_login=${channelName}`, { headers: headers, timeout: 10000 }, // Set a timeout of 10 seconds
            (error, res, body) => {
                if (error) {
                    console.error('Request error:', error);
                    return reject(error);
                }
                // Check if the response is JSON
                if (body.trim().startsWith('<')) {
                    console.error('Unexpected HTML response:', body);
                    return reject(new Error('Unexpected HTML response'));
                }
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(e);
                }
            }
        );
    });
}

module.exports = { getData };
