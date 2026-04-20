const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const { getShop, saveShop, deleteShop, findShopByName, getAllShops } = require('../utils/db');
const { generateItemId, buildShopEmbed } = require('../utils/orderUtils');

async function spawnShopItem(channel, item) {
  const embed = buildShopEmbed(item);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`add_to_cart:${item._id ?? item.id}`).setLabel('Add to Cart').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`remove_from_cart:${item._id ?? item.id}`).setLabel('Remove from Cart').setStyle(ButtonStyle.Danger),
  );
  const msg = await channel.send({ embeds: [embed], components: [row] });
  await saveShop(item._id ?? item.id, { ...item, messageId: msg.id, channelId: channel.id });
  return msg;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Shop management')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Add a new item to the shop (use /shop spawn to post it)')
        .addStringOption(o => o.setName('title').setDescription('Item name').setRequired(true))
        .addStringOption(o => o.setName('price').setDescription('Price e.g. 1m, 500k, 1b').setRequired(true))
        .addAttachmentOption(o => o.setName('image').setDescription('Item image').setRequired(false))
        .addStringOption(o => o.setName('image_url').setDescription('Or paste an image URL').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('spawn')
        .setDescription('Post all shop items in this channel (reposts deleted ones)')
    )
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Delete a shop item by name')
        .addStringOption(o => o.setName('name').setDescription('Item name').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const title    = interaction.options.getString('title');
      const price    = interaction.options.getString('price');
      const attach   = interaction.options.getAttachment('image');
      const imageUrl = attach?.url ?? interaction.options.getString('image_url') ?? null;

      const itemId = generateItemId();
      await saveShop(itemId, { title, price, imageUrl, createdBy: interaction.user.id, messageId: null, channelId: null });

      await interaction.reply({
        content: `✅ **${title}** saved to the shop. Use \`/shop spawn\` to post all items.`,
        ephemeral: true,
      });
    }

    if (sub === 'spawn') {
      await interaction.deferReply({ ephemeral: true });

      const items = await getAllShops();
      if (!items.length) {
        return interaction.editReply({ content: '❌ No items in the shop yet. Use `/shop create` first.' });
      }

      let posted = 0;
      let skipped = 0;

      for (const item of items) {
        // Check if the message still exists
        let messageExists = false;
        if (item.messageId && item.channelId) {
          try {
            const ch  = await interaction.client.channels.fetch(item.channelId);
            await ch.messages.fetch(item.messageId);
            messageExists = true;
          } catch { /* message was deleted */ }
        }

        if (!messageExists) {
          await spawnShopItem(interaction.channel, item);
          posted++;
        } else {
          skipped++;
        }
      }

      await interaction.editReply({
        content: `✅ Spawn complete — **${posted}** posted, **${skipped}** already active.`,
      });
    }

    if (sub === 'delete') {
      const name = interaction.options.getString('name');
      const item = await findShopByName(name);
      if (!item) return interaction.reply({ content: `❌ No item found with name **${name}**.`, ephemeral: true });

      // Delete the Discord message if it exists
      if (item.messageId && item.channelId) {
        try {
          const ch  = await interaction.client.channels.fetch(item.channelId);
          const msg = await ch.messages.fetch(item.messageId);
          await msg.delete();
        } catch { /* message already deleted */ }
      }

      await deleteShop(item._id);
      await interaction.reply({ content: `✅ **${item.title}** has been permanently deleted.`, ephemeral: true });
    }
  },
};
