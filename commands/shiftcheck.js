const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { getSettings, canUseShifts } = require("../handlers/settings");
const { getStatus, currentWeek, formatDuration } = require("../handlers/shifts");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("shiftcheck")
        .setDescription("Check your shift time this week")
        .setDMPermission(false)
        .addUserOption(opt =>
            opt.setName("user").setDescription("Check someone else instead (staff only)")),

    async execute(interaction) {
        const settings = getSettings(interaction.guild.id);
        const target = interaction.options.getUser("user") || interaction.user;
        const isSelf = target.id === interaction.user.id;

        if (!isSelf && !canUseShifts(interaction.member, settings)) {
            return interaction.reply({
                content: "You can only check your own shift.",
                flags: MessageFlags.Ephemeral
            });
        }

        const status = getStatus(interaction.guild.id, target.id, settings);
        const nextReset = Math.floor((currentWeek(settings) + 7 * 86400000) / 1000);

        let state = "Off shift";
        if (status.onBreak) state = "On break (clock paused)";
        else if (status.onShift) state = "On shift";

        const embed = new EmbedBuilder()
            .setTitle(`Shift record for ${target.tag}`)
            .setThumbnail(target.displayAvatarURL())
            .addFields(
                { name: "Status", value: state, inline: true },
                { name: "Shifts this week", value: String(status.sessions), inline: true },
                { name: "Logged this week", value: formatDuration(status.weekMs), inline: true }
            )
            .setColor(status.onShift ? 0x57f287 : 0x5865f2)
            .setFooter({ text: "Resets weekly" })
            .setTimestamp();

        if (status.onShift) {
            embed.addFields(
                { name: "Current shift", value: formatDuration(status.liveMs), inline: true },
                { name: "Clocked in", value: `<t:${Math.floor(status.startedAt / 1000)}:R>`, inline: true },
                { name: "Week total if you clock out now", value: formatDuration(status.weekMs + status.liveMs), inline: true }
            );
        }

        embed.addFields({ name: "Next weekly reset", value: `<t:${nextReset}:F> (<t:${nextReset}:R>)` });

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
};
