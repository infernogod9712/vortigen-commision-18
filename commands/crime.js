const { SlashCommandBuilder, EmbedBuilder, InteractionContextType } = require("discord.js");
const { getSettings } = require("../handlers/settings");
const { crime, formatMoney } = require("../handlers/economy");

const WINS = [
    "You hot-wired a car two streets over and sold it on for",
    "You ran a scam on a tourist and pocketed",
    "You cleaned out an unlocked till and got away with"
];

const LOSSES = [
    "You got caught on camera and the fine cost you",
    "An officer recognised you immediately. You paid",
    "The job went wrong and you had to buy your way out for"
];

function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("crime")
        .setDescription("Attempt a crime for a big payout, or lose money if you are caught")
        .setContexts(InteractionContextType.Guild),

    async execute(interaction) {
        const s = getSettings(interaction.guild.id);
        const result = crime(interaction.guild.id, interaction.user.id, s);

        if (!result.ok) {
            const embed = new EmbedBuilder().setColor(0xed4245);

            if (result.reason === "cooldown") {
                embed.setTitle("You are on cooldown")
                    .setDescription(`You can try another crime <t:${Math.floor(result.retryAt / 1000)}:R>.`);
            } else {
                embed.setTitle("Not enough money on you")
                    .setDescription(`You need at least ${formatMoney(result.need, s)} on you to attempt a crime. You are holding ${formatMoney(result.wallet, s)}.`);
            }

            return interaction.reply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
            .setTitle(result.won ? "The job paid off" : "You got caught")
            .setDescription(`${pick(result.won ? WINS : LOSSES)} ${formatMoney(result.amount, s)}.`)
            .addFields({ name: "Now holding", value: formatMoney(result.wallet, s) })
            .setColor(result.won ? 0x57f287 : 0xed4245);

        return interaction.reply({ embeds: [embed] });
    }
};
