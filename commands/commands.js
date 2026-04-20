const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('commands')
    .setDescription('Show all available commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🍩 Donut Services — Commands')
      .addFields(
        {
          name: '🛒 Shop',
          value: [
            '`/shop create` — Save a new shop item to the database (not posted yet)',
            '`/shop spawn` — Post all saved items in this channel (reposts deleted ones)',
            '`/shop delete` — Permanently delete a shop item by name (only way to remove)',
          ].join('\n'),
        },
        {
          name: '📋 Orders',
          value: [
            '`/status @user <status>` — Update a user\'s order status',
            '> Statuses: `waiting` · `processing` · `shipped` · `completed` · `cancelled`',
          ].join('\n'),
        },
        {
          name: '📣 Pings',
          value: [
            '`/ping add @user/@role` — Add a user or role to the ping list',
            '`/ping remove @user/@role` — Remove a user or role from the ping list',
            '`/ping list` — Show all users and roles on the ping list',
          ].join('\n'),
        },
        {
          name: '🎫 Cart / Ticket',
          value: [
            '`/cart add @user @add` — Add a user to a ticket channel',
            '`/cart remove @user @remove` — Remove a user from a ticket channel',
            '`/cart rename @user name` — Rename a ticket channel',
            '`/cart reset @user` — Reset ticket link (creates new ticket on next order)',
          ].join('\n'),
        },
        {
          name: '⚙️ Settings',
          value: [
            '`/order ticket category:` — Set the category for order tickets',
            '`/order add @user` — Add a user to an existing ticket',
          ].join('\n'),
        },
        {
          name: '❓ Info',
          value: '`/commands` — Show this message',
        },
      )
      .setFooter({ text: 'The buyer is always pinged automatically on new orders.' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
