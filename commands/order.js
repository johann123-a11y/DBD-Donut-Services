const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getConfig, saveConfig, getCart } = require('../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('order')
    .setDescription('Order settings')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('ticket')
        .setDescription('Set the category where order tickets are created')
        .addChannelOption(o => o.setName('category').setDescription('The category channel').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a user to the current order ticket')
        .addUserOption(o => o.setName('user').setDescription('User to add').setRequired(true))
    ),

  async execute(interaction) {
    const category = interaction.options.getChannel('category');

    if (category.type !== 4) {
      return interaction.reply({ content: '❌ Please select a **Category**, not a regular channel.', ephemeral: true });
    }

    const config = await getConfig();
    config.ticketCategoryId = category.id;
    await saveConfig(config);

    await interaction.reply({ content: `✅ Order tickets will now be created in **${category.name}**.`, ephemeral: true });
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
      await interaction.reply({ content: `✅ ${target} wurde zum Ticket hinzugefügt.`, ephemeral: true });
    } catch {
      await interaction.reply({ content: '❌ Konnte den User nicht hinzufügen.', ephemeral: true });
    }
  }
},
};
