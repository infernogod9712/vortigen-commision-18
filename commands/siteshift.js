const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { getSettings, canUseShifts } = require("../handlers/settings");
const { getSiteShift, setSiteShift } = require("../handlers/shifts");

const LOOK = {
    day: { label: "DAY", color: 0xfee75c, icon: "☀️" },
    night: { label: "NIGHT", color: 0x2b2d6e, icon: "🌙" }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName("siteshift")
        .setDescription("Switch the site to Day or Night shift and announce it")
        .setDMPermission(false)
        .addStringOption(opt =>
            opt.setName("shift")
                .setDescription("Leave blank to see the current site shift")
                .addChoices(
                    { name: "Day", value: "day" },
                    { name: "Night", value: "night" }
                )),

    async execute(interaction) {
        const settings = getSettings(interaction.guild.id);
        const shift = interaction.options.getString("shift");

        if (!shift) {
            const current = getSiteShift(interaction.guild.id);
            const look = LOOK[current.shift];
            const since = current.changedAt
                ? `Set by <@${current.changedBy}> <t:${Math.floor(current.changedAt / 1000)}:R>.`
                : "Nobody has set it yet, so it counts as Day.";
            return interaction.reply({
                content: `${look.icon} The site is on **${look.label} SHIFT**. ${since}`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (!canUseShifts(interaction.member, settings)) {
            return interaction.reply({
                content: `Only <@&${settings.staffRole}> can change the site shift.`,
                flags: MessageFlags.Ephemeral
            });
        }

        const res = setSiteShift(interaction.guild.id, shift, interaction.user.id);
        const look = LOOK[shift];

        const embed = new EmbedBuilder()
            .setTitle(`${look.icon} ${look.label} SHIFT HAS BEGUN`)
            .setDescription(`Set by <@${interaction.user.id}> at <t:${Math.floor(Date.now() / 1000)}:t>.`)
            .addFields({ name: "In game", value: `\`:subsideinfo Shift : ${look.label}\`` })
            .setColor(look.color)
            .setFooter({ text: "Staff shifts started now count as " + (shift === "day" ? "Day" : "Night") + " time" })
            .setTimestamp();

        const ping = settings.siteShiftPingRole ? `<@&${settings.siteShiftPingRole}>` : undefined;
        const message = {
            content: ping,
            embeds: [embed],
            allowedMentions: { roles: settings.siteShiftPingRole ? [settings.siteShiftPingRole] : [] }
        };
        const note = res.unchanged ? ` (it was already ${look.label}, announced again)` : "";

        if (settings.siteShiftChannel && settings.siteShiftChannel !== interaction.channelId) {
            const channel = await interaction.guild.channels.fetch(settings.siteShiftChannel).catch(() => null);
            if (!channel || !channel.isTextBased()) {
                return interaction.reply({
                    content: `Site shift is now **${look.label}**, but I cannot reach <#${settings.siteShiftChannel}> to announce it. Check my permissions there or change it with \`/config site_shift_channel\`.`,
                    flags: MessageFlags.Ephemeral
                });
            }
            const sent = await channel.send(message).catch(() => null);
            return interaction.reply({
                content: sent
                    ? `Site shift is now **${look.label}**${note}. Announced in <#${channel.id}>.`
                    : `Site shift is now **${look.label}**, but I could not post in <#${channel.id}>. Check my permissions there.`,
                flags: MessageFlags.Ephemeral
            });
        }

        return interaction.reply(message);
    }
};
