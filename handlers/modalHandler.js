const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
const { getShop, getCart, saveCart, getConfig } = require('../utils/db');
const { generateOrderId, buildShopEmbed, buildOrderEmbed } = require('../utils/orderUtils');

function buildOrderButtons(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`close_order:${userId}`).setLabel('Close Order').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`clear_order:${userId}`).setLabel('Clear Order').setStyle(ButtonStyle.Secondary),
  );
}

async function getOrCreateTicketChannel(interaction, cart, userId, categoryId) {
  if (cart.orderChannelId) {
    try {
      const ch = await interaction.client.channels.fetch(cart.orderChannelId);
      if (ch) return ch;
    } catch { /* channel deleted, create new one */ }
  }

  const member   = await interaction.guild.members.fetch(userId);
  const username = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '-');

  const channel = await interaction.guild.channels.create({
    name: `order-${username}`,
    type: ChannelType.GuildText,
    parent: categoryId ?? null,
    permissionOverwrites: [
      { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
      { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ],
  });

  return channel;
}

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

  const userId = interaction.user.id;
  let cart = await getCart(userId);

  if (!cart) {
    cart = { _id: userId, orderId: generateOrderId(), items: [], orderMessageId: null, orderChannelId: null, status: 'waiting' };
  }

  const existing = cart.items.find(e => e.shopItemId === itemId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.items.push({ shopItemId: itemId, title: item.title, price: item.price, quantity });
  }

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

  const pingIds    = [userId, ...(config.pingUsers ?? []).filter(id => id !== userId)];
  const pingText   = pingIds.map(id => `<@${id}>`).join(' ');
  const orderEmbed = buildOrderEmbed(cart);
  const orderButtons = buildOrderButtons(userId);

  const ticketChannel = await getOrCreateTicketChannel(interaction, cart, userId, config.ticketCategoryId);
  cart.orderChannelId = ticketChannel.id;

  if (cart.orderMessageId) {
    try {
      const orderMsg = await ticketChannel.messages.fetch(cart.orderMessageId);
      await orderMsg.edit({ embeds: [orderEmbed], components: [orderButtons] });
    } catch {
      cart.orderMessageId = null;
    }
  }

  if (!cart.orderMessageId) {
    await ticketChannel.send({ content: pingText });
    const msg = await ticketChannel.send({ embeds: [orderEmbed], components: [orderButtons] });
    cart.orderMessageId = msg.id;
    try { await msg.pin(); } catch { /* ignore */ }
  }

  await saveCart(userId, cart);
  await interaction.editReply({ content: `✅ Added **${quantity}x ${item.title}** to your cart. Check ${ticketChannel}!` });
}

module.exports = { handleModal, buildOrderButtons };
