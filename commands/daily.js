const { SlashCommandBuilder, EmbedBuilder, InteractionContextType } = require("discord.js");
const { getSettings } = require("../handlers/settings");
const { claimDaily, formatMoney } = require("../handlers/economy");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("daily")
        .setDescription("Claim your daily bonus, once every 24 hours")
        .setContexts(InteractionContextType.Guild),

    async execute(interaction) {
        const s = getSettings(interaction.guild.id);
        const result = claimDaily(interaction.guild.id, interaction.user.id, s);

        if (!result.ok) {
            const embed = new EmbedBuilder()
                .setTitle("You are on cooldown")
                .setDescription(`You can claim again <t:${Math.floor(result.retryAt / 1000)}:R>.`)
                .setColor(0xed4245);
            return interaction.reply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
            .setTitle("Daily bonus claimed")
            .setDescription(`You received ${formatMoney(result.amount, s)}.`)
            .addFields({ name: "Now holding", value: formatMoney(result.wallet, s) })
            .setColor(0x57f287);

        return interaction.reply({ embeds: [embed] });
    }
};
