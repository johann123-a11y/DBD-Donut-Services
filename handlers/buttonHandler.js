const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { getShop, getCart, saveCart } = require('../utils/db');
const { buildShopEmbed, buildOrderEmbed } = require('../utils/orderUtils');
const { buildOrderButtons } = require('./modalHandler');

async function handleButton(interaction) {
  const [action, targetId] = interaction.customId.split(':');

  if (action === 'add_to_cart') {
    const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
    const modal = new ModalBuilder().setCustomId(`add_to_cart_modal:${targetId}`).setTitle('Add to Cart');
    const quantityInput = new TextInputBuilder()
      .setCustomId('quantity').setLabel('Quantity').setPlaceholder('Enter quantity')
      .setStyle(TextInputStyle.Short).setRequired(true).setMinLength(1).setMaxLength(4);
    modal.addComponents(new ActionRowBuilder().addComponents(quantityInput));
    await interaction.showModal(modal);
  }

  if (action === 'remove_from_cart') {
    const item = await getShop(targetId);
    if (!item) return interaction.reply({ content: '❌ Item not found.', ephemeral: true });

    const cart = await getCart(interaction.user.id);
    if (!cart) return interaction.reply({ content: '❌ You have no active cart.', ephemeral: true });

    const existing = cart.items.find(e => e.shopItemId === targetId);
    if (!existing) return interaction.reply({ content: '❌ Item not in your cart.', ephemeral: true });

    cart.items = cart.items.filter(e => e.shopItemId !== targetId);
    await saveCart(interaction.user.id, cart);

    // Update all shop embeds across all channels
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

    // Update order ticket
    if (cart.orderMessageId && cart.orderChannelId) {
      try {
        const orderCh  = await interaction.client.channels.fetch(cart.orderChannelId);
        const orderMsg = await orderCh.messages.fetch(cart.orderMessageId);
        await orderMsg.edit({ embeds: [buildOrderEmbed(cart)], components: [buildOrderButtons(interaction.user.id)] });
      } catch { /* ignore */ }
    }

    await interaction.reply({ content: `✅ **${existing.title}** removed from your cart.`, ephemeral: true });
  }

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
      cart.orderChannelId = null;
      cart.orderMessageId = null;
      cart.items = [];
      cart.status = 'waiting';
      await saveCart(targetId, cart);
    }
  }

  if (action === 'clear_order') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Only admins can clear orders.', ephemeral: true });
    }
    const cart = await getCart(targetId);
    if (!cart) return interaction.reply({ content: '❌ Cart not found.', ephemeral: true });

    cart.items  = [];
    cart.status = 'waiting';
    await saveCart(targetId, cart);

    try {
      const msg = await interaction.channel.messages.fetch(cart.orderMessageId);
      await msg.edit({ embeds: [buildOrderEmbed(cart)], components: [buildOrderButtons(targetId)] });
    } catch { /* ignore */ }

    await interaction.reply({ content: '✅ Order cleared.', ephemeral: true });
  }
}

module.exports = { handleButton };
