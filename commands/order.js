const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getConfig, saveConfig } = require('../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('order')
    .setDescription('Order settings')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('ticket')
        .setDescription('Set the category where order tickets are created')
        .addChannelOption(o =>
          o.setName('category')
            .setDescription('The category channel')
            .setRequired(true)
        )
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
  },
};
