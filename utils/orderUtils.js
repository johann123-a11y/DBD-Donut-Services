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
      { name: 'Price', value: `€${item.price.toFixed(2)}` },
      { name: '\u200b', value: `${item.stock} available` }
    );

  if (item.imageUrl) embed.setImage(item.imageUrl);
  return embed;
}

function buildOrderEmbed(cart) {
  let description = '';
  let totalKits = 0;
  let itemsTotal = 0;

  for (const entry of cart.items) {
    const lineTotal = entry.price * entry.quantity;
    description += `**${entry.title}**\n${entry.quantity} pcs — €${lineTotal.toFixed(2)}\n\n`;
    totalKits += entry.quantity;
    itemsTotal += lineTotal;
  }

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`🛒 Order Ticket - ${cart.orderId}`)
    .setDescription(description.trim() || '*No items in cart*')
    .addFields(
      { name: 'Total Kits',   value: `${totalKits}`,                  inline: true },
      { name: 'Items Total',  value: `€${itemsTotal.toFixed(2)}`,     inline: true },
      { name: 'Final Total',  value: `€${itemsTotal.toFixed(2)}`,     inline: true },
    );

  if (itemsTotal < MIN_ORDER_AMOUNT && cart.items.length > 0) {
    embed.addFields({
      name: '⚠️ Minimum Order',
      value: `Minimum order amount is **€${MIN_ORDER_AMOUNT.toFixed(2)}**.\nAdd more items to proceed with checkout.`,
    });
  }

  embed.addFields({
    name: 'Status',
    value: STATUS_OPTIONS[cart.status] ?? cart.status,
  });

  return embed;
}

module.exports = { generateOrderId, generateItemId, buildShopEmbed, buildOrderEmbed, STATUS_OPTIONS, MIN_ORDER_AMOUNT };
