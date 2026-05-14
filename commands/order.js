const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getConfig, saveConfig, getCart } = require('../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('order')
    .setDescription('Order settings')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('category')
        .setDescription('Set the category ID where order tickets are created on this server')
        .addStringOption(o => o.setName('id').setDescription('Category ID (right-click category → Copy ID)').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a user to an existing order ticket')
        .addUserOption(o => o.setName('user').setDescription('User to add').setRequired(true))
    ),

  async execute(interaction) {
    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'category') {
      const id = interaction.options.getString('id').trim();
      await saveConfig(guildId, { ticketCategoryId: id });
      await interaction.reply({ content: `✅ Order tickets will now be created in category \`${id}\` on this server.`, ephemeral: true });
    }

    if (sub === 'add') {
      const target = interaction.options.getUser('user');
      const cart   = await getCart(target.id);

      if (!cart?.orderChannelId) {
        return interaction.reply({ content: `❌ No active order ticket found for ${target}.`, ephemeral: true });
      }

      try {
        const ch = await interaction.client.channels.fetch(cart.orderChannelId);
        await ch.permissionOverwrites.create(target.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });
        await interaction.reply({ content: `✅ ${target} has been added to the ticket.`, ephemeral: true });
      } catch {
        await interaction.reply({ content: '❌ Could not add the user to the ticket.', ephemeral: true });
      }
    }
  },
};
