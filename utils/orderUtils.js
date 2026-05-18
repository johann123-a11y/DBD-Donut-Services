const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const MIN_ORDER_AMOUNT = 7.00;

const STATUS_OPTIONS = {
  waiting:    '⏳ Waiting for checkout...',
  processing: '🔄 Processing...',
  shipped:    '📦 Shipped',
  completed:  '✅ Completed',
  cancelled:  '❌ Cancelled',
};

const DELIVERY_SPEEDS = {
  default:   { label: 'Default',    fee: 0.04 },
  fast:      { label: 'Fast',       fee: 0.99 },
  superfast: { label: 'Superfast',  fee: 1.60 },
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
    .setTitle(item.title || 'Untitled')
    .addFields(
      { name: 'Price', value: String(item.price ?? 'N/A') }
    );

  if (item.imageUrl) {
    try { embed.setImage(item.imageUrl); } catch { /* skip invalid URL */ }
  }
  return embed;
}

function buildOrderEmbed(cart) {
  let description = '';
  let totalKits = 0;

  // Delivery info
  if (cart.nickname || cart.coordX) {
    description += `**📋 Delivery Info**\n`;
    if (cart.nickname) description += `Nickname: \`${cart.nickname}\`\n`;
    if (cart.coordX)   description += `X: \`${cart.coordX}\`\n`;
    if (cart.coordY)   description += `Y: \`${cart.coordY}\`\n`;
    if (cart.coordZ)   description += `Z: \`${cart.coordZ}\`\n`;
    description += '\n';
  }

  // Items
  for (const entry of cart.items) {
    description += `**${entry.title}**\n${entry.quantity} pcs — ${String(entry.price ?? 'N/A')}\n\n`;
    totalKits += entry.quantity;
  }

  // Delivery speed
  if (cart.deliverySpeed) {
    const spd = DELIVERY_SPEEDS[cart.deliverySpeed];
    description += `**🚚 Delivery:** ${spd.label} (+$${spd.fee.toFixed(2)} USD)\n`;
  }

  // Discount
  if (cart.discountCode) {
    description += `**🏷️ Discount:** \`${cart.discountCode}\` (-${cart.discountPercent}%)\n`;
  }

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`🛒 Order Ticket - ${cart.orderId}`)
    .setDescription(description.trim() || '*No items in cart*')
    .addFields({ name: 'Total Kits', value: `${totalKits}`, inline: true });

  embed.addFields({ name: 'Status', value: STATUS_OPTIONS[cart.status] ?? cart.status });

  return embed;
}

function buildDeliveryRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`delivery:default:${userId}`).setLabel('Default ($0.04)').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`delivery:fast:${userId}`).setLabel('Fast ($0.99)').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`delivery:superfast:${userId}`).setLabel('Superfast ($1.60)').setStyle(ButtonStyle.Success),
  );
}

module.exports = { generateOrderId, generateItemId, buildShopEmbed, buildOrderEmbed, buildDeliveryRow, STATUS_OPTIONS, DELIVERY_SPEEDS, MIN_ORDER_AMOUNT };
