require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, Collection, Events, MessageFlags, EmbedBuilder } = require("discord.js");
const { getSettings, DEFAULTS } = require("./handlers/settings");
const { seedLottery, drawLottery, formatMoney } = require("./handlers/economy");

const TOKEN = (process.env.TOKEN || "").trim();
const OWNER_IDS = (process.env.OWNER_IDS || "")
    .split(",")
    .map(id => id.trim())
    .filter(id => /^\d{17,20}$/.test(id));

const PLACEHOLDERS = ["", "your-token-here", "PUT_YOUR_TOKEN_HERE"];

if (PLACEHOLDERS.includes(TOKEN)) {
    console.error("[vortigen] TOKEN is missing or still a placeholder in .env. Staying offline.");
    process.exit(1);
}

if (!OWNER_IDS.length) {
    console.error("[vortigen] OWNER_IDS is missing from .env. Add: OWNER_IDS=id1,id2");
    console.error("[vortigen] Without it nobody can run !sc, so the bot would be unusable. Staying offline.");
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
})

client.commands = new Collection();
const commandsPath = path.join(__dirname, "commands");
const failed = [];

for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"))) {
    try {
        const command = require(path.join(commandsPath, file));
        if (!command.data || !command.execute) {
            failed.push(`${file} (missing data or execute)`);
            continue;
        }
        command.data.toJSON();
        client.commands.set(command.data.name, command);
    } catch (err) {
        failed.push(`${file} (${err.message})`);
    }
}

if (failed.length) {
    console.error(`[vortigen] ${failed.length} command file(s) did not load:`);
    for (const line of failed) console.error(`  - ${line}`);
}

client.once(Events.ClientReady, () => {
    console.log(`[vortigen] Online as ${client.user.tag} in ${client.guilds.cache.size} server(s).`);
    console.log(`[vortigen] Loaded ${client.commands.size} command(s): ${[...client.commands.keys()].join(", ")}`);
    console.log(`[vortigen] Owners: ${OWNER_IDS.join(", ")}`);

    for (const guild of client.guilds.cache.values()) {
        const s = getSettings(guild.id);
        const unset = Object.keys(DEFAULTS).filter(k => {
            const v = s[k];
            return v === null || (Array.isArray(v) && !v.length);
        });
        if (unset.length) {
            console.log(`[vortigen] ${guild.name}: not configured yet -> ${unset.join(", ")} (use /config)`);
        }
        seedLottery(guild.id, s);
    }

    setInterval(runLotteryDraws, 60000);
    runLotteryDraws();
})

async function runLotteryDraws() {
    for (const guild of client.guilds.cache.values()) {
        const s = getSettings(guild.id);
        if (!s.lotteryChannel) continue;

        let result;
        try {
            result = drawLottery(guild.id, s);
        } catch (err) {
            console.error(`[vortigen] lottery draw failed in ${guild.id}:`, err.message);
            continue;
        }
        if (!result.ok) continue;

        const channel = await guild.channels.fetch(s.lotteryChannel).catch(() => null);
        if (!channel || !channel.isTextBased()) {
            console.warn(`[vortigen] lottery channel ${s.lotteryChannel} is unreachable in ${guild.name}.`);
            continue;
        }

        const embed = new EmbedBuilder()
            .setTitle("LOTTERY ANNOUNCEMENT")
            .setColor(result.winner ? 0x57f287 : 0x99aab5)
            .setFooter({ text: "Use /lottery to buy a ticket!" })
            .setTimestamp();

        if (result.winner) {
            embed.setDescription(
                `Congratulations to <@${result.winner}> for winning today's lottery!\n\n` +
                `They have won ${formatMoney(result.prize, s)} from ${result.totalTickets} ticket(s) sold.`
            );
        } else {
            embed.setDescription("Nobody won the lottery today.");
        }

        await channel.send({ embeds: [embed] }).catch(err =>
            console.error(`[vortigen] could not announce lottery in ${guild.name}:`, err.message));
    }
}

client.on(Events.InteractionCreate, async (interaction) => {
    try {
        if (!interaction.isChatInputCommand()) return;

        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        await command.execute(interaction);
    } catch (err) {
        console.error("[vortigen] interaction error:", err);
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
            interaction.reply({ content: "Something went wrong.", flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    }
})

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;

    const text = message.content.trim();
    if (text !== "!sc" && text !== "!sc here") return;
    if (!OWNER_IDS.includes(message.author.id)) {
        return message.reply("Only a bot owner can sync commands.").catch(() => {});
    }

    const data = [...client.commands.values()].map(c => c.data.toJSON());

    try {
        if (text === "!sc here") {
            await message.guild.commands.set(data);
            return message.reply(`Synced ${data.length} command(s) to this server only. They are usable right now.`);
        }

        await client.application.commands.set(data);

        let cleared = 0;
        for (const guild of client.guilds.cache.values()) {
            try {
                await guild.commands.set([]);
                cleared += 1;
            } catch (e) {
                console.warn(`[vortigen] could not clear guild commands in ${guild.id}:`, e.message);
            }
        }

        await message.reply(`Synced ${data.length} command(s) to every server and cleared local copies in ${cleared}. Global commands can take up to an hour to appear. Use \`!sc here\` if you want them instantly.`);
    } catch (err) {
        console.error("[vortigen] sync error:", err);
        await message.reply(`Sync failed: ${err.message}`).catch(() => {});
    }
})

client.on("error", (err) => console.error("[vortigen] client error:", err));
process.on("unhandledRejection", (err) => console.error("[vortigen] unhandled rejection:", err));
process.on("uncaughtException", (err) => console.error("[vortigen] UNCAUGHT EXCEPTION:", err));

client.login(TOKEN);
