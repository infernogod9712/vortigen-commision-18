const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require("discord.js");
const { getSettings, updateSettings } = require("../handlers/settings");
const { currentWeek } = require("../handlers/shifts");

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

module.exports = {
    data: new SlashCommandBuilder()
        .setName("config")
        .setDescription("View or edit the bot settings")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addRoleOption(opt =>
            opt.setName("staff_role").setDescription("Role allowed to use the shift commands"))
        .addStringOption(opt =>
            opt.setName("reset_day")
                .setDescription("Day the shift week resets")
                .addChoices(...DAYS.map((name, value) => ({ name, value: String(value) }))))
        .addIntegerOption(opt =>
            opt.setName("reset_hour")
                .setDescription("Hour the week resets, 0 to 23")
                .setMinValue(0).setMaxValue(23))
        .addIntegerOption(opt =>
            opt.setName("utc_offset")
                .setDescription("Your timezone offset from UTC, for example -5 for EST")
                .setMinValue(-12).setMaxValue(14))
        .addIntegerOption(opt =>
            opt.setName("max_shift_hours")
                .setDescription("Auto close a shift left running this long")
                .setMinValue(1).setMaxValue(48)),

    async execute(interaction) {
        const patch = {};

        const staffRole = interaction.options.getRole("staff_role");
        if (staffRole) patch.staffRole = staffRole.id;

        const resetDay = interaction.options.getString("reset_day");
        if (resetDay !== null) patch.resetDay = Number(resetDay);

        for (const [option, key] of [
            ["reset_hour", "resetHour"],
            ["utc_offset", "utcOffset"],
            ["max_shift_hours", "maxShiftHours"]
        ]) {
            const value = interaction.options.getInteger(option);
            if (value !== null) patch[key] = value;
        }

        const changed = Object.keys(patch).length;
        if (changed) updateSettings(interaction.guild.id, patch);

        const s = getSettings(interaction.guild.id);
        const offset = s.utcOffset >= 0 ? `+${s.utcOffset}` : String(s.utcOffset);
        const nextReset = Math.floor((currentWeek(s) + 7 * 86400000) / 1000);

        const embed = new EmbedBuilder()
            .setTitle("Bot Configuration")
            .setColor(changed ? 0x57f287 : 0x5865f2)
            .addFields(
                { name: "Staff role", value: s.staffRole ? `<@&${s.staffRole}>` : "*(anyone can use shifts)*", inline: true },
                { name: "Week resets", value: `${DAYS[s.resetDay]} at ${String(s.resetHour).padStart(2, "0")}:00`, inline: true },
                { name: "Timezone", value: `UTC${offset}`, inline: true },
                { name: "Auto close shifts after", value: `${s.maxShiftHours}h`, inline: true },
                { name: "Next reset", value: `<t:${nextReset}:F>`, inline: false }
            )
            .setFooter({ text: changed ? "Settings saved." : "Run /config with options to change any of these." })
            .setTimestamp();

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
};
