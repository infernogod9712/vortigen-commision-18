const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getSettings } = require("../handlers/settings");
const { getLeaderboard, currentWeek, formatDuration } = require("../handlers/shifts");

const MEDALS = ["🥇", "🥈", "🥉"];

module.exports = {
    data: new SlashCommandBuilder()
        .setName("shiftleaderboard")
        .setDescription("See everyone's shift time")
        .setDMPermission(false)
        .addStringOption(opt =>
            opt.setName("week")
                .setDescription("Which week to show")
                .addChoices(
                    { name: "This week", value: "current" },
                    { name: "Last week", value: "last" }
                )),

    async execute(interaction) {
        await interaction.deferReply();

        const settings = getSettings(interaction.guild.id);
        const which = interaction.options.getString("week") || "current";
        const { week, rows } = getLeaderboard(interaction.guild.id, settings, which);

        const top = rows.filter(r => r.ms + r.live > 0).slice(0, 25);
        const lines = top.map((r, i) => {
            const medal = MEDALS[i] || `**${i + 1}.**`;
            const total = formatDuration(r.ms + r.live);
            const live = r.live > 0 ? ` *(on ${r.livePeriod === "night" ? "Night" : "Day"} shift)*` : "";
            const count = r.sessions === 1 ? "1 shift" : `${r.sessions} shifts`;
            const split = r.dayMs || r.nightMs ? `, ${formatDuration(r.dayMs)} day / ${formatDuration(r.nightMs)} night` : "";
            return `${medal} <@${r.userId}> - **${total}** (${count}${split})${live}`;
        });

        const totalMs = rows.reduce((sum, r) => sum + r.ms + r.live, 0);
        const nextReset = Math.floor((currentWeek(settings) + 7 * 86400000) / 1000);

        const embed = new EmbedBuilder()
            .setTitle(which === "last" ? "Shift Leaderboard - Last Week" : "Shift Leaderboard - This Week")
            .setDescription(lines.length ? lines.join("\n") : "*Nobody has logged a shift yet.*")
            .setColor(0x5865f2)
            .addFields(
                { name: "Week starting", value: `<t:${Math.floor(week / 1000)}:D>`, inline: true },
                { name: "Staff on the board", value: String(top.length), inline: true },
                { name: "Combined time", value: formatDuration(totalMs), inline: true }
            )
            .setTimestamp();

        if (which !== "last") {
            embed.setFooter({ text: "Resets weekly" });
            embed.addFields({ name: "Next reset", value: `<t:${nextReset}:R>` });
        }

        return interaction.editReply({ embeds: [embed] });
    }
};
