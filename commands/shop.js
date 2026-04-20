const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const { saveShop, addShopMessage, deleteShop, findShopByName, getAllShops, getShopsByMessageId } = require('../utils/db');
const { generateItemId, buildShopEmbed } = require('../utils/orderUtils');

// Spawn all items grouped into as few messages as possible
// Discord limit: 10 embeds + 5 action rows per message → max 5 items per message (1 row per item, 2 buttons each)
async function spawnItems(channel, items) {
  const ITEMS_PER_MSG = 5;
  const chunks = [];
  for (let i = 0; i < items.length; i += ITEMS_PER_MSG) {
    chunks.push(items.slice(i, i + ITEMS_PER_MSG));
  }

  for (const chunk of chunks) {
    const embeds = chunk.map(item => buildShopEmbed(item));
    const rows   = chunk.map(item =>
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`add_to_cart:${item._id}`).setLabel('Add to Cart').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`remove_from_cart:${item._id}`).setLabel('Remove from Cart').setStyle(ButtonStyle.Danger),
      )
    );

    const msg = await channel.send({ embeds, components: rows });

    for (const item of chunk) {
      await addShopMessage(String(item._id), msg.id, channel.id);
    }
  }

  return chunks.length;
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
      sub.setName('edit')
        .setDescription('Edit an existing shop item (updates all posted messages)')
        .addStringOption(o => o.setName('name').setDescription('Current item name').setRequired(true))
        .addStringOption(o => o.setName('new_title').setDescription('New title').setRequired(false))
        .addStringOption(o => o.setName('new_price').setDescription('New price e.g. 1m, 500k, 1b').setRequired(false))
        .addAttachmentOption(o => o.setName('new_image').setDescription('New image').setRequired(false))
        .addStringOption(o => o.setName('new_image_url').setDescription('New image URL').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Permanently delete a shop item by name')
        .addStringOption(o => o.setName('name').setDescription('Item name').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── CREATE ────────────────────────────────────────────────────────────────
    if (sub === 'create') {
      const title    = interaction.options.getString('title');
      const price    = interaction.options.getString('price');
      const attach   = interaction.options.getAttachment('image');
      const imageUrl = attach?.url ?? interaction.options.getString('image_url') ?? null;

      const itemId = generateItemId();
      await saveShop(itemId, { title, price, imageUrl, createdBy: interaction.user.id, messages: [] });

      await interaction.reply({
        content: `✅ **${title}** saved. Use \`/shop spawn\` to post all items.`,
        ephemeral: true,
      });
    }

    // ── SPAWN ─────────────────────────────────────────────────────────────────
    if (sub === 'spawn') {
      await interaction.deferReply({ ephemeral: true });
      try {
        const items = await getAllShops();
        if (!items.length) {
          return interaction.editReply({ content: '❌ No items in the shop yet. Use `/shop create` first.' });
        }
        const channel  = interaction.channel ?? await interaction.client.channels.fetch(interaction.channelId);
        const messages = await spawnItems(channel, items);
        await interaction.editReply({ content: `✅ Spawned **${items.length}** items across **${messages}** message(s).` });
      } catch (err) {
        console.error('Spawn error:', err);
        await interaction.editReply({ content: `❌ Spawn failed: ${err.message}` });
      }
    }

    // ── EDIT ──────────────────────────────────────────────────────────────────
    if (sub === 'edit') {
      const name = interaction.options.getString('name');
      const item = await findShopByName(name);
      if (!item) return interaction.reply({ content: `❌ No item found with name **${name}**.`, ephemeral: true });

      await interaction.deferReply({ ephemeral: true });

      const newTitle    = interaction.options.getString('new_title');
      const newPrice    = interaction.options.getString('new_price');
      const newAttach   = interaction.options.getAttachment('new_image');
      const newImageUrl = newAttach?.url ?? interaction.options.getString('new_image_url');

      if (!newTitle && !newPrice && !newImageUrl) {
        return interaction.editReply({ content: '❌ Please provide at least one field to update.' });
      }

      if (newTitle)    item.title    = newTitle;
      if (newPrice)    item.price    = newPrice;
      if (newImageUrl) item.imageUrl = newImageUrl;

      await saveShop(String(item._id), { title: item.title, price: item.price, imageUrl: item.imageUrl });

      // Update all posted messages that contain this item
      // Each message may contain multiple items — rebuild its embeds
      const allMessages = [...new Set((item.messages ?? []).map(m => m.messageId))];
      let updated = 0;

      for (const messageId of allMessages) {
        const msgItems = await getShopsByMessageId(messageId);
        if (!msgItems.length) continue;

        const { channelId } = item.messages.find(m => m.messageId === messageId);
        try {
          const ch  = await interaction.client.channels.fetch(channelId);
          const msg = await ch.messages.fetch(messageId);

          const embeds = msgItems.map(mi => buildShopEmbed(mi._id === item._id ? item : mi));
          const rows   = msgItems.map(mi =>
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`add_to_cart:${mi._id}`).setLabel('Add to Cart').setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId(`remove_from_cart:${mi._id}`).setLabel('Remove from Cart').setStyle(ButtonStyle.Danger),
            )
          );

          await msg.edit({ embeds, components: rows });
          updated++;
        } catch { /* message deleted */ }
      }

      await interaction.editReply({ content: `✅ **${item.title}** updated (${updated} message(s) refreshed).` });
    }

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (sub === 'delete') {
      const name = interaction.options.getString('name');
      const item = await findShopByName(name);

      if (!item) return interaction.reply({ content: `❌ No item found with name **${name}**.`, ephemeral: true });

      await interaction.deferReply({ ephemeral: true });

      // Delete all Discord messages that contain this item
      const allMessageIds = [...new Set((item.messages ?? []).map(m => m.messageId))];
      let deleted = 0;

      for (const messageId of allMessageIds) {
        const { channelId } = item.messages.find(m => m.messageId === messageId);
        try {
          const ch  = await interaction.client.channels.fetch(channelId);
          const msg = await ch.messages.fetch(messageId);
          await msg.delete();
          deleted++;
        } catch { /* already deleted */ }
      }

      // Remove this item's messageId from sibling items that shared the same message
      for (const messageId of allMessageIds) {
        const siblings = await getShopsByMessageId(messageId);
        for (const sib of siblings) {
          if (String(sib._id) === String(item._id)) continue;
          await saveShop(String(sib._id), {
            messages: (sib.messages ?? []).filter(m => m.messageId !== messageId),
          });
        }
      }

      await deleteShop(item._id);
      await interaction.editReply({
        content: `✅ **${item.title}** permanently deleted (${deleted} message(s) removed). Cart entries are kept.`,
      });
    }
  },
};
