const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { readJSON, writeJSON } = require('../utils/storage');
const { buildOrderEmbed, STATUS_OPTIONS } = require('../utils/orderUtils');

const statusChoices = Object.entries(STATUS_OPTIONS).map(([value, name]) => ({ name, value }));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Update the status of a user\'s order')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption(o => o.setName('user').setDescription('The buyer').setRequired(true))
    .addStringOption(o =>
      o.setName('status')
        .setDescription('New status')
        .setRequired(true)
        .addChoices(...statusChoices)
    ),

  async execute(interaction) {
    const target    = interaction.options.getUser('user');
    const newStatus = interaction.options.getString('status');
    const carts     = readJSON('carts.json');
    const cart      = carts[target.id];

    if (!cart || cart.items.length === 0) {
      return interaction.reply({ content: `❌ No active order found for ${target}.`, ephemeral: true });
    }

    cart.status = newStatus;
    writeJSON('carts.json', carts);

    // Update the order ticket message
    try {
      const ch  = await interaction.client.channels.fetch(cart.orderChannelId);
      const msg = await ch.messages.fetch(cart.orderMessageId);
      await msg.edit({ embeds: [buildOrderEmbed(cart)] });
    } catch {
      return interaction.reply({ content: '⚠️ Status saved but could not find the order ticket message.', ephemeral: true });
    }

    await interaction.reply({ content: `✅ Order status for ${target} updated to **${STATUS_OPTIONS[newStatus]}**.`, ephemeral: true });
  },
};
