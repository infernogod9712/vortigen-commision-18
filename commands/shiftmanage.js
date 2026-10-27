const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { getSettings, canUseShifts } = require("../handlers/settings");
const { startShift, toggleBreak, endShift, getStatus, formatDuration } = require("../handlers/shifts");

const PERIOD = { day: "Day", night: "Night" };

module.exports = {
    data: new SlashCommandBuilder()
        .setName("shiftmanage")
        .setDescription("Start, break, or end your shift")
        .setDMPermission(false)
        .addStringOption(opt =>
            opt.setName("action")
                .setDescription("What to do with your shift")
                .setRequired(true)
                .addChoices(
                    { name: "Start", value: "start" },
                    { name: "Break (toggles on and off)", value: "break" },
                    { name: "End", value: "end" }
                )),

    async execute(interaction) {
        const settings = getSettings(interaction.guild.id);

        if (!canUseShifts(interaction.member, settings)) {
            return interaction.reply({
                content: `Only <@&${settings.staffRole}> can use the shift system.`,
                flags: MessageFlags.Ephemeral
            });
        }

        const action = interaction.options.getString("action");
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        if (action === "start") {
            const res = startShift(guildId, userId, settings);
            if (!res.ok) {
                return interaction.reply({
                    content: "You are already on shift. Use `/shiftmanage action:End` first.",
                    flags: MessageFlags.Ephemeral
                });
            }
            const embed = new EmbedBuilder()
                .setTitle("Shift started")
                .setDescription(`<@${userId}> clocked in for **${PERIOD[res.period]} shift** <t:${Math.floor(Date.now() / 1000)}:R>.`)
                .setColor(0x57f287)
                .setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        if (action === "break") {
            const res = toggleBreak(guildId, userId, settings);
            if (!res.ok) {
                return interaction.reply({
                    content: "You are not on shift. Use `/shiftmanage action:Start` first.",
                    flags: MessageFlags.Ephemeral
                });
            }
            const status = getStatus(guildId, userId, settings);
            const embed = new EmbedBuilder()
                .setTitle(res.resumed ? "Back from break" : "On break")
                .setDescription(res.resumed
                    ? `<@${userId}> is back on shift after ${formatDuration(res.pausedMs)} on break.`
                    : `<@${userId}> is on break. The clock is paused until you run this again.`)
                .addFields({ name: "Worked this shift", value: formatDuration(status.liveMs), inline: true })
                .setColor(res.resumed ? 0x57f287 : 0xfee75c)
                .setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        const res = endShift(guildId, userId, settings);
        if (!res.ok) {
            return interaction.reply({
                content: "You are not on shift, so there is nothing to end.",
                flags: MessageFlags.Ephemeral
            });
        }

        const status = getStatus(guildId, userId, settings);
        const embed = new EmbedBuilder()
            .setTitle("Shift ended")
            .setDescription(res.period ? `<@${userId}> clocked out of **${PERIOD[res.period]} shift**.` : `<@${userId}> clocked out.`)
            .addFields(
                { name: "This shift", value: formatDuration(res.workedMs), inline: true },
                { name: "On break", value: formatDuration(res.breakMs), inline: true },
                { name: "Total this week", value: formatDuration(status.weekMs), inline: true },
                { name: "Day / Night this week", value: `${formatDuration(status.dayMs)} / ${formatDuration(status.nightMs)}`, inline: true }
            )
            .setColor(0xed4245)
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }
};
