const { SlashCommandBuilder, EmbedBuilder, InteractionContextType } = require("discord.js");
const { getSettings } = require("../handlers/settings");
const { leaderboard, formatMoney } = require("../handlers/economy");

const MEDALS = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ecleaderboard")
        .setDescription("See who has the most money in the server")
        .setContexts(InteractionContextType.Guild)
        .addStringOption(opt =>
            opt.setName("type")
                .setDescription("Rank by pocket money or by bank balance")
                .addChoices(
                    { name: "Holding", value: "holding" },
                    { name: "Bank", value: "bank" }
                )),

    async execute(interaction) {
        await interaction.deferReply();

        const s = getSettings(interaction.guild.id);
        const which = interaction.options.getString("type") || "holding";
        const rows = leaderboard(interaction.guild.id, which, 10);

        if (!rows.length) {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle(`Economy Leaderboard - Top 10 - ${which === "bank" ? "Bank" : "Holding"}`)
                    .setDescription("Nobody has any money yet.")
                    .setColor(0x5865f2)]
            });
        }

        const lines = [];
        for (let i = 0; i < rows.length; i += 1) {
            const row = rows[i];
            const member = await interaction.guild.members.fetch(row.userId).catch(() => null);
            const name = member ? `${member}` : `<@${row.userId}>`;
            const rank = i < 3 ? MEDALS[i] : `${i + 1}.`;
            lines.push(`${rank} ${name} - ${formatMoney(row.value, s)}`);
        }

        const embed = new EmbedBuilder()
            .setTitle(`Economy Leaderboard - Top 10 - ${which === "bank" ? "Bank" : "Holding"}`)
            .setDescription(lines.join("\n"))
            .setColor(0xfee75c)
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }
};
