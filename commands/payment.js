const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getConfig, saveConfig } = require('../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('payment')
    .setDescription('Manage payment methods shown during checkout')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a payment method')
        .addStringOption(o => o.setName('method').setDescription('e.g. PayPal, Crypto, Bank Transfer').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a payment method')
        .addStringOption(o => o.setName('method').setDescription('Exact name of the method to remove').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('list').setDescription('List all payment methods')
    ),

  async execute(interaction) {
    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const config  = await getConfig(guildId);
    const methods = config.paymentMethods ?? [];

    if (sub === 'add') {
      const method = interaction.options.getString('method').trim();
      if (methods.includes(method)) {
        return interaction.reply({ content: `❌ **${method}** is already in the list.`, ephemeral: true });
      }
      if (methods.length >= 5) {
        return interaction.reply({ content: '❌ Maximum 5 payment methods allowed (Discord button limit).', ephemeral: true });
      }
      methods.push(method);
      await saveConfig(guildId, { paymentMethods: methods });
      await interaction.reply({ content: `✅ **${method}** added as a payment method.`, ephemeral: true });
    }

    if (sub === 'remove') {
      const method  = interaction.options.getString('method').trim();
      const updated = methods.filter(m => m !== method);
      if (updated.length === methods.length) {
        return interaction.reply({ content: `❌ **${method}** not found in the list.`, ephemeral: true });
      }
      await saveConfig(guildId, { paymentMethods: updated });
      await interaction.reply({ content: `✅ **${method}** removed.`, ephemeral: true });
    }

    if (sub === 'list') {
      if (!methods.length) return interaction.reply({ content: '❌ No payment methods set yet. Use `/payment add`.', ephemeral: true });
      await interaction.reply({ content: `💳 **Payment Methods:**\n${methods.map((m, i) => `${i + 1}. ${m}`).join('\n')}`, ephemeral: true });
    }
  },
};
