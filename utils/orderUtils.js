const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const STATUS_OPTIONS = {
  waiting:    '⏳ Waiting for checkout...',
  processing: '🔄 Processing...',
  shipped:    '📦 Shipped',
  completed:  '✅ Completed',
  cancelled:  '❌ Cancelled',
};

const DELIVERY_SPEEDS = {
  default:   { label: 'Default',   fee: 0.04 },
  fast:      { label: 'Fast',      fee: 0.99 },
  superfast: { label: 'Superfast', fee: 1.60 },
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
    .addFields({ name: 'Price', value: String(item.price ?? 'N/A') });
  if (item.imageUrl) {
    try { embed.setImage(item.imageUrl); } catch { /* skip */ }
  }
  return embed;
}

function buildOrderEmbed(cart) {
  let description = '';
  let totalKits   = 0;

  // Delivery info
  if (cart.nickname || cart.coordX) {
    description += `**📋 Delivery Info**\n`;
    if (cart.nickname) description += `Nickname: \`${cart.nickname}\`\n`;
    if (cart.coordX)   description += `X: \`${cart.coordX}\`  Y: \`${cart.coordY}\`  Z: \`${cart.coordZ}\`\n`;
    description += '\n';
  }

  // Items
  for (const entry of cart.items) {
    description += `**${entry.title}** — ${entry.quantity} pcs @ ${String(entry.price ?? 'N/A')}\n`;
    totalKits += entry.quantity;
  }

  // Delivery speed
  if (cart.deliverySpeed) {
    const spd = DELIVERY_SPEEDS[cart.deliverySpeed];
    description += `\n🚚 **Delivery:** ${spd.label} (+$${spd.fee.toFixed(2)})\n`;
  }

  // Payment method
  if (cart.paymentMethod) {
    description += `💳 **Payment:** ${cart.paymentMethod}\n`;
  }

  // Discount
  if (cart.discountCode) {
    description += `🏷️ **Discount:** \`${cart.discountCode}\` (-${cart.discountPercent}%)\n`;
  }

  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`🛒 Order — ${cart.orderId}`)
    .setDescription(description.trim() || '*No items in cart*')
    .addFields(
      { name: 'Total Kits', value: `${totalKits}`, inline: true },
      { name: 'Status',     value: STATUS_OPTIONS[cart.status] ?? cart.status, inline: true },
    );
}

function buildDeliveryButtons(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`delivery:default:${userId}`).setLabel('Default ($0.04)').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`delivery:fast:${userId}`).setLabel('Fast ($0.99)').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`delivery:superfast:${userId}`).setLabel('Superfast ($1.60)').setStyle(ButtonStyle.Success),
  );
}

function buildPaymentButtons(userId, methods) {
  const row = new ActionRowBuilder();
  methods.slice(0, 5).forEach((method, i) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`payment:${i}:${userId}`)
        .setLabel(method)
        .setStyle(ButtonStyle.Primary)
    );
  });
  return row;
}

module.exports = {
  generateOrderId, generateItemId,
  buildShopEmbed, buildOrderEmbed,
  buildDeliveryButtons, buildPaymentButtons,
  STATUS_OPTIONS, DELIVERY_SPEEDS,
};
