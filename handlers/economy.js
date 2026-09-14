const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.VORTIGEN_DATA_DIR || path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "economy.json");

const DAY = 86400000;

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

function blankUser() {
    return { wallet: 0, bank: 0, cooldowns: {} };
}

function getGuild(all, guildId) {
    if (!all[guildId]) all[guildId] = {};
    const g = all[guildId];
    if (!g.users) g.users = {};
    if (!g.lottery) g.lottery = { tickets: {}, lastDraw: null };
    if (!g.lottery.tickets) g.lottery.tickets = {};
    return g;
}

function getUser(guild, userId) {
    if (!guild.users[userId]) guild.users[userId] = blankUser();
    const u = guild.users[userId];
    if (typeof u.wallet !== "number") u.wallet = 0;
    if (typeof u.bank !== "number") u.bank = 0;
    if (!u.cooldowns) u.cooldowns = {};
    return u;
}

function balance(guildId, userId) {
    const all = readAll();
    const u = getUser(getGuild(all, guildId), userId);
    return { wallet: u.wallet, bank: u.bank, total: u.wallet + u.bank };
}

function cooldownLeft(user, key, windowMs, now) {
    const last = user.cooldowns[key];
    if (!last) return 0;
    return Math.max(0, last + windowMs - now);
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function deposit(guildId, userId, amount) {
    const all = readAll();
    const u = getUser(getGuild(all, guildId), userId);
    const moved = amount === null ? u.wallet : Math.min(amount, u.wallet);

    if (moved <= 0) return { ok: false, reason: "empty_wallet" };

    u.wallet -= moved;
    u.bank += moved;
    writeAll(all);
    return { ok: true, moved, wallet: u.wallet, bank: u.bank };
}

function withdraw(guildId, userId, amount) {
    const all = readAll();
    const u = getUser(getGuild(all, guildId), userId);
    const moved = amount === null ? u.bank : Math.min(amount, u.bank);

    if (moved <= 0) return { ok: false, reason: "empty_bank" };

    u.bank -= moved;
    u.wallet += moved;
    writeAll(all);
    return { ok: true, moved, wallet: u.wallet, bank: u.bank };
}

function pay(guildId, fromId, toId, amount) {
    if (fromId === toId) return { ok: false, reason: "self" };
    if (amount <= 0) return { ok: false, reason: "bad_amount" };

    const all = readAll();
    const guild = getGuild(all, guildId);
    const from = getUser(guild, fromId);

    if (from.wallet < amount) return { ok: false, reason: "poor", wallet: from.wallet };

    const to = getUser(guild, toId);
    from.wallet -= amount;
    to.wallet += amount;
    writeAll(all);
    return { ok: true, amount, wallet: from.wallet };
}

function claimDaily(guildId, userId, settings, now = Date.now()) {
    const all = readAll();
    const u = getUser(getGuild(all, guildId), userId);
    const left = cooldownLeft(u, "daily", DAY, now);

    if (left > 0) return { ok: false, reason: "cooldown", retryAt: u.cooldowns.daily + DAY };

    u.wallet += settings.dailyAmount;
    u.cooldowns.daily = now;
    writeAll(all);
    return { ok: true, amount: settings.dailyAmount, wallet: u.wallet };
}

function beg(guildId, userId, settings, now = Date.now()) {
    const all = readAll();
    const u = getUser(getGuild(all, guildId), userId);
    const windowMs = settings.begCooldownMinutes * 60000;
    const left = cooldownLeft(u, "beg", windowMs, now);

    if (left > 0) return { ok: false, reason: "cooldown", retryAt: u.cooldowns.beg + windowMs };

    u.cooldowns.beg = now;
    const amount = randomInt(settings.begMin, settings.begMax);
    u.wallet += amount;
    writeAll(all);
    return { ok: true, amount, wallet: u.wallet };
}

function crime(guildId, userId, settings, now = Date.now(), roll = Math.random()) {
    const all = readAll();
    const u = getUser(getGuild(all, guildId), userId);
    const windowMs = settings.crimeCooldownMinutes * 60000;
    const left = cooldownLeft(u, "crime", windowMs, now);

    if (left > 0) return { ok: false, reason: "cooldown", retryAt: u.cooldowns.crime + windowMs };
    if (u.wallet < settings.crimeMinWallet) {
        return { ok: false, reason: "too_poor", need: settings.crimeMinWallet, wallet: u.wallet };
    }

    u.cooldowns.crime = now;
    const won = roll < settings.crimeSuccessPercent / 100;

    if (won) {
        const amount = randomInt(settings.crimeMin, settings.crimeMax);
        u.wallet += amount;
        writeAll(all);
        return { ok: true, won: true, amount, wallet: u.wallet };
    }

    const fine = Math.min(u.wallet, Math.floor(u.wallet * settings.crimeFinePercent / 100));
    u.wallet -= fine;
    writeAll(all);
    return { ok: true, won: false, amount: fine, wallet: u.wallet };
}

function rob(guildId, userId, targetId, settings, now = Date.now(), roll = Math.random()) {
    if (userId === targetId) return { ok: false, reason: "self" };

    const all = readAll();
    const guild = getGuild(all, guildId);
    const u = getUser(guild, userId);
    const windowMs = settings.robCooldownMinutes * 60000;
    const left = cooldownLeft(u, "rob", windowMs, now);

    if (left > 0) return { ok: false, reason: "cooldown", retryAt: u.cooldowns.rob + windowMs };

    const target = getUser(guild, targetId);
    if (target.wallet < settings.robMinTargetWallet) {
        return { ok: false, reason: "target_too_poor", need: settings.robMinTargetWallet, wallet: target.wallet };
    }

    u.cooldowns.rob = now;
    const won = roll < settings.robSuccessPercent / 100;

    if (won) {
        const amount = Math.max(1, Math.floor(target.wallet * randomInt(10, 40) / 100));
        target.wallet -= amount;
        u.wallet += amount;
        writeAll(all);
        return { ok: true, won: true, amount, wallet: u.wallet };
    }

    const fine = Math.min(u.wallet, Math.floor(u.wallet * settings.robFinePercent / 100));
    u.wallet -= fine;
    target.wallet += fine;
    writeAll(all);
    return { ok: true, won: false, amount: fine, wallet: u.wallet };
}

function robBank(guildId, userId, settings, now = Date.now(), roll = Math.random()) {
    const all = readAll();
    const u = getUser(getGuild(all, guildId), userId);
    const windowMs = settings.robCooldownMinutes * 60000;
    const left = cooldownLeft(u, "rob", windowMs, now);

    if (left > 0) return { ok: false, reason: "cooldown", retryAt: u.cooldowns.rob + windowMs };
    if (u.bank < settings.bankRobMinBank) {
        return { ok: false, reason: "need_bank", need: settings.bankRobMinBank, bank: u.bank };
    }

    u.cooldowns.rob = now;
    const won = roll < settings.bankRobSuccessPercent / 100;

    if (won) {
        const amount = randomInt(settings.bankRobMin, settings.bankRobMax);
        u.wallet += amount;
        writeAll(all);
        return { ok: true, won: true, amount, wallet: u.wallet };
    }

    const fine = Math.min(u.bank, Math.floor(u.bank * settings.bankRobFinePercent / 100));
    u.bank -= fine;
    writeAll(all);
    return { ok: true, won: false, amount: fine, bank: u.bank };
}

function grant(guildId, userId, amount, where) {
    const all = readAll();
    const u = getUser(getGuild(all, guildId), userId);

    if (where === "bank") u.bank = Math.max(0, u.bank + amount);
    else u.wallet = Math.max(0, u.wallet + amount);

    writeAll(all);
    return { ok: true, wallet: u.wallet, bank: u.bank };
}

function leaderboard(guildId, which, limit = 10) {
    const all = readAll();
    const guild = getGuild(all, guildId);
    const rows = Object.entries(guild.users).map(([userId, u]) => ({
        userId,
        wallet: u.wallet || 0,
        bank: u.bank || 0,
        value: which === "bank" ? (u.bank || 0) : (u.wallet || 0)
    }));

    rows.sort((a, b) => b.value - a.value || a.userId.localeCompare(b.userId));
    return rows.slice(0, limit);
}

function buyTickets(guildId, userId, count, settings) {
    if (count <= 0) return { ok: false, reason: "bad_amount" };

    const all = readAll();
    const guild = getGuild(all, guildId);
    const u = getUser(guild, userId);
    const cost = count * settings.lotteryTicketPrice;

    if (u.wallet < cost) return { ok: false, reason: "poor", cost, wallet: u.wallet };

    u.wallet -= cost;
    guild.lottery.tickets[userId] = (guild.lottery.tickets[userId] || 0) + count;
    writeAll(all);

    return {
        ok: true,
        cost,
        owned: guild.lottery.tickets[userId],
        totalTickets: Object.values(guild.lottery.tickets).reduce((a, b) => a + b, 0),
        wallet: u.wallet
    };
}

function lotteryState(guildId) {
    const all = readAll();
    const guild = getGuild(all, guildId);
    const tickets = guild.lottery.tickets;
    const total = Object.values(tickets).reduce((a, b) => a + b, 0);
    return { tickets, total, lastDraw: guild.lottery.lastDraw };
}

function drawKeyFor(now, settings) {
    const offsetMs = settings.utcOffset * 3600000;
    const local = new Date(now + offsetMs);
    let start = Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate(),
        settings.lotteryDrawHour, 0, 0, 0
    );
    if (start > local.getTime()) start -= DAY;
    return start - offsetMs;
}

function seedLottery(guildId, settings, now = Date.now()) {
    const all = readAll();
    const guild = getGuild(all, guildId);
    if (guild.lottery.lastDraw !== null) return false;
    guild.lottery.lastDraw = drawKeyFor(now, settings);
    writeAll(all);
    return true;
}

function drawLottery(guildId, settings, now = Date.now(), roll = Math.random()) {
    const key = drawKeyFor(now, settings);
    const all = readAll();
    const guild = getGuild(all, guildId);

    if (guild.lottery.lastDraw === key) return { ok: false, reason: "already_drawn" };

    const tickets = guild.lottery.tickets;
    const entries = Object.entries(tickets);
    const total = entries.reduce((a, [, n]) => a + n, 0);

    guild.lottery.lastDraw = key;
    guild.lottery.tickets = {};

    if (!total) {
        writeAll(all);
        return { ok: true, winner: null, drawKey: key };
    }

    let ticket = Math.floor(roll * total);
    let winnerId = entries[entries.length - 1][0];
    for (const [userId, count] of entries) {
        if (ticket < count) {
            winnerId = userId;
            break;
        }
        ticket -= count;
    }

    const prize = settings.lotteryPrize;
    getUser(guild, winnerId).wallet += prize;
    writeAll(all);

    return { ok: true, winner: winnerId, prize, totalTickets: total, drawKey: key };
}

function formatMoney(amount, settings) {
    return `${settings.currencySymbol}${amount.toLocaleString("en-US")} ${settings.currencyName}`.trim();
}

module.exports = {
    balance,
    deposit,
    withdraw,
    pay,
    claimDaily,
    beg,
    crime,
    rob,
    robBank,
    grant,
    leaderboard,
    buyTickets,
    lotteryState,
    seedLottery,
    drawLottery,
    drawKeyFor,
    formatMoney
};
