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
            '`/shop create` — Create a new shop item (title, price, stock, image)',
            '`/shop delete` — Delete a shop item by ID',
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
            '`/ping add @user` — Add a user to the global ping list',
            '`/ping remove @user` — Remove a user from the ping list',
            '`/ping list` — Show all users on the ping list',
          ].join('\n'),
        },
        {
          name: '🎫 Cart / Ticket',
          value: [
            '`/cart add @user @add` — Person zum Ticket hinzufügen',
            '`/cart remove @user @remove` — Person aus Ticket entfernen',
            '`/cart rename @user name` — Ticket-Channel umbenennen',
          ].join('\n'),
        },
        {
          name: '⚙️ Einstellungen',
          value: [
            '`/order ticket category:` — Kategorie für Order-Tickets setzen',
            '`/order add @user` — Person zu bestehendem Ticket hinzufügen',
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
