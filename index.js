require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const { connectDB } = require('./utils/db');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsPath, file));
  if (cmd.data && cmd.execute) client.commands.set(cmd.data.name, cmd);
}

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(err);
      const payload = { content: '❌ An error occurred.', ephemeral: true };
      if (interaction.replied || interaction.deferred) interaction.followUp(payload);
      else interaction.reply(payload);
    }

  } else if (interaction.isButton()) {
    const { handleButton } = require('./handlers/buttonHandler');
    try { await handleButton(interaction); } catch (err) { console.error(err); }

  } else if (interaction.isModalSubmit()) {
    const { handleModal } = require('./handlers/modalHandler');
    try { await handleModal(interaction); } catch (err) { console.error(err); }
  }
});

(async () => {
  await connectDB();
  await client.login(process.env.DISCORD_TOKEN);
})();
