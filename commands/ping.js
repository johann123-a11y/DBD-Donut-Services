const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { readJSON, writeJSON } = require('../utils/storage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Manage who gets pinged on new orders')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a user to the ping list')
        .addUserOption(o => o.setName('user').setDescription('User to add').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a user from the ping list')
        .addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('Show current ping list')
    ),

  async execute(interaction) {
    const sub    = interaction.options.getSubcommand();
    const config = readJSON('config.json');
    if (!config.pingUsers) config.pingUsers = [];

    if (sub === 'list') {
      if (config.pingUsers.length === 0) {
        return interaction.reply({ content: 'No extra ping users configured. Only the buyer is pinged.', ephemeral: true });
      }
      const mentions = config.pingUsers.map(id => `<@${id}>`).join(', ');
      return interaction.reply({ content: `📣 Ping list: ${mentions}`, ephemeral: true });
    }

    const target = interaction.options.getUser('user');

    if (sub === 'add') {
      if (config.pingUsers.includes(target.id)) {
        return interaction.reply({ content: `${target} is already on the ping list.`, ephemeral: true });
      }
      config.pingUsers.push(target.id);
      writeJSON('config.json', config);
      return interaction.reply({ content: `✅ ${target} added to the ping list.`, ephemeral: true });
    }

    if (sub === 'remove') {
      config.pingUsers = config.pingUsers.filter(id => id !== target.id);
      writeJSON('config.json', config);
      return interaction.reply({ content: `✅ ${target} removed from the ping list.`, ephemeral: true });
    }
  },
};
