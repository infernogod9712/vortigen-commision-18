const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, InteractionContextType } = require("discord.js");
const { getSettings } = require("../handlers/settings");
const { grant, balance, formatMoney } = require("../handlers/economy");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("eco")
        .setDescription("Staff tool to hand out or take away money")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setContexts(InteractionContextType.Guild)
        .addStringOption(opt =>
            opt.setName("action")
                .setDescription("Add money to someone or take it off them")
                .setRequired(true)
                .addChoices(
                    { name: "Give", value: "give" },
                    { name: "Take", value: "take" }
                ))
        .addUserOption(opt =>
            opt.setName("user").setDescription("Who to adjust").setRequired(true))
        .addIntegerOption(opt =>
            opt.setName("amount").setDescription("How much").setRequired(true).setMinValue(1))
        .addStringOption(opt =>
            opt.setName("where")
                .setDescription("Their pocket or their bank account. Defaults to pocket")
                .addChoices(
                    { name: "Holding", value: "wallet" },
                    { name: "Bank", value: "bank" }
                )),

    async execute(interaction) {
        const s = getSettings(interaction.guild.id);
        const action = interaction.options.getString("action");
        const target = interaction.options.getUser("user");
        const amount = interaction.options.getInteger("amount");
        const where = interaction.options.getString("where") || "wallet";

        if (target.bot) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("Bots do not have balances.")]
            });
        }

        grant(interaction.guild.id, target.id, action === "give" ? amount : -amount, where);
        const bal = balance(interaction.guild.id, target.id);

        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle(action === "give" ? "Money added" : "Money removed")
            .setDescription(`${action === "give" ? "Gave" : "Took"} ${formatMoney(amount, s)} ${action === "give" ? "to" : "from"} ${target} (${where === "bank" ? "bank" : "holding"}).`)
            .addFields(
                { name: "Holding", value: formatMoney(bal.wallet, s), inline: true },
                { name: "Bank", value: formatMoney(bal.bank, s), inline: true }
            )
            .setFooter({ text: `By ${interaction.user.tag}` });

        return interaction.reply({ embeds: [embed] });
    }
};
