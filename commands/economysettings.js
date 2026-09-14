const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags, ChannelType, InteractionContextType } = require("discord.js");
const { getSettings, updateSettings } = require("../handlers/settings");
const { formatMoney } = require("../handlers/economy");

const INTEGER_FIELDS = [
    ["daily_amount", "dailyAmount", "How much /daily pays out", 0, 100000000],
    ["beg_min", "begMin", "Smallest amount /beg can give", 0, 100000000],
    ["beg_max", "begMax", "Largest amount /beg can give", 0, 100000000],
    ["beg_cooldown", "begCooldownMinutes", "Minutes between /beg uses", 1, 10080],
    ["crime_min_wallet", "crimeMinWallet", "Money needed on hand to attempt /crime", 0, 100000000],
    ["crime_min", "crimeMin", "Smallest /crime payout", 0, 100000000],
    ["crime_max", "crimeMax", "Largest /crime payout", 0, 100000000],
    ["crime_success", "crimeSuccessPercent", "Percent chance /crime succeeds", 0, 100],
    ["crime_cooldown", "crimeCooldownMinutes", "Minutes between /crime uses", 1, 10080],
    ["rob_min_target", "robMinTargetWallet", "Money a member must carry to be robbable", 0, 100000000],
    ["rob_success", "robSuccessPercent", "Percent chance robbing a member works", 0, 100],
    ["rob_cooldown", "robCooldownMinutes", "Minutes between robbery attempts", 1, 10080],
    ["bankrob_min_bank", "bankRobMinBank", "Money you must have banked to rob the bank", 0, 100000000],
    ["bankrob_min", "bankRobMin", "Smallest bank robbery payout", 0, 100000000],
    ["bankrob_max", "bankRobMax", "Largest bank robbery payout", 0, 100000000],
    ["bankrob_success", "bankRobSuccessPercent", "Percent chance a bank robbery works", 0, 100],
    ["lottery_price", "lotteryTicketPrice", "Cost of one lottery ticket", 1, 100000000],
    ["lottery_prize", "lotteryPrize", "What the daily lottery winner receives", 1, 100000000],
    ["lottery_hour", "lotteryDrawHour", "Hour of day the lottery is drawn, 0 to 23", 0, 23]
];

let builder = new SlashCommandBuilder()
    .setName("economysettings")
    .setDescription("View or change the economy settings")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts(InteractionContextType.Guild)
    .addStringOption(opt =>
        opt.setName("currency_name").setDescription("What the money is called, for example WILL").setMaxLength(20))
    .addStringOption(opt =>
        opt.setName("currency_symbol").setDescription("Emoji or symbol shown before the number").setMaxLength(20))
    .addChannelOption(opt =>
        opt.setName("lottery_channel")
            .setDescription("Where the daily lottery result is announced")
            .addChannelTypes(ChannelType.GuildText));

for (const [name, , description, min, max] of INTEGER_FIELDS) {
    builder = builder.addIntegerOption(opt =>
        opt.setName(name).setDescription(description).setMinValue(min).setMaxValue(max));
}

module.exports = {
    data: builder,

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const patch = {};

        const name = interaction.options.getString("currency_name");
        if (name !== null) patch.currencyName = name.trim();

        const symbol = interaction.options.getString("currency_symbol");
        if (symbol !== null) patch.currencySymbol = symbol.trim();

        const channel = interaction.options.getChannel("lottery_channel");
        if (channel) patch.lotteryChannel = channel.id;

        for (const [option, key] of INTEGER_FIELDS) {
            const value = interaction.options.getInteger(option);
            if (value !== null) patch[key] = value;
        }

        const changed = Object.keys(patch).length;
        if (changed) updateSettings(guildId, patch);

        const s = getSettings(guildId);
        const problems = [];
        if (s.begMin > s.begMax) problems.push("beg_min is above beg_max");
        if (s.crimeMin > s.crimeMax) problems.push("crime_min is above crime_max");
        if (s.bankRobMin > s.bankRobMax) problems.push("bankrob_min is above bankrob_max");
        if (!s.lotteryChannel) problems.push("lottery_channel is unset, so no draw will run at all");

        const embed = new EmbedBuilder()
            .setTitle("Economy Configuration")
            .setColor(problems.length ? 0xfee75c : 0x57f287)
            .addFields(
                { name: "Currency", value: formatMoney(1000, s), inline: true },
                { name: "Daily bonus", value: formatMoney(s.dailyAmount, s), inline: true },
                { name: "Beg", value: `${s.begMin} to ${s.begMax}, every ${s.begCooldownMinutes}m`, inline: true },
                { name: "Crime", value: `${s.crimeMin} to ${s.crimeMax}, ${s.crimeSuccessPercent}% success, needs ${s.crimeMinWallet} on hand, every ${s.crimeCooldownMinutes}m`, inline: false },
                { name: "Rob a member", value: `${s.robSuccessPercent}% success, target needs ${s.robMinTargetWallet}, every ${s.robCooldownMinutes}m`, inline: false },
                { name: "Rob the bank", value: `${s.bankRobMin} to ${s.bankRobMax}, ${s.bankRobSuccessPercent}% success, needs ${s.bankRobMinBank} banked`, inline: false },
                { name: "Lottery", value: `${formatMoney(s.lotteryPrize, s)} prize, ${formatMoney(s.lotteryTicketPrice, s)} a ticket, drawn at ${String(s.lotteryDrawHour).padStart(2, "0")}:00 UTC${s.utcOffset >= 0 ? "+" : ""}${s.utcOffset}`, inline: false },
                { name: "Announce draw in", value: s.lotteryChannel ? `<#${s.lotteryChannel}>` : "*(not set)*", inline: false }
            )
            .setFooter({ text: problems.length ? `Check: ${problems.join("; ")}` : (changed ? "Settings saved." : "Run /economysettings with options to change any of these.") });

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
};
