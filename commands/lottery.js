const { SlashCommandBuilder, EmbedBuilder, InteractionContextType } = require("discord.js");
const { getSettings } = require("../handlers/settings");
const { buyTickets, lotteryState, drawKeyFor, formatMoney } = require("../handlers/economy");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("lottery")
        .setDescription("Buy tickets for the daily lottery draw")
        .setContexts(InteractionContextType.Guild)
        .addIntegerOption(opt =>
            opt.setName("tickets")
                .setDescription("How many tickets to buy. Leave blank to just see the current draw")
                .setMinValue(1)
                .setMaxValue(100)),

    async execute(interaction) {
        const s = getSettings(interaction.guild.id);
        const count = interaction.options.getInteger("tickets");
        const nextDraw = Math.floor((drawKeyFor(Date.now(), s) + 86400000) / 1000);

        if (count === null) {
            const state = lotteryState(interaction.guild.id);
            const mine = state.tickets[interaction.user.id] || 0;

            const embed = new EmbedBuilder()
                .setTitle("Daily Lottery")
                .setColor(0xfee75c)
                .addFields(
                    { name: "Prize", value: formatMoney(s.lotteryPrize, s), inline: true },
                    { name: "Ticket price", value: formatMoney(s.lotteryTicketPrice, s), inline: true },
                    { name: "Tickets sold", value: String(state.total), inline: true },
                    { name: "Your tickets", value: String(mine), inline: true },
                    { name: "Next draw", value: `<t:${nextDraw}:R>`, inline: true }
                )
                .setFooter({ text: "Use /lottery tickets:1 to buy in." });

            return interaction.reply({ embeds: [embed] });
        }

        const result = buyTickets(interaction.guild.id, interaction.user.id, count, s);

        if (!result.ok) {
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(0xed4245)
                    .setDescription(`That costs ${formatMoney(result.cost, s)} and you are only holding ${formatMoney(result.wallet, s)}.`)]
            });
        }

        const embed = new EmbedBuilder()
            .setTitle("Tickets bought")
            .setColor(0x57f287)
            .setDescription(`You bought ${count} ticket(s) for ${formatMoney(result.cost, s)}.`)
            .addFields(
                { name: "Your tickets", value: String(result.owned), inline: true },
                { name: "Tickets sold", value: String(result.totalTickets), inline: true },
                { name: "Next draw", value: `<t:${nextDraw}:R>`, inline: true }
            );

        return interaction.reply({ embeds: [embed] });
    }
};
