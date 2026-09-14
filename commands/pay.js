const { SlashCommandBuilder, EmbedBuilder, InteractionContextType } = require("discord.js");
const { getSettings } = require("../handlers/settings");
const { pay, formatMoney } = require("../handlers/economy");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("pay")
        .setDescription("Send money from your pocket to another member")
        .setContexts(InteractionContextType.Guild)
        .addUserOption(opt =>
            opt.setName("user").setDescription("Who to send it to").setRequired(true))
        .addIntegerOption(opt =>
            opt.setName("amount").setDescription("How much to send").setRequired(true).setMinValue(1)),

    async execute(interaction) {
        const s = getSettings(interaction.guild.id);
        const target = interaction.options.getUser("user");
        const amount = interaction.options.getInteger("amount");

        if (target.bot) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("You cannot send money to a bot.")]
            });
        }

        const result = pay(interaction.guild.id, interaction.user.id, target.id, amount);

        if (!result.ok) {
            const embed = new EmbedBuilder().setColor(0xed4245);
            if (result.reason === "self") embed.setDescription("You cannot pay yourself.");
            else embed.setDescription(`You are only holding ${formatMoney(result.wallet, s)}. Withdraw from your bank first with \`/bank action:Withdraw\`.`);
            return interaction.reply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("Payment sent")
            .setDescription(`${interaction.user} sent ${formatMoney(result.amount, s)} to ${target}.`)
            .addFields({ name: "You are now holding", value: formatMoney(result.wallet, s) });

        return interaction.reply({ embeds: [embed] });
    }
};
