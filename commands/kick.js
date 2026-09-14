const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, InteractionContextType } = require('discord.js');

  module.exports = {
    data: new SlashCommandBuilder()
      .setName('kick')
      .setDescription('Kick a user from the server')
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
      .setContexts(InteractionContextType.Guild)
      .addUserOption(opt =>
        opt.setName('user').setDescription('Who to kick').setRequired(true))
      .addStringOption(opt =>
        opt.setName('reason').setDescription('Sent to them in a DM and saved in the audit log').setRequired(true)),

    async execute(interaction) {
      const target = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason');

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const member = await interaction.guild.members.fetch(target.id).catch(() => null);

      if (!member)
        return interaction.editReply('That user is not in this server.');
      if (member.id === interaction.user.id)
        return interaction.editReply('You cannot kick yourself.');
      if (member.id === interaction.guild.ownerId)
        return interaction.editReply('You cannot kick the server owner.');
      if (member.roles.highest.position >= interaction.member.roles.highest.position)
        return interaction.editReply('That user is the same rank or higher than you.');
      if (!member.kickable)
        return interaction.editReply('I cannot kick that user. Move my role above theirs.');

      await member.send(
        `You were kicked from **${interaction.guild.name}**.\nReason: ${reason}`
      ).catch(() => null);

      try {
        await member.kick(`${interaction.user.tag}: ${reason}`);
        await interaction.editReply(`Kicked **${target.tag}** for: ${reason}`);
      } catch (err) {
        console.error(err);
        await interaction.editReply('Kick failed. Check my permissions and role position.');
      }
    },
  };