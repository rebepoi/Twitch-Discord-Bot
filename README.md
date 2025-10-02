# Twitch Discord Bot
This Discord bot will automatically send a message and tag the assigned role whenever a streamer went live.
The notifications will update every 10 minutes(default) while the streamer is live.

# How does it work?
This Discord bot uses [The Official Twitch Api](https://dev.twitch.tv/docs/api/). You will be able to assign unlimited streamers to the bot. The bot uses the api to fetch the channel data to see if the streamer is live. If the streamer is live it will send a message in the assigned channel and it will also tag the assigned role. You will be able to choose the update time. If the streamer is still live the bot will update the message after X amount of time (default 10 minutes).  

<img src="https://cdn.discordapp.com/attachments/738800765023551660/821513567265226803/unknown.png" />  


# Installation
First you will have to clone the project.
```console
$ git clone https://github.com/rebepoi/Twitch-Discord-Bot
```

After that copy `config.template.json` to `config.local.json` and fill only non-secret structure fields. Place secrets in `.env` (see `.env.example`).
```console
cp config.template.json config.local.json
```
## Configure environment variables
Create a `.env` file with the required secrets and settings (never commit this file):

```env
# Discord (required)
DISCORD_TOKEN=
DISCORD_GUILD_ID=
DISCORD_CHANNEL_ID=

# Twitch (required)
TWITCH_CLIENT_ID=
TWITCH_SECRET=

# Schedule and role (optional)
CRON=*/10 * * * *
ROLE_NAME=
ROLE_ID=
MAX_EDITS_PER_STREAM=2

# AI via OpenRouter (optional)
ENABLE_AI=false
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-4o
OPENROUTER_VISION_MODEL=moonshotai/kimi-vl-a3b-thinking:free
```

NOTE: Secrets are only in `.env`. The file `config.local.json` contains non-secret structure and runtime state.

## Add streamers
In `config.local.json` there is a `channels` array. If you want to add streamers you just add new objects to this array.
```console
{
   "ChannelName": "STREAMER_NAME(REQUIRED)",
   "DiscordServer": "DISCORD_SERVER_INVITE_URL(NOT REQUIRED)",
   "twitch_stream_id": "",
   "discord_message_id": ""
}
```
- ChannelName - Enter the streamer login name here. This name is the same as the name in the channel URL.  
Example: 
URL = https://www.twitch.tv/rebepoi 
ChannelName = rebepoi  
- DiscordServer - This field is not required but if the Streamer has their own Discord server you could add the invite url here.  
  
An array with multiple streamers will look something like this:
```console
{
   "ChannelName": "STREAMER1",
   "DiscordServer": "Some Discord invite url here",
   "twitch_stream_id": "",
   "discord_message_id": ""
},
{
   "ChannelName": "STREAMER2",
   "DiscordServer": "",
   "twitch_stream_id": "",
   "discord_message_id": ""
}
```

## Dependencies
Install dependencies (now using `undici` instead of `request`).
```console
$ npm install
```

## Run the bot
Create a `.env` using `.env.example`, update `config.local.json`, then run:
```console
$ node index.js
```
Or with Docker:
```console
docker compose up -d
```

### Docker notes
- The container reads environment variables from `.env` and mounts `config.local.json`.
- Edit `config.local.json` on the host; the container will use it at runtime.
- Rebuild the image if `package.json` changes: `docker compose build --no-cache`.

## AI via OpenRouter
Set these in `.env` (see Quickstart at [openrouter.ai/docs/quickstart](https://openrouter.ai/docs/quickstart)):

```env
ENABLE_AI=true
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=openai/gpt-4o
```

Use in Discord: send `!ai <your message>`.

### Images with !ai (vision-capable models)
- Attach 1–3 images to your message and use `!ai <prompt>`.
- The bot automatically switches to `OPENROUTER_VISION_MODEL` when images are attached (default: `moonshotai/kimi-vl-a3b-thinking:free`).
- Without images, it uses `OPENROUTER_MODEL`.
Congratulations! You have successfully setup the bot.
If there are any errors please send me a dm on Discord
rebepoi
