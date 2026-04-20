const { EmbedBuilder } = require('discord.js');

const MIN_ORDER_AMOUNT = 7.00;

const STATUS_OPTIONS = {
  waiting:    '⏳ Waiting for checkout...',
  processing: '🔄 Processing...',
  shipped:    '📦 Shipped',
  completed:  '✅ Completed',
  cancelled:  '❌ Cancelled',
};

function generateOrderId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const rand = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${rand(9)}.${rand(7)}_m1`;
}

function generateItemId() {
  return Math.random().toString(36).slice(2, 10);
}

function buildShopEmbed(item) {
  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(item.title)
    .addFields(
      { name: 'Product', value: item.price }
    );

  if (item.imageUrl) embed.setImage(item.imageUrl);
  return embed;
}

function buildOrderEmbed(cart) {
  let description = '';
  let totalKits = 0;

  for (const entry of cart.items) {
    description += `**${entry.title}**\n${entry.quantity} pcs — ${entry.price}\n\n`;
    totalKits += entry.quantity;
  }

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`🛒 Order Ticket - ${cart.orderId}`)
    .setDescription(description.trim() || '*No items in cart*')
    .addFields(
      { name: 'Total Kits', value: `${totalKits}`, inline: true },
    );

  embed.addFields({
    name: 'Status',
    value: STATUS_OPTIONS[cart.status] ?? cart.status,
  });

  return embed;
}

module.exports = { generateOrderId, generateItemId, buildShopEmbed, buildOrderEmbed, STATUS_OPTIONS, MIN_ORDER_AMOUNT };
