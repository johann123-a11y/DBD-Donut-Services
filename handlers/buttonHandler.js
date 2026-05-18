const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { getShop, getCart, saveCart } = require('../utils/db');
const { buildShopEmbed, buildOrderEmbed, DELIVERY_SPEEDS } = require('../utils/orderUtils');
const { buildOrderButtons } = require('./modalHandler');

async function handleButton(interaction) {
  const parts    = interaction.customId.split(':');
  const action   = parts[0];
  const targetId = parts[1];

  // ── ADD TO CART ───────────────────────────────────────────────────────────
  if (action === 'add_to_cart') {
    const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
    const modal = new ModalBuilder().setCustomId(`add_to_cart_modal:${targetId}`).setTitle('Checkout');
    const make = (id, label, placeholder) =>
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId(id).setLabel(label).setPlaceholder(placeholder)
          .setStyle(TextInputStyle.Short).setRequired(true)
      );
    modal.addComponents(
      make('quantity', 'Quantity',        'e.g. 2'),
      make('nickname', 'Nickname in Game','Enter your in-game nickname'),
      make('coord_x',  'Coordinate: X',  'Enter X coordinate'),
      make('coord_y',  'Coordinate: Y',  'Enter Y coordinate'),
      make('coord_z',  'Coordinate: Z',  'Enter Z coordinate'),
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
        const orderCh  = await interaction.client.channels.fetch(cart.orderChannelId);
        const orderMsg = await orderCh.messages.fetch(cart.orderMessageId);
        await orderMsg.edit({ embeds: [buildOrderEmbed(cart)], components: buildOrderButtons(interaction.user.id) });
      } catch { /* ignore */ }
    }

    await interaction.reply({ content: `✅ **${existing.title}** removed from your cart.`, ephemeral: true });
  }

  // ── DELIVERY SPEED ────────────────────────────────────────────────────────
  if (action === 'delivery') {
    const speed  = targetId;            // default / fast / superfast
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

    if (cart.orderMessageId && cart.orderChannelId) {
      try {
        const ch  = await interaction.client.channels.fetch(cart.orderChannelId);
        const msg = await ch.messages.fetch(cart.orderMessageId);
        await msg.edit({ embeds: [buildOrderEmbed(cart)], components: buildOrderButtons(userId) });
      } catch { /* ignore */ }
    }

    // Disable the delivery buttons after selection
    try {
      const { DELIVERY_SPEEDS: DS } = require('../utils/orderUtils');
      const disabledRow = new ActionRowBuilder().addComponents(
        Object.entries(DS).map(([key, val]) =>
          new ButtonBuilder()
            .setCustomId(`delivery:${key}:${userId}`)
            .setLabel(key === speed ? `✅ ${val.label} ($${val.fee.toFixed(2)})` : `${val.label} ($${val.fee.toFixed(2)})`)
            .setStyle(key === speed ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(true)
        )
      );
      await interaction.update({ components: [disabledRow] });
    } catch {
      await interaction.reply({ content: `✅ Delivery set to **${speedData.label}** (+$${speedData.fee.toFixed(2)} USD).`, ephemeral: true });
    }

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
    await interaction.reply({ content: '🔒 Closing order ticket in 3 seconds...', ephemeral: true });
    setTimeout(async () => {
      try { await interaction.channel.delete(); } catch { /* ignore */ }
    }, 3000);
    if (cart) {
      cart.orderChannelId  = null;
      cart.orderMessageId  = null;
      cart.items           = [];
      cart.status          = 'waiting';
      cart.deliverySpeed   = null;
      cart.deliveryFee     = null;
      cart.discountCode    = null;
      cart.discountPercent = null;
      await saveCart(targetId, cart);
    }
  }

  // ── CLEAR ORDER ───────────────────────────────────────────────────────────
  if (action === 'clear_order') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Only admins can clear orders.', ephemeral: true });
    }
    const cart = await getCart(targetId);
    if (!cart) return interaction.reply({ content: '❌ Cart not found.', ephemeral: true });

    cart.items           = [];
    cart.status          = 'waiting';
    cart.deliverySpeed   = null;
    cart.deliveryFee     = null;
    cart.discountCode    = null;
    cart.discountPercent = null;
    await saveCart(targetId, cart);

    try {
      const msg = await interaction.channel.messages.fetch(cart.orderMessageId);
      await msg.edit({ embeds: [buildOrderEmbed(cart)], components: buildOrderButtons(targetId) });
    } catch { /* ignore */ }

    await interaction.reply({ content: '✅ Order cleared.', ephemeral: true });
  }
}

module.exports = { handleButton };
