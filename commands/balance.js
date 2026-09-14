const { SlashCommandBuilder, EmbedBuilder, InteractionContextType } = require("discord.js");
const { getSettings } = require("../handlers/settings");
const { balance, formatMoney } = require("../handlers/economy");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("balance")
        .setDescription("See how much money you are carrying and how much is banked")
        .setContexts(InteractionContextType.Guild)
        .addUserOption(opt =>
            opt.setName("user").setDescription("Look at someone else's balance instead")),

    async execute(interaction) {
        const target = interaction.options.getUser("user") || interaction.user;
        const s = getSettings(interaction.guild.id);
        const bal = balance(interaction.guild.id, target.id);

        const embed = new EmbedBuilder()
            .setTitle(`${target.username}'s balance`)
            .setThumbnail(target.displayAvatarURL())
            .setColor(0x57f287)
            .addFields(
                { name: "Holding", value: formatMoney(bal.wallet, s), inline: true },
                { name: "Bank", value: formatMoney(bal.bank, s), inline: true },
                { name: "Total", value: formatMoney(bal.total, s), inline: true }
            );

        return interaction.reply({ embeds: [embed] });
    }
};
