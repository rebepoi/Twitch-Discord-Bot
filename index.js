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

//Load the GPT-4All model during the bot startup
let aiModel;

async function loadAIModel() {
    aiModel = await loadModel('Meta-Llama-3-8B-Instruct.Q4_0.gguf', { verbose: true, device: 'cpu' });
}

//ready
client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    await loadAIModel();  // Load the AI model

    //update the authorization key on startup
    UpdateAuthConfig()
});

client.on('messageCreate', async message => {
    console.log(`Received message: ${message.content}`); // Log the received message

    // Check if the message starts with '!ai' and is not from a bot
    if (!message.content.startsWith('!ai') || message.author.bot) {
        return; // Ignore the message if it does not start with '!ai' or is from a bot
    }

    const input = message.content.slice(4).trim(); // Remove the command part
    console.log(`AI input: ${input}`); // Log the parsed input

    if (input.length === 0) {
        return message.reply("Please provide some input for AI.");
    }

    try {
        const completion = await createCompletion(aiModel, input, { verbose: true });
        if (completion.text && completion.text.trim().length > 0) { // Check if 'text' is not empty
            message.reply(completion.text).catch(console.error);
        } else {
            message.reply("The AI did not return a valid response. Did you delete original message?").catch(console.error);
        }
    } catch (error) {
        console.error('Error in AI completion:', error);
        message.reply("Sorry, I encountered an error while processing your request.");
    }
});

if(config.roleName){
    client.on('guildMemberAdd', member => {
        // Replace 'role-name' with the actual name of the role you want to add
        const role = member.guild.roles.cache.find(role => role.name === config.roleName);

        // Add the role to the member
        member.roles.add(role);
    });
}

//function that will run the checks
var Check = new CronJob(config.cron,async function () {
    const tempData = JSON.parse(fs.readFileSync('./config.json'))

    tempData.channels.map(async function (chan, i) {
        if (!chan.ChannelName) return;

        let StreamData = await Stream.getData(chan.ChannelName, tempData.twitch_clientID, tempData.authToken);
        if (StreamData.data.length == 0) return

        StreamData = StreamData.data[0]

        //get the channel data for the thumbnail image
        const ChannelData = await Channel.getData(chan.ChannelName, tempData.twitch_clientID, tempData.authToken)
        if (!ChannelData) return;

        var message = `Hey @everyone, ${StreamData.user_name} is now live on https://www.twitch.tv/${StreamData.user_login} Go check it out!`;
        var owner = false;
        if (StreamData.user_login === 'rebepoi') {
            owner = true;
        }
        //structure for the embed
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
                    "value": `[Join here](${chan.DiscordServer})`
                } : {
                    "name": "** **",
                    "value": "** **"
                })
            ],
            "footer": {
                "text": owner ? "Let us fail again!" : ""
            },
            //"footer": {
            //    "text": StreamData.started_at
            //},
            "image": {
                "url": `https://static-cdn.jtvnw.net/previews-ttv/live_user_${StreamData.user_login}-640x360.jpg?cacheBypass=${(Math.random()).toString()}`
            },
            "thumbnail": {
                "url": `${ChannelData.thumbnail_url}`
            }
        }

        //get the assigned channel
        const sendChannel = client.guilds.cache.get(config.DiscordServerId).channels.cache.get(config.channelID)

        if (chan.twitch_stream_id == StreamData.id) {
            sendChannel.messages.fetch(chan.discord_message_id).then(msg => {
                //update the title, game, viewer_count and the thumbnail
                msg.edit({ embeds: [SendEmbed] })
            });
        } else {
            //this is the message when a streamer goes live. It will tag the assigned role
            await sendChannel.send({ content: message, embeds: [SendEmbed] }).then(msg => {
                const channelObj = tempData.channels[i]

                channelObj.discord_message_id = msg.id
                channelObj.twitch_stream_id = StreamData.id

                /* if(config.roleID){
                    sendChannel.send(`<@&${config.roleID}>`)
                } */
            })
        }
        //save config with new data
        fs.writeFileSync('./config.json', JSON.stringify(tempData))
    })
});

//update the authorization key every hour
var updateAuth = new CronJob('0 * * * *', async function () {
    UpdateAuthConfig();
    console.log(`Logged in as ${client.user.tag}!`);
});

//get a new authorization key and update the config
async function UpdateAuthConfig(){
    let tempData = JSON.parse(fs.readFileSync('./config.json'));

    //get the auth key
    const authKey = await Auth.getKey(tempData.twitch_clientID, tempData.twitch_secret);
    if (!authKey) return;

    //write the new auth key
    var tempConfig = JSON.parse(fs.readFileSync('./config.json'));
    tempConfig.authToken = authKey;
    fs.writeFileSync('./config.json', JSON.stringify(tempConfig));
}

//start the timers
updateAuth.start()
Check.start();

//dispose the AI model on disconnect
client.on('disconnect', () => {
    if (aiModel) aiModel.dispose();
});

//login
client.login(config.token);
