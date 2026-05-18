const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { getShop, getCart, saveCart, getConfig } = require('../utils/db');
const { buildShopEmbed, buildOrderEmbed, DELIVERY_SPEEDS, buildDeliveryButtons, buildPaymentButtons } = require('../utils/orderUtils');
const { buildOrderButtons } = require('./modalHandler');

async function handleButton(interaction) {
  const parts    = interaction.customId.split(':');
  const action   = parts[0];
  const targetId = parts[1];

  // ── ADD TO CART → quantity modal ──────────────────────────────────────────
  if (action === 'add_to_cart') {
    const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
    const modal = new ModalBuilder().setCustomId(`add_to_cart_modal:${targetId}`).setTitle('Add to Cart');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('quantity').setLabel('Quantity').setPlaceholder('e.g. 2')
          .setStyle(TextInputStyle.Short).setRequired(true).setMinLength(1).setMaxLength(4)
      )
    );
    await interaction.showModal(modal);
  }

  // ── REMOVE FROM CART ──────────────────────────────────────────────────────
  if (action === 'remove_from_cart') {
    const item = await getShop(targetId);
    if (!item) return interaction.reply({ content: '❌ Item not found.', ephemeral: true });

    const cart = await getCart(interaction.user.id);
    if (!cart) return interaction.reply({ content: '❌ You have no active cart.', ephemeral: true });

    const existing = cart.items.find(e => e.shopItemId === targetId);
    if (!existing) return interaction.reply({ content: '❌ Item not in your cart.', ephemeral: true });

    cart.items = cart.items.filter(e => e.shopItemId !== targetId);
    await saveCart(interaction.user.id, cart);

    for (const { messageId, channelId } of (item.messages ?? [])) {
      try {
        const shopCh  = await interaction.client.channels.fetch(channelId);
        const shopMsg = await shopCh.messages.fetch(messageId);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`add_to_cart:${targetId}`).setLabel('Add to Cart').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`remove_from_cart:${targetId}`).setLabel('Remove from Cart').setStyle(ButtonStyle.Danger),
        );
        await shopMsg.edit({ embeds: [buildShopEmbed(item)], components: [row] });
      } catch { /* ignore */ }
    }

    if (cart.orderMessageId && cart.orderChannelId) {
      try {
        const ch  = await interaction.client.channels.fetch(cart.orderChannelId);
        const msg = await ch.messages.fetch(cart.orderMessageId);
        await msg.edit({ embeds: [buildOrderEmbed(cart)], components: buildOrderButtons(interaction.user.id) });
      } catch { /* ignore */ }
    }

    await interaction.reply({ content: `✅ **${existing.title}** removed from your cart.`, ephemeral: true });
  }

  // ── REMOVE ITEM → modal ──────────────────────────────────────────────────
  if (action === 'remove_item') {
    const userId = targetId;
    if (interaction.user.id !== userId && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ This is not your order.', ephemeral: true });
    }
    const cart = await getCart(userId);
    if (!cart?.items?.length) return interaction.reply({ content: '❌ Your cart is empty.', ephemeral: true });

    const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
    const itemList = cart.items.map((e, i) => `${i + 1}. ${e.title}`).join('\n');
    const modal = new ModalBuilder().setCustomId(`remove_item_modal:${userId}`).setTitle('Remove Item');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('item_name').setLabel('Item name to remove')
          .setPlaceholder(itemList).setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
    await interaction.showModal(modal);
  }

  // ── CHECKOUT START → info modal ───────────────────────────────────────────
  if (action === 'checkout_start') {
    const userId = targetId;
    if (interaction.user.id !== userId) {
      return interaction.reply({ content: '❌ This is not your order.', ephemeral: true });
    }

    const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
    const modal = new ModalBuilder().setCustomId(`checkout_info_modal:${userId}`).setTitle('Checkout');
    const make  = (id, label, placeholder) =>
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId(id).setLabel(label).setPlaceholder(placeholder)
          .setStyle(TextInputStyle.Short).setRequired(true)
      );
    modal.addComponents(
      make('nickname', 'Nickname in Game', 'Enter your in-game nickname'),
      make('coord_x',  'Coordinate: X',   'Enter X coordinate'),
      make('coord_y',  'Coordinate: Y',   'Enter Y coordinate'),
      make('coord_z',  'Coordinate: Z',   'Enter Z coordinate'),
    );
    await interaction.showModal(modal);
  }

  // ── DELIVERY SPEED → send payment buttons ─────────────────────────────────
  if (action === 'delivery') {
    const speed  = targetId;
    const userId = parts[2];

    if (interaction.user.id !== userId) {
      return interaction.reply({ content: '❌ This is not your order.', ephemeral: true });
    }

    const speedData = DELIVERY_SPEEDS[speed];
    if (!speedData) return interaction.reply({ content: '❌ Unknown delivery speed.', ephemeral: true });

    const cart = await getCart(userId);
    if (!cart) return interaction.reply({ content: '❌ No active cart found.', ephemeral: true });

    cart.deliverySpeed = speed;
    cart.deliveryFee   = speedData.fee;

    // Update order embed
    if (cart.orderMessageId && cart.orderChannelId) {
      try {
        const ch  = await interaction.client.channels.fetch(cart.orderChannelId);
        const msg = await ch.messages.fetch(cart.orderMessageId);
        await msg.edit({ embeds: [buildOrderEmbed(cart)], components: buildOrderButtons(userId) });
      } catch { /* ignore */ }
    }

    // Disable delivery buttons
    const disabledRow = new ActionRowBuilder().addComponents(
      Object.entries(DELIVERY_SPEEDS).map(([key, val]) =>
        new ButtonBuilder()
          .setCustomId(`delivery:${key}:${userId}`)
          .setLabel(key === speed ? `✅ ${val.label}` : val.label)
          .setStyle(key === speed ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(true)
      )
    );
    await interaction.update({ components: [disabledRow] });

    // Fetch payment methods for this guild
    const config  = await getConfig(interaction.guildId);
    const methods = config.paymentMethods ?? [];

    if (!methods.length) {
      await interaction.channel.send({ content: '⚠️ No payment methods configured. Ask an admin to use `/payment add`.' });
    } else {
      await interaction.channel.send({
        content: '💳 **Step 3 — Select your payment method:**',
        components: [buildPaymentButtons(userId, methods)],
      });
    }

    await saveCart(userId, cart);
  }

  // ── PAYMENT SELECTED → confirmation message ───────────────────────────────
  if (action === 'payment') {
    const index  = parseInt(targetId, 10);
    const userId = parts[2];

    if (interaction.user.id !== userId) {
      return interaction.reply({ content: '❌ This is not your order.', ephemeral: true });
    }

    const config  = await getConfig(interaction.guildId);
    const methods = config.paymentMethods ?? [];
    const method  = methods[index];
    if (!method) return interaction.reply({ content: '❌ Payment method not found.', ephemeral: true });

    const cart = await getCart(userId);
    if (!cart) return interaction.reply({ content: '❌ No active cart found.', ephemeral: true });

    cart.paymentMethod = method;
    cart.status        = 'processing';

    // Update order embed
    if (cart.orderMessageId && cart.orderChannelId) {
      try {
        const ch  = await interaction.client.channels.fetch(cart.orderChannelId);
        const msg = await ch.messages.fetch(cart.orderMessageId);
        await msg.edit({ embeds: [buildOrderEmbed(cart)], components: buildOrderButtons(userId) });
      } catch { /* ignore */ }
    }

    // Disable payment buttons
    const disabledRow = new ActionRowBuilder().addComponents(
      methods.slice(0, 5).map((m, i) =>
        new ButtonBuilder()
          .setCustomId(`payment:${i}:${userId}`)
          .setLabel(i === index ? `✅ ${m}` : m)
          .setStyle(i === index ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(true)
      )
    );
    await interaction.update({ components: [disabledRow] });

    // Confirmation summary
    const { DELIVERY_SPEEDS: DS } = require('../utils/orderUtils');
    const spd     = DS[cart.deliverySpeed];
    const items   = cart.items.map(e => `• **${e.title}** × ${e.quantity} @ ${e.price}`).join('\n');
    const summary =
      `✅ **Order confirmed!**\n\n` +
      `**Items:**\n${items || '—'}\n\n` +
      `**Nickname:** \`${cart.nickname ?? '—'}\`\n` +
      `**Coords:** X\`${cart.coordX ?? '—'}\` Y\`${cart.coordY ?? '—'}\` Z\`${cart.coordZ ?? '—'}\`\n` +
      `**Delivery:** ${spd ? `${spd.label} ($${spd.fee.toFixed(2)})` : '—'}\n` +
      `**Payment:** ${method}\n` +
      (cart.discountCode ? `**Discount:** \`${cart.discountCode}\` (-${cart.discountPercent}%)\n` : '');

    await interaction.channel.send({ content: summary });

    await saveCart(userId, cart);
  }

  // ── APPLY DISCOUNT ────────────────────────────────────────────────────────
  if (action === 'apply_discount') {
    const userId = targetId;
    if (interaction.user.id !== userId && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ This is not your order.', ephemeral: true });
    }
    const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
    const modal = new ModalBuilder().setCustomId(`discount_modal:${userId}`).setTitle('Apply Discount Code');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('code').setLabel('Discount Code').setPlaceholder('Enter your code')
          .setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
    await interaction.showModal(modal);
  }

  // ── CLOSE ORDER ───────────────────────────────────────────────────────────
  if (action === 'close_order') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Only admins can close orders.', ephemeral: true });
    }
    const cart = await getCart(targetId);
    await interaction.reply({ content: '🔒 Closing in 3 seconds...', ephemeral: true });
    setTimeout(async () => { try { await interaction.channel.delete(); } catch { /* ignore */ } }, 3000);
    if (cart) {
      await saveCart(targetId, {
        ...cart,
        orderChannelId: null, orderMessageId: null,
        items: [], status: 'waiting',
        deliverySpeed: null, deliveryFee: null,
        paymentMethod: null, discountCode: null, discountPercent: null,
      });
    }
  }

  // ── CLEAR ORDER ───────────────────────────────────────────────────────────
  if (action === 'clear_order') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Only admins can clear orders.', ephemeral: true });
    }
    const cart = await getCart(targetId);
    if (!cart) return interaction.reply({ content: '❌ Cart not found.', ephemeral: true });

    const cleared = { ...cart, items: [], status: 'waiting', nickname: null, coordX: null, coordY: null, coordZ: null, deliverySpeed: null, deliveryFee: null, paymentMethod: null, discountCode: null, discountPercent: null };
    await saveCart(targetId, cleared);

    try {
      const msg = await interaction.channel.messages.fetch(cart.orderMessageId);
      await msg.edit({ embeds: [buildOrderEmbed(cleared)], components: buildOrderButtons(targetId) });
    } catch { /* ignore */ }

    await interaction.reply({ content: '✅ Order cleared.', ephemeral: true });
  }
}

module.exports = { handleButton };
