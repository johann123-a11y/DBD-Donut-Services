const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getShop, saveShop, getCart, saveCart, getConfig } = require('../utils/db');
const { generateOrderId, buildShopEmbed, buildOrderEmbed } = require('../utils/orderUtils');

async function handleModal(interaction) {
  if (!interaction.customId.startsWith('add_to_cart_modal:')) return;

  const itemId   = interaction.customId.split(':')[1];
  const quantity = parseInt(interaction.fields.getTextInputValue('quantity'), 10);

  if (isNaN(quantity) || quantity < 1) {
    return interaction.reply({ content: '❌ Please enter a valid quantity (minimum 1).', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const item   = await getShop(itemId);
  const config = await getConfig();

  if (!item) return interaction.editReply({ content: '❌ Item no longer exists.' });
  if (item.stock < quantity) {
    return interaction.editReply({ content: `❌ Only **${item.stock}** left in stock.` });
  }

  const userId = interaction.user.id;
  let cart = await getCart(userId);

  if (!cart) {
    cart = { _id: userId, orderId: generateOrderId(), items: [], orderMessageId: null, orderChannelId: null, status: 'waiting' };
  }

  const existing = cart.items.find(e => e.shopItemId === itemId);

  if (existing) {
    if (item.stock < existing.quantity + quantity) {
      return interaction.editReply({ content: `❌ Not enough stock. Only **${item.stock - existing.quantity}** more available.` });
    }
    existing.quantity += quantity;
  } else {
    cart.items.push({ shopItemId: itemId, title: item.title, price: item.price, quantity });
  }

  item.stock -= quantity;
  await saveShop(itemId, item);

  // Update shop embed
  try {
    const shopCh  = await interaction.client.channels.fetch(item.channelId);
    const shopMsg = await shopCh.messages.fetch(item.messageId);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`add_to_cart:${itemId}`).setLabel('Add to Cart').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`remove_from_cart:${itemId}`).setLabel('Remove from Cart').setStyle(ButtonStyle.Danger),
    );
    await shopMsg.edit({ embeds: [buildShopEmbed(item)], components: [row] });
  } catch { /* ignore */ }

  // Ping content
  const pingIds  = [userId, ...(config.pingUsers ?? []).filter(id => id !== userId)];
  const pingText = pingIds.map(id => `<@${id}>`).join(' ');
  const orderEmbed = buildOrderEmbed(cart);

  // Post or update order ticket
  if (cart.orderMessageId && cart.orderChannelId) {
    try {
      const orderCh  = await interaction.client.channels.fetch(cart.orderChannelId);
      const orderMsg = await orderCh.messages.fetch(cart.orderMessageId);
      await orderMsg.edit({ content: pingText, embeds: [orderEmbed] });
    } catch {
      cart.orderMessageId = null;
    }
  }

  if (!cart.orderMessageId) {
    const ch  = await interaction.client.channels.fetch(interaction.channelId);
    const msg = await ch.send({ content: pingText, embeds: [orderEmbed] });
    cart.orderMessageId = msg.id;
    cart.orderChannelId = interaction.channelId;
  }

  await saveCart(userId, cart);
  await interaction.editReply({ content: `✅ Added **${quantity}x ${item.title}** to your cart.` });
}

module.exports = { handleModal };
