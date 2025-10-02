require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
] });
var CronJob = require('cron').CronJob;
const fs = require('fs')
const { fetch } = require('undici');

const Stream = require("./modules/getStreams.js")
const Auth = require("./modules/auth.js")
const Channel = require("./modules/channelData.js")

// Ensure local config exists; prefer template, do not import legacy config.json (secrets)
const TEMPLATE_PATH = './config.template.json';
const LOCAL_CONFIG_PATH = './config.local.json';
const LEGACY_CONFIG_PATH = './config.json';

function ensureLocalConfig() {
    if (!fs.existsSync(LOCAL_CONFIG_PATH)) {
        if (fs.existsSync(TEMPLATE_PATH)) {
            fs.copyFileSync(TEMPLATE_PATH, LOCAL_CONFIG_PATH);
        } else {
            fs.writeFileSync(LOCAL_CONFIG_PATH, JSON.stringify({
                DiscordServerId: "",
                cron: "*/10 * * * *",
                channelID: "",
                roleID: "",
                roleName: "",
                channels: [ { ChannelName: "", DiscordServer: "", twitch_stream_id: "", discord_message_id: "" } ]
            }));
        }
    }
}

function readConfig() {
    return JSON.parse(fs.readFileSync(LOCAL_CONFIG_PATH));
}

function writeConfig(obj) {
    fs.writeFileSync(LOCAL_CONFIG_PATH, JSON.stringify(obj));
}

ensureLocalConfig();
const initialConfig = readConfig();
const CRON_EXPR = process.env.CRON || initialConfig.cron || '*/10 * * * *';
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || initialConfig.DiscordServerId;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || initialConfig.channelID;
const ROLE_NAME = process.env.ROLE_NAME || initialConfig.roleName;
const ROLE_ID = process.env.ROLE_ID || initialConfig.roleID;
const ENABLE_AI = (process.env.ENABLE_AI || 'false').toLowerCase() === 'true';
const MAX_EDITS_PER_STREAM = Number(process.env.MAX_EDITS_PER_STREAM || 2);

// OpenRouter config
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o';
const OPENROUTER_VISION_MODEL = process.env.OPENROUTER_VISION_MODEL || 'moonshotai/kimi-vl-a3b-thinking:free';

// Ready
client.on('ready', async () => {
    //console.log(`Logged in as ${client.user.tag}!`);

    // Update the authorization key on startup
    UpdateAuthConfig()
});

client.on('messageCreate', async message => {
    if (!message.content.startsWith('!ai') || message.author.bot) {
        return;
    }
    if (!ENABLE_AI) {
        return message.reply("AI is disabled on this bot.");
    }
    const input = message.content.slice(4).trim();
    if (input.length === 0) {
        return message.reply("Please provide some input for AI.");
    }
    const feedbackMessage = await message.reply("Processing your request, please wait...");
    try {
        if (!OPENROUTER_API_KEY) {
            throw new Error('OPENROUTER_API_KEY is not set');
        }
        // Collect image attachments from the Discord message
        const imageAttachments = Array.from(message.attachments?.values?.() || [])
            .filter(att => {
                const ct = att.contentType || '';
                const name = att.name || att.url || '';
                return (ct.startsWith('image/')) || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
            })
            .slice(0, 3);

        const hasImages = imageAttachments.length > 0;
        const userContentParts = [];
        if (input) {
            userContentParts.push({ type: 'text', text: input });
        }
        for (const att of imageAttachments) {
            userContentParts.push({ type: 'image_url', image_url: { url: att.url } });
        }
        // Choose model: if images present and a distinct vision model is configured, use it; otherwise use regular model
        const modelToUse = (hasImages && OPENROUTER_VISION_MODEL && OPENROUTER_VISION_MODEL !== OPENROUTER_MODEL)
            ? OPENROUTER_VISION_MODEL
            : OPENROUTER_MODEL;
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: modelToUse,
                messages: [
                    { role: 'system', content: 'You are a helpful assistant inside a Discord bot.' },
                    hasImages ? { role: 'user', content: userContentParts } : { role: 'user', content: input }
                ]
            })
        });
        if (!res.ok) {
            const text = await res.text();
            const regionBlocked = res.status === 403 && /not available in your region/i.test(text);
            if (regionBlocked) {
                const err = new Error('AI provider not available in your region');
                err.code = 'REGION_BLOCK';
                err.details = text;
                throw err;
            }
            throw new Error(`OpenRouter error ${res.status}: ${text}`);
        }
        const json = await res.json();
        const responseText = json.choices?.[0]?.message?.content || '';
        if (!responseText || responseText.trim().length === 0) {
            feedbackMessage.edit("The AI did not return a valid response. Please try again.").catch(console.error);
            return;
        }

        // Discord content length guard with file fallback
        const MAX_DISCORD_CONTENT = 3800; // keep margin under 4000
        if (responseText.length > MAX_DISCORD_CONTENT) {
            await feedbackMessage.edit("Response is long; uploading as file...").catch(console.error);
            const buffer = Buffer.from(responseText, 'utf8');
            await message.channel.send({ files: [{ attachment: buffer, name: 'ai-response.txt' }] });
            return;
        }

        await feedbackMessage.edit(responseText).catch(async (e) => {
            // Fallback if edit still fails due to content constraints
            try {
                await feedbackMessage.edit("Response could not be sent inline; uploading as file...");
            } catch {}
            const buffer = Buffer.from(responseText, 'utf8');
            await message.channel.send({ files: [{ attachment: buffer, name: 'ai-response.txt' }] });
        });
    } catch (error) {
        console.error('Error in AI completion:', error);
        if (error.code === 'REGION_BLOCK') {
            const tip = `AI provider is not available in this region. Please set OPENROUTER_MODEL to a different model (e.g., openai/gpt-4o) and restart.`;
            feedbackMessage.edit(tip).catch(console.error);
        } else {
            feedbackMessage.edit("Sorry, I encountered an error while processing your request.").catch(console.error);
        }
    }
});

if (ROLE_NAME) {
    client.on('guildMemberAdd', member => {
        const role = member.guild.roles.cache.find(role => role.name === ROLE_NAME);
        member.roles.add(role);
    });
}

// Function that will run the checks
var Check = new CronJob(CRON_EXPR, async function () {
    const tempData = JSON.parse(fs.readFileSync(LOCAL_CONFIG_PATH));

    tempData.channels.map(async function (chan, i) {
        if (!chan.ChannelName) return;

        try {
            const twitchClientId = process.env.TWITCH_CLIENT_ID;
            if (!twitchClientId || !TWITCH_AUTH_TOKEN) return;
            let StreamData = await Stream.getData(chan.ChannelName, twitchClientId, TWITCH_AUTH_TOKEN);
            if (StreamData.data.length == 0) return;

            StreamData = StreamData.data[0];
            const ChannelData = await Channel.getData(chan.ChannelName, twitchClientId, TWITCH_AUTH_TOKEN);
            if (!ChannelData) return;

            const mentionTarget = ROLE_ID ? `<@&${ROLE_ID}>` : '@everyone';
            var message = `Hey ${mentionTarget}, ${StreamData.user_name} is now live on https://www.twitch.tv/${StreamData.user_login} Go check it out!`;
            var owner = false;
            if (StreamData.user_login === 'rebepoi') {
                owner = true;
            }

            var SendEmbed = {
                "title": StreamData.title,
                "url": `https://www.twitch.tv/${StreamData.user_login}`,
                "color": 6570404,
                "author": {
                    "name": `${StreamData.user_name}`,
                    "icon_url": `${ChannelData.thumbnail_url}`,
                    "url": `https://www.twitch.tv/${StreamData.user_login}`,
                },
                "fields": [
                    {
                        "name": "Playing:",
                        "value": StreamData.game_name,
                        "inline": true
                    },
                    {
                        "name": "Viewers:",
                        "value": StreamData.viewer_count,
                        "inline": true
                    },
                    (chan.DiscordServer ? {
                        "name": "Discord Server:",
                        "value": `Join here`
                    } : {
                        "name": "** **",
                        "value": "** **"
                    })
                ],
                "footer": {
                    "text": owner ? "Let us fail again!" : ""
                },
                "image": {
                    "url": `https://static-cdn.jtvnw.net/previews-ttv/live_user_${StreamData.user_login}-640x360.jpg?cacheBypass=${(Math.random()).toString()}`
                },
                "thumbnail": {
                    "url": `${ChannelData.thumbnail_url}`
                }
            };

            const guild = client.guilds.cache.get(DISCORD_GUILD_ID);
            if (!guild) {
                console.error('Guild not found. Ensure DISCORD_GUILD_ID is set and the bot is in the server.');
                return;
            }
            const channelObj = guild.channels.cache.get(DISCORD_CHANNEL_ID);
            if (!channelObj || !channelObj.isTextBased?.()) {
                console.error('Channel not found or not text-based. Ensure DISCORD_CHANNEL_ID is correct.');
                return;
            }
            const sendChannel = channelObj;

            if (chan.twitch_stream_id == StreamData.id) {
                const channelObj = tempData.channels[i];
                const currentEdits = Number(channelObj.edit_count || 0);
                if (currentEdits >= MAX_EDITS_PER_STREAM) {
                    // Stop refreshing to preserve the last good preview after stream ends
                } else {
                    await sendChannel.messages.fetch(chan.discord_message_id).then(msg => {
                        msg.edit({ embeds: [SendEmbed] });
                    }).catch(console.error);
                    channelObj.edit_count = currentEdits + 1;
                }
            } else {
                await sendChannel.send({ content: message, embeds: [SendEmbed] }).then(msg => {
                    const channelObj = tempData.channels[i];
                    channelObj.discord_message_id = msg.id;
                    channelObj.twitch_stream_id = StreamData.id;
                    channelObj.edit_count = 0; // reset for a new stream
                });
            }
            fs.writeFileSync(LOCAL_CONFIG_PATH, JSON.stringify(tempData));
        } catch (error) {
            console.error('Error fetching stream data:', error);
        }
    });
});

// In-memory Twitch OAuth token
let TWITCH_AUTH_TOKEN = '';

// Update the authorization key every hour
var updateAuth = new CronJob('0 * * * *', async function () {
    UpdateAuthConfig();
    //console.log(`Logged in as ${client.user.tag}!`);
});

// Get a new authorization key and update the config
async function UpdateAuthConfig(){
    const clientId = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_SECRET;

    const authKey = await Auth.getKey(clientId, clientSecret);
    if (!authKey) return;
    TWITCH_AUTH_TOKEN = authKey;
}

// Start the timers
updateAuth.start();
Check.start();

// no-op on disconnect for OpenRouter
client.on('disconnect', () => {});

// Login
client.login(DISCORD_TOKEN);
