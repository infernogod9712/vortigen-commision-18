const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.VORTIGEN_DATA_DIR || path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "shifts.json");
const KEEP_WEEKS = 8;

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

function getGuild(all, guildId) {
    if (!all[guildId]) all[guildId] = { active: {}, weeks: {}, site: null };
    if (!all[guildId].active) all[guildId].active = {};
    if (!all[guildId].weeks) all[guildId].weeks = {};
    return all[guildId];
}

function weekStartFor(ts, settings) {
    const offsetMs = settings.utcOffset * 3600000;
    const local = new Date(ts + offsetMs);
    const back = (local.getUTCDay() - settings.resetDay + 7) % 7;
    let startLocal = Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate() - back,
        settings.resetHour, 0, 0, 0
    );
    if (startLocal > local.getTime()) startLocal -= 7 * 86400000;
    return startLocal - offsetMs;
}

function currentWeek(settings) {
    return weekStartFor(Date.now(), settings);
}

function previousWeek(settings) {
    return currentWeek(settings) - 7 * 86400000;
}

function siteShiftOf(guild) {
    return guild.site && guild.site.shift === "night" ? "night" : "day";
}

function credit(guild, weekKey, userId, ms, period) {
    if (ms <= 0) return;
    if (!guild.weeks[weekKey]) guild.weeks[weekKey] = {};
    const row = guild.weeks[weekKey][userId] || { ms: 0, sessions: 0 };
    row.ms += ms;
    row.sessions += 1;
    if (period === "day" || period === "night") row[period] = (row[period] || 0) + ms;
    guild.weeks[weekKey][userId] = row;
}

function prune(guild, settings) {
    const cutoff = currentWeek(settings) - KEEP_WEEKS * 7 * 86400000;
    for (const key of Object.keys(guild.weeks)) {
        if (Number(key) < cutoff) delete guild.weeks[key];
    }
}

function workedMs(shift, now) {
    const breaking = shift.breakStartedAt ? now - shift.breakStartedAt : 0;
    return Math.max(0, now - shift.startedAt - shift.breakMs - breaking);
}

function sweepStale(guild, settings, now) {
    const limit = settings.maxShiftHours * 3600000;
    let swept = 0;
    for (const [userId, shift] of Object.entries(guild.active)) {
        if (now - shift.startedAt < limit) continue;
        const capped = Math.min(workedMs(shift, now), limit);
        credit(guild, weekStartFor(shift.startedAt, settings), userId, capped, shift.period);
        delete guild.active[userId];
        swept += 1;
    }
    return swept;
}

function load(guildId, settings) {
    const all = readAll();
    const guild = getGuild(all, guildId);
    const swept = sweepStale(guild, settings, Date.now());
    if (swept) writeAll(all);
    return { all, guild };
}

function startShift(guildId, userId, settings) {
    const { all, guild } = load(guildId, settings);
    if (guild.active[userId]) return { ok: false, reason: "already_on" };
    const period = siteShiftOf(guild);
    guild.active[userId] = { startedAt: Date.now(), breakStartedAt: null, breakMs: 0, period };
    writeAll(all);
    return { ok: true, period };
}

function toggleBreak(guildId, userId, settings) {
    const { all, guild } = load(guildId, settings);
    const shift = guild.active[userId];
    if (!shift) return { ok: false, reason: "not_on" };

    if (shift.breakStartedAt) {
        const paused = Date.now() - shift.breakStartedAt;
        shift.breakMs += paused;
        shift.breakStartedAt = null;
        writeAll(all);
        return { ok: true, resumed: true, pausedMs: paused };
    }

    shift.breakStartedAt = Date.now();
    writeAll(all);
    return { ok: true, resumed: false };
}

function endShift(guildId, userId, settings) {
    const { all, guild } = load(guildId, settings);
    const shift = guild.active[userId];
    if (!shift) return { ok: false, reason: "not_on" };

    const now = Date.now();
    const worked = workedMs(shift, now);
    const breakTotal = shift.breakMs + (shift.breakStartedAt ? now - shift.breakStartedAt : 0);

    credit(guild, weekStartFor(shift.startedAt, settings), userId, worked, shift.period);
    delete guild.active[userId];
    prune(guild, settings);
    writeAll(all);

    return { ok: true, workedMs: worked, breakMs: breakTotal, period: shift.period || null };
}

function getStatus(guildId, userId, settings) {
    const { guild } = load(guildId, settings);
    const week = currentWeek(settings);
    const row = (guild.weeks[week] || {})[userId] || { ms: 0, sessions: 0 };
    const shift = guild.active[userId] || null;
    const now = Date.now();

    return {
        weekMs: row.ms,
        dayMs: row.day || 0,
        nightMs: row.night || 0,
        period: shift ? shift.period || null : null,
        sessions: row.sessions,
        onShift: !!shift,
        onBreak: !!(shift && shift.breakStartedAt),
        liveMs: shift ? workedMs(shift, now) : 0,
        startedAt: shift ? shift.startedAt : null,
        weekStart: week
    };
}

function getLeaderboard(guildId, settings, which) {
    const { guild } = load(guildId, settings);
    const week = which === "last" ? previousWeek(settings) : currentWeek(settings);
    const rows = Object.entries(guild.weeks[week] || {}).map(([userId, r]) => ({
        userId,
        ms: r.ms,
        dayMs: r.day || 0,
        nightMs: r.night || 0,
        sessions: r.sessions,
        live: 0,
        livePeriod: null
    }));

    if (which !== "last") {
        const now = Date.now();
        for (const [userId, shift] of Object.entries(guild.active)) {
            if (weekStartFor(shift.startedAt, settings) !== week) continue;
            const live = workedMs(shift, now);
            const livePeriod = shift.period || null;
            const existing = rows.find(r => r.userId === userId);
            if (existing) Object.assign(existing, { live, livePeriod });
            else rows.push({ userId, ms: 0, dayMs: 0, nightMs: 0, sessions: 0, live, livePeriod });
        }
    }

    rows.sort((a, b) => (b.ms + b.live) - (a.ms + a.live));
    return { week, rows };
}

function getSiteShift(guildId) {
    const all = readAll();
    const guild = getGuild(all, guildId);
    return { shift: siteShiftOf(guild), changedAt: guild.site ? guild.site.changedAt : null, changedBy: guild.site ? guild.site.changedBy : null };
}

function setSiteShift(guildId, shift, userId) {
    if (shift !== "day" && shift !== "night") throw new Error(`unknown site shift "${shift}"`);
    const all = readAll();
    const guild = getGuild(all, guildId);
    const previous = siteShiftOf(guild);
    guild.site = { shift, changedAt: Date.now(), changedBy: userId };
    writeAll(all);
    return { previous, shift, unchanged: previous === shift };
}

function formatDuration(ms) {
    if (ms < 60000) return "0m";
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (!hours) return `${minutes}m`;
    if (!minutes) return `${hours}h`;
    return `${hours}h ${minutes}m`;
}

module.exports = {
    startShift,
    toggleBreak,
    endShift,
    getStatus,
    getLeaderboard,
    currentWeek,
    previousWeek,
    formatDuration,
    getSiteShift,
    setSiteShift
};
