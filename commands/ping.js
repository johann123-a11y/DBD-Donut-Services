const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getConfig, saveConfig } = require('../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Manage who gets pinged and can see order tickets')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a user or role to the ping list')
        .addUserOption(o => o.setName('user').setDescription('User to add').setRequired(false))
        .addRoleOption(o => o.setName('role').setDescription('Role to add').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a user or role from the ping list')
        .addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(false))
        .addRoleOption(o => o.setName('role').setDescription('Role to remove').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('list').setDescription('Show current ping list')
    ),

  async execute(interaction) {
    const sub    = interaction.options.getSubcommand();
    const config = await getConfig();
    if (!config.pingUsers) config.pingUsers = [];
    if (!config.pingRoles) config.pingRoles = [];

    if (sub === 'list') {
      const users = config.pingUsers.map(id => `<@${id}>`).join(', ') || 'None';
      const roles = config.pingRoles.map(id => `<@&${id}>`).join(', ') || 'None';
      return interaction.reply({ content: `📣 **Ping Users:** ${users}\n📣 **Ping Roles:** ${roles}`, ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');

    if (!user && !role) {
      return interaction.reply({ content: '❌ Please specify a user or role.', ephemeral: true });
    }

    if (sub === 'add') {
      if (user) {
        if (config.pingUsers.includes(user.id)) return interaction.reply({ content: `${user} is already on the ping list.`, ephemeral: true });
        config.pingUsers.push(user.id);
      }
      if (role) {
        if (config.pingRoles.includes(role.id)) return interaction.reply({ content: `${role} is already on the ping list.`, ephemeral: true });
        config.pingRoles.push(role.id);
      }
      await saveConfig({ pingUsers: config.pingUsers, pingRoles: config.pingRoles });
      return interaction.reply({ content: `✅ ${user ?? role} added to the ping list.`, ephemeral: true });
    }

    if (sub === 'remove') {
      if (user) config.pingUsers = config.pingUsers.filter(id => id !== user.id);
      if (role) config.pingRoles = config.pingRoles.filter(id => id !== role.id);
      await saveConfig({ pingUsers: config.pingUsers, pingRoles: config.pingRoles });
      return interaction.reply({ content: `✅ ${user ?? role} removed from the ping list.`, ephemeral: true });
    }
  },
};
