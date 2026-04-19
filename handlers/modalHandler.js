const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { readJSON, writeJSON } = require('../utils/storage');
const { generateOrderId, buildShopEmbed, buildOrderEmbed } = require('../utils/orderUtils');

async function handleModal(interaction) {
  if (!interaction.customId.startsWith('add_to_cart_modal:')) return;

  const itemId   = interaction.customId.split(':')[1];
  const quantStr = interaction.fields.getTextInputValue('quantity');
  const quantity = parseInt(quantStr, 10);

  if (isNaN(quantity) || quantity < 1) {
    return interaction.reply({ content: '❌ Please enter a valid quantity (minimum 1).', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const shops  = readJSON('shops.json');
  const carts  = readJSON('carts.json');
  const config = readJSON('config.json');
  const item   = shops[itemId];

  if (!item) return interaction.editReply({ content: '❌ Item no longer exists.' });
  if (item.stock < quantity) {
    return interaction.editReply({ content: `❌ Only **${item.stock}** left in stock.` });
  }

  // Build or update user cart
  const userId = interaction.user.id;
  if (!carts[userId]) {
    carts[userId] = {
      orderId:        generateOrderId(),
      items:          [],
      orderMessageId: null,
      orderChannelId: null,
      status:         'waiting',
    };
  }

  const cart     = carts[userId];
  const existing = cart.items.find(e => e.shopItemId === itemId);

  if (existing) {
    if (item.stock < existing.quantity + quantity) {
      return interaction.editReply({ content: `❌ Not enough stock. Only **${item.stock - existing.quantity}** more available.` });
    }
    existing.quantity += quantity;
  } else {
    cart.items.push({
      shopItemId: itemId,
      title:      item.title,
      price:      item.price,
      quantity,
    });
  }

  // Reduce stock
  item.stock -= quantity;
  writeJSON('shops.json', shops);

  // Update shop embed to reflect new stock
  try {
    const shopCh  = await interaction.client.channels.fetch(item.channelId);
    const shopMsg = await shopCh.messages.fetch(item.messageId);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`add_to_cart:${itemId}`).setLabel('Add to Cart').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`remove_from_cart:${itemId}`).setLabel('Remove from Cart').setStyle(ButtonStyle.Danger),
    );
    await shopMsg.edit({ embeds: [buildShopEmbed(item)], components: [row] });
  } catch { /* ignore */ }

  // Build ping content: buyer + extra pings
  const pingIds  = [userId, ...(config.pingUsers ?? []).filter(id => id !== userId)];
  const pingText = pingIds.map(id => `<@${id}>`).join(' ');

  const orderEmbed = buildOrderEmbed(cart);

  // Post or update the order ticket
  if (cart.orderMessageId && cart.orderChannelId) {
    try {
      const orderCh  = await interaction.client.channels.fetch(cart.orderChannelId);
      const orderMsg = await orderCh.messages.fetch(cart.orderMessageId);
      await orderMsg.edit({ content: pingText, embeds: [orderEmbed] });
    } catch {
      // Message gone — create a new one
      cart.orderMessageId = null;
    }
  }

  if (!cart.orderMessageId) {
    const ch  = await interaction.client.channels.fetch(interaction.channelId);
    const msg = await ch.send({ content: pingText, embeds: [orderEmbed] });
    cart.orderMessageId = msg.id;
    cart.orderChannelId = interaction.channelId;
  }

  writeJSON('carts.json', carts);

  await interaction.editReply({ content: `✅ Added **${quantity}x ${item.title}** to your cart.` });
}

module.exports = { handleModal };
