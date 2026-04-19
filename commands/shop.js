const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const { getShop, saveShop, deleteShop } = require('../utils/db');
const { generateItemId, buildShopEmbed } = require('../utils/orderUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Shop management')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Create a new shop item')
        .addStringOption(o => o.setName('title').setDescription('Item name').setRequired(true))
        .addNumberOption(o => o.setName('price').setDescription('Price in m').setRequired(true))
        .addAttachmentOption(o => o.setName('image').setDescription('Item image').setRequired(false))
        .addStringOption(o => o.setName('image_url').setDescription('Or paste an image URL').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Delete a shop item')
        .addStringOption(o => o.setName('item_id').setDescription('Item ID').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const title    = interaction.options.getString('title');
      const price    = interaction.options.getNumber('price');
      const attach   = interaction.options.getAttachment('image');
      const imageUrl = attach?.url ?? interaction.options.getString('image_url') ?? null;

      await interaction.deferReply();

      const itemId = generateItemId();
      const item   = { id: itemId, title, price, imageUrl, createdBy: interaction.user.id };
      const embed  = buildShopEmbed(item);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`add_to_cart:${itemId}`).setLabel('Add to Cart').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`remove_from_cart:${itemId}`).setLabel('Remove from Cart').setStyle(ButtonStyle.Danger),
      );

      const msg = await interaction.editReply({ embeds: [embed], components: [row] });
      await saveShop(itemId, { title, price, imageUrl, createdBy: interaction.user.id, messageId: msg.id, channelId: interaction.channelId });
    }

    if (sub === 'delete') {
      const itemId = interaction.options.getString('item_id');
      const item   = await getShop(itemId);
      if (!item) return interaction.reply({ content: '❌ Item not found.', ephemeral: true });

      try {
        const ch  = await interaction.client.channels.fetch(item.channelId);
        const msg = await ch.messages.fetch(item.messageId);
        await msg.delete();
      } catch { /* already deleted */ }

      await deleteShop(itemId);
      await interaction.reply({ content: `✅ Item \`${itemId}\` deleted.`, ephemeral: true });
    }
  },
};
