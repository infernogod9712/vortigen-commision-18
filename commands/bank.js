const { SlashCommandBuilder, EmbedBuilder, InteractionContextType } = require("discord.js");
const { getSettings } = require("../handlers/settings");
const { deposit, withdraw, formatMoney } = require("../handlers/economy");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("bank")
        .setDescription("Move money between your pocket and your bank account")
        .setContexts(InteractionContextType.Guild)
        .addStringOption(opt =>
            opt.setName("action")
                .setDescription("Put money in or take money out")
                .setRequired(true)
                .addChoices(
                    { name: "Deposit", value: "deposit" },
                    { name: "Withdraw", value: "withdraw" }
                ))
        .addIntegerOption(opt =>
            opt.setName("amount")
                .setDescription("How much to move. Leave blank to move everything")
                .setMinValue(1)),

    async execute(interaction) {
        const s = getSettings(interaction.guild.id);
        const action = interaction.options.getString("action");
        const amount = interaction.options.getInteger("amount");

        const result = action === "deposit"
            ? deposit(interaction.guild.id, interaction.user.id, amount)
            : withdraw(interaction.guild.id, interaction.user.id, amount);

        if (!result.ok) {
            const embed = new EmbedBuilder()
                .setColor(0xed4245)
                .setDescription(result.reason === "empty_wallet"
                    ? "You have no money on you to deposit."
                    : "You have nothing in your bank account to withdraw.");
            return interaction.reply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setDescription(action === "deposit"
                ? `You've successfully deposited ${formatMoney(result.moved, s)} into your bank!`
                : `You've successfully withdrawn ${formatMoney(result.moved, s)} from your bank!`)
            .addFields(
                { name: "Holding", value: formatMoney(result.wallet, s), inline: true },
                { name: "Bank", value: formatMoney(result.bank, s), inline: true }
            );

        return interaction.reply({ embeds: [embed] });
    }
};
