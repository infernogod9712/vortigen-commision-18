const { SlashCommandBuilder, EmbedBuilder, InteractionContextType } = require("discord.js");
const { getSettings } = require("../handlers/settings");
const { rob, robBank, formatMoney } = require("../handlers/economy");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("rob")
        .setDescription("Rob a member's pocket money, or leave it blank to rob the bank")
        .setContexts(InteractionContextType.Guild)
        .addUserOption(opt =>
            opt.setName("user").setDescription("Who to rob. Leave blank to hit the bank instead")),

    async execute(interaction) {
        const s = getSettings(interaction.guild.id);
        const target = interaction.options.getUser("user");
        const guildId = interaction.guild.id;

        const result = target
            ? rob(guildId, interaction.user.id, target.id, s)
            : robBank(guildId, interaction.user.id, s);

        if (!result.ok) {
            const embed = new EmbedBuilder().setColor(0xed4245).setTitle(target ? "Robbery failed" : "Rob Bank");

            if (result.reason === "cooldown") {
                embed.setTitle("You are on cooldown")
                    .setDescription(`You can rob again <t:${Math.floor(result.retryAt / 1000)}:R>.`);
            } else if (result.reason === "self") {
                embed.setDescription("You cannot rob yourself.");
            } else if (result.reason === "need_bank") {
                embed.setDescription(`You need more than ${formatMoney(result.need, s)} in your bank account to start a bank robbery. You have ${formatMoney(result.bank, s)} banked.`);
            } else {
                embed.setDescription(`${target} is not carrying enough to be worth robbing. They need at least ${formatMoney(result.need, s)} on them.`);
            }

            return interaction.reply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder().setColor(result.won ? 0x57f287 : 0xed4245);

        if (target) {
            embed.setTitle(result.won ? "Robbery successful" : "Robbery failed")
                .setDescription(result.won
                    ? `You robbed ${formatMoney(result.amount, s)} from ${target}.`
                    : `${target} fought you off and you paid them ${formatMoney(result.amount, s)} in damages.`)
                .addFields({ name: "Now holding", value: formatMoney(result.wallet, s) });
        } else {
            embed.setTitle(result.won ? "Bank robbery successful" : "Bank robbery failed")
                .setDescription(result.won
                    ? `You cleared out the vault and escaped with ${formatMoney(result.amount, s)}.`
                    : `Security caught you and the bank seized ${formatMoney(result.amount, s)} from your account.`)
                .addFields(result.won
                    ? { name: "Now holding", value: formatMoney(result.wallet, s) }
                    : { name: "Left in bank", value: formatMoney(result.bank, s) });
        }

        return interaction.reply({ embeds: [embed] });
    }
};
