const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getShop, saveShop, getCart, saveCart } = require('../utils/db');
const { buildShopEmbed, buildOrderEmbed } = require('../utils/orderUtils');

async function handleButton(interaction) {
  const [action, itemId] = interaction.customId.split(':');

  if (action === 'add_to_cart') {
    const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

    const modal = new ModalBuilder()
      .setCustomId(`add_to_cart_modal:${itemId}`)
      .setTitle('Add to Cart');

    const quantityInput = new TextInputBuilder()
      .setCustomId('quantity')
      .setLabel('Quantity')
      .setPlaceholder('Enter quantity')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(4);

    modal.addComponents(new ActionRowBuilder().addComponents(quantityInput));
    await interaction.showModal(modal);
  }

  if (action === 'remove_from_cart') {
    const item = await getShop(itemId);
    if (!item) return interaction.reply({ content: '❌ Item not found.', ephemeral: true });

    const cart = await getCart(interaction.user.id);
    if (!cart) return interaction.reply({ content: '❌ You have no active cart.', ephemeral: true });

    const existing = cart.items.find(e => e.shopItemId === itemId);
    if (!existing) return interaction.reply({ content: '❌ Item not in your cart.', ephemeral: true });

    // Restore stock
    item.stock += existing.quantity;
    cart.items  = cart.items.filter(e => e.shopItemId !== itemId);

    await saveShop(itemId, item);
    await saveCart(interaction.user.id, cart);

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

    // Update order ticket
    if (cart.orderMessageId && cart.orderChannelId) {
      try {
        const orderCh  = await interaction.client.channels.fetch(cart.orderChannelId);
        const orderMsg = await orderCh.messages.fetch(cart.orderMessageId);
        await orderMsg.edit({ embeds: [buildOrderEmbed(cart)] });
      } catch { /* ignore */ }
    }

    await interaction.reply({ content: `✅ **${existing.title}** removed from your cart.`, ephemeral: true });
  }
}

module.exports = { handleButton };
