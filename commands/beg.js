const { SlashCommandBuilder, EmbedBuilder, InteractionContextType } = require("discord.js");
const { getSettings } = require("../handlers/settings");
const { beg, formatMoney } = require("../handlers/economy");

const LINES = [
    "A passerby took pity on you, and your begging efforts earned you",
    "Someone emptied their pockets for you and you walked away with",
    "You sat outside the bank looking miserable and collected",
    "A stranger felt generous today and handed you"
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName("beg")
        .setDescription("Beg strangers for a small amount of money")
        .setContexts(InteractionContextType.Guild),

    async execute(interaction) {
        const s = getSettings(interaction.guild.id);
        const result = beg(interaction.guild.id, interaction.user.id, s);

        if (!result.ok) {
            const embed = new EmbedBuilder()
                .setTitle("You are on cooldown")
                .setDescription(`You can beg again <t:${Math.floor(result.retryAt / 1000)}:R>.`)
                .setColor(0xed4245);
            return interaction.reply({ embeds: [embed] });
        }

        const line = LINES[Math.floor(Math.random() * LINES.length)];
        const embed = new EmbedBuilder()
            .setDescription(`${line} ${formatMoney(result.amount, s)}.`)
            .addFields({ name: "Now holding", value: formatMoney(result.wallet, s) })
            .setColor(0x57f287);

        return interaction.reply({ embeds: [embed] });
    }
};
