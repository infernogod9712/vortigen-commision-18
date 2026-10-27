const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.VORTIGEN_DATA_DIR || path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "settings.json");

const DEFAULTS = {
    staffRole: null,
    resetDay: 0,
    resetHour: 0,
    utcOffset: 0,
    maxShiftHours: 12,
    siteShiftChannel: null,
    siteShiftPingRole: null,

    currencyName: "WILL",
    currencySymbol: "",

    dailyAmount: 1000,

    begMin: 50,
    begMax: 250,
    begCooldownMinutes: 30,

    crimeMinWallet: 1000,
    crimeMin: 500,
    crimeMax: 3000,
    crimeSuccessPercent: 50,
    crimeFinePercent: 25,
    crimeCooldownMinutes: 60,

    robMinTargetWallet: 500,
    robSuccessPercent: 40,
    robFinePercent: 20,
    robCooldownMinutes: 120,

    bankRobMinBank: 10000,
    bankRobMin: 5000,
    bankRobMax: 25000,
    bankRobSuccessPercent: 25,
    bankRobFinePercent: 30,

    lotteryTicketPrice: 500,
    lotteryPrize: 10000,
    lotteryDrawHour: 0,
    lotteryChannel: null
};

function readAll() {
    try {
        return JSON.parse(fs.readFileSync(FILE, "utf8"));
    } catch {
        return {};
    }
}

function writeAll(obj) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(obj, null, 2));
}

function getSettings(guildId) {
    const all = readAll();
    return { ...DEFAULTS, ...(all[guildId] || {}) };
}

function updateSettings(guildId, patch) {
    const all = readAll();
    all[guildId] = { ...(all[guildId] || {}), ...patch };
    writeAll(all);
    return getSettings(guildId);
}

function canUseShifts(member, settings) {
    if (!settings.staffRole) return true;
    return member.roles.cache.has(settings.staffRole);
}

module.exports = { getSettings, updateSettings, canUseShifts, DEFAULTS };
