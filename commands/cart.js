const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getCart, saveCart } = require('../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cart')
    .setDescription('Manage order ticket channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a user to a ticket channel')
        .addUserOption(o => o.setName('user').setDescription('User whose ticket to modify').setRequired(true))
        .addUserOption(o => o.setName('add').setDescription('User to add to the ticket').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a user from a ticket channel')
        .addUserOption(o => o.setName('user').setDescription('User whose ticket to modify').setRequired(true))
        .addUserOption(o => o.setName('remove').setDescription('User to remove from the ticket').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('rename')
        .setDescription('Rename a ticket channel')
        .addUserOption(o => o.setName('user').setDescription('User whose ticket to rename').setRequired(true))
        .addStringOption(o => o.setName('name').setDescription('New channel name').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('reset')
        .setDescription('Reset ticket channel link (so next order creates a new one in the correct category)')
        .addUserOption(o => o.setName('user').setDescription('User to reset').setRequired(true))
    ),

  async execute(interaction) {
    const sub    = interaction.options.getSubcommand();
    const target = interaction.options.getUser('user');
    const cart   = await getCart(target.id);

    if (!cart?.orderChannelId) {
      return interaction.reply({ content: `❌ No active ticket found for ${target}.`, ephemeral: true });
    }

    let ch;
    try {
      ch = await interaction.client.channels.fetch(cart.orderChannelId);
    } catch {
      return interaction.reply({ content: '❌ Ticket channel not found.', ephemeral: true });
    }

    if (sub === 'add') {
      const userToAdd = interaction.options.getUser('add');
      await ch.permissionOverwrites.create(userToAdd.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });
      await interaction.reply({ content: `✅ ${userToAdd} wurde zum Ticket von ${target} hinzugefügt.`, ephemeral: true });
    }

    if (sub === 'remove') {
      const userToRemove = interaction.options.getUser('remove');
      await ch.permissionOverwrites.delete(userToRemove.id);
      await interaction.reply({ content: `✅ ${userToRemove} wurde aus dem Ticket von ${target} entfernt.`, ephemeral: true });
    }

    if (sub === 'rename') {
      const newName = interaction.options.getString('name').toLowerCase().replace(/[^a-z0-9]/g, '-');
      await ch.setName(newName);
      await interaction.reply({ content: `✅ Ticket wurde zu **${newName}** umbenannt.`, ephemeral: true });
    }

    if (sub === 'reset') {
      cart.orderChannelId = null;
      cart.orderMessageId = null;
      await saveCart(target.id, cart);
      await interaction.reply({ content: `✅ Ticket-Link für ${target} zurückgesetzt. Beim nächsten "Add to Cart" wird ein neues Ticket in der richtigen Kategorie erstellt.`, ephemeral: true });
    }
  },
};
