const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getDiscount, saveDiscount, deleteDiscount, getAllDiscounts } = require('../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('discount')
    .setDescription('Manage discount codes')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Create or update a discount code')
        .addStringOption(o => o.setName('code').setDescription('The discount code').setRequired(true))
        .addIntegerOption(o => o.setName('percent').setDescription('Discount percentage (1–100)').setRequired(true).setMinValue(1).setMaxValue(100))
    )
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Delete a discount code')
        .addStringOption(o => o.setName('code').setDescription('The discount code').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('list').setDescription('List all active discount codes')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const code    = interaction.options.getString('code').toLowerCase().trim();
      const percent = interaction.options.getInteger('percent');
      await saveDiscount(code, percent);
      await interaction.reply({ content: `✅ Discount code **${code}** set to **${percent}%** off.`, ephemeral: true });
    }

    if (sub === 'delete') {
      const code = interaction.options.getString('code').toLowerCase().trim();
      const existing = await getDiscount(code);
      if (!existing) return interaction.reply({ content: `❌ No code found: **${code}**.`, ephemeral: true });
      await deleteDiscount(code);
      await interaction.reply({ content: `✅ Discount code **${code}** deleted.`, ephemeral: true });
    }

    if (sub === 'list') {
      const codes = await getAllDiscounts();
      if (!codes.length) return interaction.reply({ content: '❌ No discount codes exist yet.', ephemeral: true });
      const list = codes.map(c => `**${c._id}** — ${c.percent}% off`).join('\n');
      await interaction.reply({ content: `🏷️ **Discount Codes:**\n${list}`, ephemeral: true });
    }
  },
};
