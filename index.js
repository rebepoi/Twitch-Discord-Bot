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
const { loadModel, createCompletion } = require('gpt4all');

const Stream = require("./modules/getStreams.js")
const Auth = require("./modules/auth.js")
const Channel = require("./modules/channelData.js")
const config = require('./config.json')

// Load the GPT-4All model during the bot startup
let aiModel;

async function loadAIModel() {
    aiModel = await loadModel('Meta-Llama-3-8B-Instruct.Q4_0.gguf', { verbose: true, device: 'cpu' });
}

// Ready
client.on('ready', async () => {
    //console.log(`Logged in as ${client.user.tag}!`);
    await loadAIModel();  // Load the AI model

    // Update the authorization key on startup
    UpdateAuthConfig()
});

client.on('messageCreate', async message => {
    //console.log(`Received message: ${message.content}`); // Log the received message

    // Check if the message starts with '!ai' and is not from a bot
    if (!message.content.startsWith('!ai') || message.author.bot) {
        return; // Ignore the message if it does not start with '!ai' or is from a bot
    }

    const input = message.content.slice(4).trim(); // Remove the command part
    //console.log(`AI input: ${input}`); // Log the parsed input

    if (input.length === 0) {
        return message.reply("Please provide some input for AI.");
    }

    // Send an immediate feedback message
    const feedbackMessage = await message.reply("Processing your request, please wait...");

    try {
        const completion = await createCompletion(aiModel, input, { verbose: true });
        const responseText = completion.choices[0].message.content;
        
        if (responseText && responseText.trim().length > 0) {
            // Edit the feedback message with the AI response
            feedbackMessage.edit(responseText).catch(console.error);
        } else {
            // If no valid response, inform the user
            feedbackMessage.edit("The AI did not return a valid response. Please try again.").catch(console.error);
        }
    } catch (error) {
        console.error('Error in AI completion:', error);
        feedbackMessage.edit("Sorry, I encountered an error while processing your request.").catch(console.error);
    }
});

if (config.roleName) {
    client.on('guildMemberAdd', member => {
        const role = member.guild.roles.cache.find(role => role.name === config.roleName);
        member.roles.add(role);
    });
}

// Function that will run the checks
var Check = new CronJob(config.cron, async function () {
    const tempData = JSON.parse(fs.readFileSync('./config.json'));

    tempData.channels.map(async function (chan, i) {
        if (!chan.ChannelName) return;

        try {
            let StreamData = await Stream.getData(chan.ChannelName, tempData.twitch_clientID, tempData.authToken);
            if (StreamData.data.length == 0) return;

            StreamData = StreamData.data[0];
            const ChannelData = await Channel.getData(chan.ChannelName, tempData.twitch_clientID, tempData.authToken);
            if (!ChannelData) return;

            var message = `Hey @everyone, ${StreamData.user_name} is now live on https://www.twitch.tv/${StreamData.user_login} Go check it out!`;
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

            const sendChannel = client.guilds.cache.get(config.DiscordServerId).channels.cache.get(config.channelID);

            if (chan.twitch_stream_id == StreamData.id) {
                sendChannel.messages.fetch(chan.discord_message_id).then(msg => {
                    msg.edit({ embeds: [SendEmbed] });
                });
            } else {
                await sendChannel.send({ content: message, embeds: [SendEmbed] }).then(msg => {
                    const channelObj = tempData.channels[i];
                    channelObj.discord_message_id = msg.id;
                    channelObj.twitch_stream_id = StreamData.id;
                });
            }
            fs.writeFileSync('./config.json', JSON.stringify(tempData));
        } catch (error) {
            console.error('Error fetching stream data:', error);
        }
    });
});

// Update the authorization key every hour
var updateAuth = new CronJob('0 * * * *', async function () {
    UpdateAuthConfig();
    //console.log(`Logged in as ${client.user.tag}!`);
});

// Get a new authorization key and update the config
async function UpdateAuthConfig(){
    let tempData = JSON.parse(fs.readFileSync('./config.json'));

    const authKey = await Auth.getKey(tempData.twitch_clientID, tempData.twitch_secret);
    if (!authKey) return;

    var tempConfig = JSON.parse(fs.readFileSync('./config.json'));
    tempConfig.authToken = authKey;
    fs.writeFileSync('./config.json', JSON.stringify(tempConfig));
}

// Start the timers
updateAuth.start();
Check.start();

// Dispose the AI model on disconnect
client.on('disconnect', () => {
    if (aiModel) aiModel.dispose();
});

// Login
client.login(config.token);
