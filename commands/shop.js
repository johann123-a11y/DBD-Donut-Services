const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const { saveShop, addShopMessage, deleteShop, findShopByName, getAllShops } = require('../utils/db');
const { generateItemId, buildShopEmbed } = require('../utils/orderUtils');

async function spawnShopItem(channel, item) {
  const itemId = String(item._id);
  const embed  = buildShopEmbed(item);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`add_to_cart:${itemId}`).setLabel('Add to Cart').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`remove_from_cart:${itemId}`).setLabel('Remove from Cart').setStyle(ButtonStyle.Danger),
  );
  const msg = await channel.send({ embeds: [embed], components: [row] });
  await addShopMessage(itemId, msg.id, channel.id);
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
        .setDescription('Post all shop items in this channel')
    )
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Delete a shop item by name (removes all posted messages)')
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
      await saveShop(itemId, { title, price, imageUrl, createdBy: interaction.user.id, messages: [] });

      await interaction.reply({
        content: `✅ **${title}** saved to the shop. Use \`/shop spawn\` to post all items.`,
        ephemeral: true,
      });
    }

    if (sub === 'spawn') {
      await interaction.deferReply({ ephemeral: true });

      try {
        const items = await getAllShops();
        if (!items.length) {
          return interaction.editReply({ content: '❌ No items in the shop yet. Use `/shop create` first.' });
        }

        const channel = interaction.channel ?? await interaction.client.channels.fetch(interaction.channelId);
        let posted = 0;

        for (const item of items) {
          try {
            await spawnShopItem(channel, item);
            posted++;
          } catch (err) {
            console.error(`Failed to spawn item ${item._id}:`, err);
          }
        }

        await interaction.editReply({ content: `✅ Spawn complete — **${posted}** items posted.` });
      } catch (err) {
        console.error('Spawn error:', err);
        await interaction.editReply({ content: `❌ Spawn failed: ${err.message}` });
      }
    }

    if (sub === 'delete') {
      const name = interaction.options.getString('name');
      const item = await findShopByName(name);
      if (!item) return interaction.reply({ content: `❌ No item found with name **${name}**.`, ephemeral: true });

      // Delete ALL posted messages across all channels
      let deleted = 0;
      for (const { messageId, channelId } of (item.messages ?? [])) {
        try {
          const ch  = await interaction.client.channels.fetch(channelId);
          const msg = await ch.messages.fetch(messageId);
          await msg.delete();
          deleted++;
        } catch { /* already deleted */ }
      }

      await deleteShop(item._id);
      await interaction.reply({
        content: `✅ **${item.title}** permanently deleted (${deleted} message(s) removed). Cart entries are kept.`,
        ephemeral: true,
      });
    }
  },
};
