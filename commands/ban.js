const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, InteractionContextType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption(opt =>
      opt.setName('user').setDescription('Who to ban').setRequired(true))
    .addStringOption(opt =>
      opt.setName('reason').setDescription('Sent to them in a DM and saved in the audit log').setRequired(true))
    .addIntegerOption(opt =>
      opt.setName('purge')
         .setDescription('Also wipe their recent messages, 0 to 7 days back')
         .setMinValue(0).setMaxValue(7)),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const purgeDays = interaction.options.getInteger('purge') ?? 0;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (member) {
      if (member.id === interaction.user.id)
        return interaction.editReply('You cannot ban yourself.');
      if (member.id === interaction.guild.ownerId)
        return interaction.editReply('You cannot ban the server owner.');
      if (member.roles.highest.position >= interaction.member.roles.highest.position)
        return interaction.editReply('That user is the same rank or higher than you.');
      if (!member.bannable)
        return interaction.editReply('I cannot ban that user. Move my role above theirs.');

      await member.send(
        `You were banned from **${interaction.guild.name}**.\nReason: ${reason}`
      ).catch(() => null);
    }

    try {
      await interaction.guild.members.ban(target.id, {
        reason: `${interaction.user.tag}: ${reason}`,
        deleteMessageSeconds: purgeDays * 86400,
      });
      await interaction.editReply(`Banned **${target.tag}** for: ${reason}`);
    } catch (err) {
      console.error(err);
      await interaction.editReply('Ban failed. Check my permissions and role position.');
    }
  },
};