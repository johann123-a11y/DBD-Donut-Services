const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
const { getShop, getCart, saveCart, getConfig, getDiscount } = require('../utils/db');
const { generateOrderId, buildOrderEmbed } = require('../utils/orderUtils');

function buildOrderButtons(userId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`close_order:${userId}`).setLabel('Close Order').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`clear_order:${userId}`).setLabel('Clear Order').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`apply_discount:${userId}`).setLabel('Discount / Referral').setStyle(ButtonStyle.Primary),
    ),
  ];
}

function buildCheckoutButton(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`checkout_start:${userId}`).setLabel('Checkout').setStyle(ButtonStyle.Success),
  );
}

async function getOrCreateTicketChannel(interaction, cart, userId, categoryId, config) {
  if (cart.orderChannelId) {
    try {
      const ch = await interaction.client.channels.fetch(cart.orderChannelId);
      if (ch) return { channel: ch, isNew: false };
    } catch { /* deleted */ }
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
      ...(config.pingRoles ?? []).map(roleId => ({
        id: roleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      })),
    ],
  });

  return { channel, isNew: true };
}

async function handleModal(interaction) {

  // ── ADD TO CART (quantity only) ───────────────────────────────────────────
  if (interaction.customId.startsWith('add_to_cart_modal:')) {
    const itemId   = interaction.customId.split(':')[1];
    const quantity = parseInt(interaction.fields.getTextInputValue('quantity'), 10);

    if (isNaN(quantity) || quantity < 1) {
      return interaction.reply({ content: '❌ Please enter a valid quantity (minimum 1).', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const item   = await getShop(itemId);
    const config = await getConfig(interaction.guildId);
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

    const pingIds   = [userId, ...(config.pingUsers ?? []).filter(id => id !== userId)];
    const rolePings = (config.pingRoles ?? []).map(id => `<@&${id}>`);
    const pingText  = [...pingIds.map(id => `<@${id}>`), ...rolePings].join(' ');

    let ticketChannel, isNew;
    try {
      ({ channel: ticketChannel, isNew } = await getOrCreateTicketChannel(interaction, cart, userId, config.ticketCategoryId, config));
    } catch (err) {
      console.error('Failed to create ticket channel:', err);
      return interaction.editReply({ content: '❌ Failed to create ticket channel. Check bot permissions.' });
    }

    cart.orderChannelId = ticketChannel.id;

    // New channel: send ping + checkout button first
    if (isNew) {
      await ticketChannel.send({ content: pingText });
      await ticketChannel.send({
        content: '> Click **Checkout** when you are ready to complete your order.',
        components: [buildCheckoutButton(userId)],
      });
    }

    // Order embed (pinned, updated on changes)
    const orderEmbed   = buildOrderEmbed(cart);
    const orderButtons = buildOrderButtons(userId);

    if (cart.orderMessageId) {
      try {
        const orderMsg = await ticketChannel.messages.fetch(cart.orderMessageId);
        await orderMsg.edit({ embeds: [orderEmbed], components: orderButtons });
      } catch {
        cart.orderMessageId = null;
      }
    }

    if (!cart.orderMessageId) {
      const msg = await ticketChannel.send({ embeds: [orderEmbed], components: orderButtons });
      cart.orderMessageId = msg.id;
      try { await msg.pin(); } catch { /* ignore */ }
    }

    await saveCart(userId, cart);
    await interaction.editReply({ content: `✅ Added **${quantity}x ${item.title}** to your cart. Check ${ticketChannel}!` });
  }

  // ── CHECKOUT INFO (nickname + coords) ─────────────────────────────────────
  if (interaction.customId.startsWith('checkout_info_modal:')) {
    const userId   = interaction.customId.split(':')[1];
    const nickname = interaction.fields.getTextInputValue('nickname');
    const coordX   = interaction.fields.getTextInputValue('coord_x');
    const coordY   = interaction.fields.getTextInputValue('coord_y');
    const coordZ   = interaction.fields.getTextInputValue('coord_z');

    await interaction.deferReply({ ephemeral: true });

    let cart = await getCart(userId);
    if (!cart) return interaction.editReply({ content: '❌ No active cart found.' });

    cart.nickname = nickname;
    cart.coordX   = coordX;
    cart.coordY   = coordY;
    cart.coordZ   = coordZ;

    // Update order embed
    if (cart.orderMessageId && cart.orderChannelId) {
      try {
        const ch  = await interaction.client.channels.fetch(cart.orderChannelId);
        const msg = await ch.messages.fetch(cart.orderMessageId);
        await msg.edit({ embeds: [buildOrderEmbed(cart)], components: buildOrderButtons(userId) });
      } catch { /* ignore */ }
    }

    // Send delivery speed selection
    const { buildDeliveryButtons } = require('../utils/orderUtils');
    const ch = await interaction.client.channels.fetch(cart.orderChannelId);
    await ch.send({ content: '🚚 **Step 2 — Select your delivery speed:**', components: [buildDeliveryButtons(userId)] });

    await saveCart(userId, cart);
    await interaction.editReply({ content: '✅ Info saved! Now select your delivery speed in the ticket.' });
  }

  // ── DISCOUNT CODE ─────────────────────────────────────────────────────────
  if (interaction.customId.startsWith('discount_modal:')) {
    const userId = interaction.customId.split(':')[1];
    const code   = interaction.fields.getTextInputValue('code').toLowerCase().trim();

    await interaction.deferReply({ ephemeral: true });

    const discount = await getDiscount(code);
    if (!discount) return interaction.editReply({ content: `❌ Invalid discount code **${code}**.` });

    let cart = await getCart(userId);
    if (!cart) return interaction.editReply({ content: '❌ No active cart found.' });

    cart.discountCode    = discount._id;
    cart.discountPercent = discount.percent;

    if (cart.orderMessageId && cart.orderChannelId) {
      try {
        const ch  = await interaction.client.channels.fetch(cart.orderChannelId);
        const msg = await ch.messages.fetch(cart.orderMessageId);
        await msg.edit({ embeds: [buildOrderEmbed(cart)], components: buildOrderButtons(userId) });
      } catch { /* ignore */ }
    }

    await saveCart(userId, cart);
    await interaction.editReply({ content: `✅ Code **${discount._id}** applied — **${discount.percent}% off**!` });
  }
}

module.exports = { handleModal, buildOrderButtons };
