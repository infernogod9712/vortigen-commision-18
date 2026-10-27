const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), "vortigen-check-"));
process.env.VORTIGEN_DATA_DIR = SCRATCH;

let passed = 0;
let failed = 0;

function ok(name) {
    passed += 1;
    console.log(`  pass  ${name}`);
}

function bad(name, detail) {
    failed += 1;
    console.log(`  FAIL  ${name}`);
    if (detail) console.log(`        ${detail}`);
}

function is(name, actual, expected) {
    if (actual === expected) ok(name);
    else bad(name, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function truthy(name, value, detail) {
    if (value) ok(name);
    else bad(name, detail);
}

function section(title) {
    console.log(`\n${title}`);
}

section("TIER 1a  syntax");

const sourceFiles = ["index.js", "check.js"]
    .concat(fs.readdirSync("commands").filter(f => f.endsWith(".js")).map(f => path.join("commands", f)))
    .concat(fs.readdirSync("handlers").filter(f => f.endsWith(".js")).map(f => path.join("handlers", f)));

for (const file of sourceFiles) {
    try {
        execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
        ok(file);
    } catch (err) {
        bad(file, String(err.stderr || err.message).split("\n").slice(0, 3).join(" "));
    }
}

section("TIER 1b  module load and command serialization");

const commandDir = path.join(__dirname, "commands");
const seenNames = new Set();

for (const file of fs.readdirSync(commandDir).filter(f => f.endsWith(".js"))) {
    try {
        const command = require(path.join(commandDir, file));
        if (!command.data || typeof command.execute !== "function") {
            bad(file, "missing data or execute");
            continue;
        }
        const json = command.data.toJSON();
        if (seenNames.has(json.name)) {
            bad(file, `duplicate command name /${json.name}`);
            continue;
        }
        seenNames.add(json.name);

        const opts = (json.options || []);
        const firstOptional = opts.findIndex(o => !o.required);
        const lastRequired = opts.map(o => !!o.required).lastIndexOf(true);
        if (firstOptional !== -1 && lastRequired > firstOptional) {
            bad(file, "required options must be declared before optional ones");
            continue;
        }
        if (!json.description) {
            bad(file, "missing description");
            continue;
        }
        ok(`${file} -> /${json.name} [${opts.map(o => o.name + (o.required ? "*" : "")).join(", ")}]`);
    } catch (err) {
        bad(file, err.message);
    }
}

section("TIER 2a  settings handler");

const settings = require("./handlers/settings");
const G = "111111111111111111";

const fresh = settings.getSettings(G);
is("unknown guild falls back to defaults", fresh.maxShiftHours, settings.DEFAULTS.maxShiftHours);
is("unset reference default is null", fresh.staffRole, null);

settings.updateSettings(G, { staffRole: "222222222222222222", resetDay: 3 });
const saved = settings.getSettings(G);
is("update persists staffRole", saved.staffRole, "222222222222222222");
is("update persists resetDay", saved.resetDay, 3);
is("untouched key keeps default", saved.utcOffset, settings.DEFAULTS.utcOffset);

fs.writeFileSync(
    path.join(SCRATCH, "settings.json"),
    JSON.stringify({ [G]: { staffRole: "333333333333333333" } }, null, 2)
);
const backfilled = settings.getSettings(G);
is("old record back-fills new default maxShiftHours", backfilled.maxShiftHours, 12);
is("old record back-fills new default resetHour", backfilled.resetHour, 0);
is("old record keeps its own value", backfilled.staffRole, "333333333333333333");

const memberWith = { roles: { cache: new Map([["333333333333333333", {}]]) } };
const memberWithout = { roles: { cache: new Map() } };
memberWith.roles.cache.has = Map.prototype.has.bind(memberWith.roles.cache);
memberWithout.roles.cache.has = Map.prototype.has.bind(memberWithout.roles.cache);
is("staff role holder can use shifts", settings.canUseShifts(memberWith, backfilled), true);
is("non holder cannot use shifts", settings.canUseShifts(memberWithout, backfilled), false);
is("no staff role set means everyone can", settings.canUseShifts(memberWithout, { staffRole: null }), true);

section("TIER 2b  shift handler");

const shifts = require("./handlers/shifts");
const OFFSET = -5;
const anchor = new Date(Date.now() - 3 * 86400000 + OFFSET * 3600000);
const S = { resetDay: anchor.getUTCDay(), resetHour: anchor.getUTCHours(), utcOffset: OFFSET, maxShiftHours: 12 };
const H = "444444444444444444";
const U = "555555555555555555";

const week = shifts.currentWeek(S);
truthy("test week began long enough ago to hold a 30h shift", Date.now() - week > 31 * 3600000,
    `week began ${((Date.now() - week) / 3600000).toFixed(1)}h ago; shifts older than that land in last week`);
const asLocal = new Date(week + S.utcOffset * 3600000);
is("week starts on the configured day", asLocal.getUTCDay(), S.resetDay);
is("week starts at the configured hour", asLocal.getUTCHours(), S.resetHour);
truthy("week start is in the past", week <= Date.now(), `week=${week} now=${Date.now()}`);
truthy("next reset is in the future", week + 7 * 86400000 > Date.now());
is("previous week is exactly 7 days earlier", week - shifts.previousWeek(S), 7 * 86400000);

is("start shift succeeds", shifts.startShift(H, U, S).ok, true);
is("double start is refused", shifts.startShift(H, U, S).reason, "already_on");
is("break with no shift is refused", shifts.toggleBreak(H, "666666666666666666", S).reason, "not_on");
is("end with no shift is refused", shifts.endShift(H, "666666666666666666", S).reason, "not_on");

function patchActive(userId, patch) {
    const file = path.join(SCRATCH, "shifts.json");
    const all = JSON.parse(fs.readFileSync(file, "utf8"));
    Object.assign(all[H].active[userId], patch);
    fs.writeFileSync(file, JSON.stringify(all, null, 2));
}

const now = Date.now();
patchActive(U, { startedAt: now - 90 * 60000, breakStartedAt: null, breakMs: 10 * 60000 });
const ended = shifts.endShift(H, U, S);
is("90m shift minus 10m break credits 1h 20m", shifts.formatDuration(ended.workedMs), "1h 20m");
is("break total reported as 10m", shifts.formatDuration(ended.breakMs), "10m");

const status = shifts.getStatus(H, U, S);
is("week total after one shift", shifts.formatDuration(status.weekMs), "1h 20m");
is("session counted", status.sessions, 1);
is("no longer on shift", status.onShift, false);

shifts.startShift(H, "777777777777777777", S);
patchActive("777777777777777777", { startedAt: Date.now() - 30 * 3600000, breakStartedAt: null, breakMs: 0 });
const swept = shifts.getStatus(H, "777777777777777777", S);
is("abandoned 30h shift auto closed", swept.onShift, false);
is("credited only the 12h cap", shifts.formatDuration(swept.weekMs), "12h");

const board = shifts.getLeaderboard(H, S, "current");
truthy("leaderboard sorted descending", board.rows.every((r, i) =>
    i === 0 || (board.rows[i - 1].ms + board.rows[i - 1].live) >= (r.ms + r.live)));
is("leaderboard has both members", board.rows.length, 2);
is("capped member ranks first", board.rows[0].userId, "777777777777777777");
is("last week is empty", shifts.getLeaderboard(H, S, "last").rows.length, 0);

section("TIER 2b2  site shift (day / night)");

const D = "121212121212121212";
is("unset site shift counts as day", shifts.getSiteShift(D).shift, "day");
is("unset site shift has no setter", shifts.getSiteShift(D).changedBy, null);

const dayStart = shifts.startShift(D, U, S);
is("shift started on an unset site is tagged day", dayStart.period, "day");

const toNight = shifts.setSiteShift(D, "night", H);
is("switching reports the previous shift", toNight.previous, "day");
is("switching to night is a change", toNight.unchanged, false);
is("site shift now reads night", shifts.getSiteShift(D).shift, "night");
is("setter is recorded", shifts.getSiteShift(D).changedBy, H);
is("setting night again is flagged unchanged", shifts.setSiteShift(D, "night", H).unchanged, true);

let threw = false;
try { shifts.setSiteShift(D, "evening", H); } catch { threw = true; }
is("unknown site shift is rejected", threw, true);
is("rejected value did not overwrite", shifts.getSiteShift(D).shift, "night");

is("already running shift keeps its day tag", shifts.getStatus(D, U, S).period, "day");

function patchActiveIn(guildId, userId, p) {
    const file = path.join(SCRATCH, "shifts.json");
    const all = JSON.parse(fs.readFileSync(file, "utf8"));
    Object.assign(all[guildId].active[userId], p);
    fs.writeFileSync(file, JSON.stringify(all, null, 2));
}

patchActiveIn(D, U, { startedAt: Date.now() - 60 * 60000 });
is("ending reports the day tag", shifts.endShift(D, U, S).period, "day");

const N = "131313131313131313";
is("shift started during night is tagged night", shifts.startShift(D, N, S).period, "night");
patchActiveIn(D, N, { startedAt: Date.now() - 120 * 60000 });
const liveBoard = shifts.getLeaderboard(D, S, "current");
is("leaderboard shows the live night tag", liveBoard.rows.find(r => r.userId === N).livePeriod, "night");
shifts.endShift(D, N, S);

shifts.startShift(D, U, S);
patchActiveIn(D, U, { startedAt: Date.now() - 30 * 60000 });
shifts.endShift(D, U, S);

const split = shifts.getStatus(D, U, S);
is("day time credited", shifts.formatDuration(split.dayMs), "1h");
is("night time credited", shifts.formatDuration(split.nightMs), "30m");
is("day plus night equals the week total", split.dayMs + split.nightMs, split.weekMs);
is("night-only member has no day time", shifts.getStatus(D, N, S).dayMs, 0);

const splitBoard = shifts.getLeaderboard(D, S, "current");
is("leaderboard carries the night split", shifts.formatDuration(splitBoard.rows.find(r => r.userId === N).nightMs), "2h");

shifts.startShift(D, "141414141414141414", S);
patchActiveIn(D, "141414141414141414", { startedAt: Date.now() - 30 * 3600000 });
is("auto closed night shift is credited as night",
    shifts.formatDuration(shifts.getStatus(D, "141414141414141414", S).nightMs), "12h");

const OLD = "151515151515151515";
const shiftFile = path.join(SCRATCH, "shifts.json");
const allShifts = JSON.parse(fs.readFileSync(shiftFile, "utf8"));
allShifts[OLD] = { active: {}, weeks: { [week]: { [U]: { ms: 80 * 60000, sessions: 1 } } } };
fs.writeFileSync(shiftFile, JSON.stringify(allShifts, null, 2));
const legacy = shifts.getStatus(OLD, U, S);
is("records from before the split still show their total", shifts.formatDuration(legacy.weekMs), "1h 20m");
is("records from before the split show zero day time", legacy.dayMs, 0);
is("old guild file with no site entry reads as day", shifts.getSiteShift(OLD).shift, "day");

section("TIER 2c  formatDuration");

for (const [ms, expected] of [
    [0, "0m"],
    [59000, "0m"],
    [600000, "10m"],
    [3600000, "1h"],
    [4500000, "1h 15m"],
    [86400000, "24h"]
]) {
    is(`${ms}ms -> ${expected}`, shifts.formatDuration(ms), expected);
}

section("TIER 2e  economy handler");

const eco = require("./handlers/economy");
const E = "888888888888888888";
const A = "111000000000000001";
const B = "111000000000000002";

const ES = Object.assign({}, settings.DEFAULTS, { utcOffset: 0, lotteryDrawHour: 0 });

is("new account starts empty", eco.balance(E, A).total, 0);

const d1 = eco.claimDaily(E, A, ES);
is("daily pays the configured amount", d1.amount, ES.dailyAmount);
is("daily lands in the wallet", eco.balance(E, A).wallet, ES.dailyAmount);
is("second daily is refused", eco.claimDaily(E, A, ES).reason, "cooldown");
is("daily cooldown is 24h away", eco.claimDaily(E, A, ES).retryAt - Date.now() > 86000000, true);

const dep = eco.deposit(E, A, 400);
is("deposit moves the exact amount", dep.moved, 400);
is("wallet drops by the deposit", dep.wallet, 600);
is("bank rises by the deposit", dep.bank, 400);
is("blank amount deposits everything", eco.deposit(E, A, null).moved, 600);
is("deposit with empty wallet is refused", eco.deposit(E, A, null).reason, "empty_wallet");
is("over-withdraw is capped at the bank balance", eco.withdraw(E, A, 999999).moved, 1000);
is("withdraw with empty bank is refused", eco.withdraw(E, A, null).reason, "empty_bank");

is("pay yourself is refused", eco.pay(E, A, A, 10).reason, "self");
is("pay more than you hold is refused", eco.pay(E, A, B, 5000).reason, "poor");
is("pay succeeds", eco.pay(E, A, B, 250).ok, true);
is("payer wallet drops", eco.balance(E, A).wallet, 750);
is("payee wallet rises", eco.balance(E, B).wallet, 250);
is("payment moved money, it did not mint it", eco.balance(E, A).total + eco.balance(E, B).total, 1000);

is("crime below the minimum is refused", eco.crime(E, B, ES).reason, "too_poor");

eco.grant(E, A, 5000, "wallet");
const crimeWin = eco.crime(E, A, ES, Date.now(), 0);
is("forced-success crime wins", crimeWin.won, true);
is("crime win is inside the configured range",
    crimeWin.amount >= ES.crimeMin && crimeWin.amount <= ES.crimeMax, true);
is("crime is on cooldown after use", eco.crime(E, A, ES).reason, "cooldown");

eco.grant(E, "111000000000000003", 10000, "wallet");
const crimeLoss = eco.crime(E, "111000000000000003", ES, Date.now(), 0.999);
is("forced-failure crime loses", crimeLoss.won, false);
is("crime fine is the configured percent", crimeLoss.amount, 2500);
is("fine actually left the wallet", crimeLoss.wallet, 7500);

is("robbing yourself is refused", eco.rob(E, A, A, ES).reason, "self");
eco.grant(E, "111000000000000004", 100, "wallet");
is("robbing a broke target is refused", eco.rob(E, B, "111000000000000004", ES).reason, "target_too_poor");

eco.grant(E, "111000000000000005", 50000, "wallet");
eco.grant(E, "111000000000000006", 50000, "wallet");
const before5 = eco.balance(E, "111000000000000005").wallet;
const before6 = eco.balance(E, "111000000000000006").wallet;
const robWin = eco.rob(E, "111000000000000005", "111000000000000006", ES, Date.now(), 0);
is("forced-success rob wins", robWin.won, true);
is("rob is zero sum",
    eco.balance(E, "111000000000000005").wallet + eco.balance(E, "111000000000000006").wallet,
    before5 + before6);

is("bank robbery below the bank minimum is refused", eco.robBank(E, B, ES).reason, "need_bank");
eco.grant(E, "111000000000000007", 20000, "bank");
const bankWin = eco.robBank(E, "111000000000000007", ES, Date.now(), 0);
is("forced-success bank robbery wins", bankWin.won, true);
is("bank robbery payout is in range",
    bankWin.amount >= ES.bankRobMin && bankWin.amount <= ES.bankRobMax, true);

is("grant cannot push a balance negative", eco.grant(E, "111000000000000004", -99999, "wallet").wallet, 0);

const holdBoard = eco.leaderboard(E, "holding", 10);
is("leaderboard sorted by holding descending",
    holdBoard.every((r, i) => i === 0 || holdBoard[i - 1].value >= r.value), true);
const bankBoard = eco.leaderboard(E, "bank", 10);
is("bank leaderboard sorted descending",
    bankBoard.every((r, i) => i === 0 || bankBoard[i - 1].value >= r.value), true);
is("leaderboard respects the limit", eco.leaderboard(E, "holding", 3).length, 3);

section("TIER 2f  lottery");

const L = "999999999999999999";
eco.grant(L, A, 10000, "wallet");
is("cannot buy tickets you cannot afford", eco.buyTickets(L, B, 100, ES).reason, "poor");

const bought = eco.buyTickets(L, A, 4, ES);
is("ticket cost is price times count", bought.cost, 4 * ES.lotteryTicketPrice);
is("tickets are recorded", bought.owned, 4);
is("wallet paid for the tickets", eco.balance(L, A).wallet, 10000 - 4 * ES.lotteryTicketPrice);

eco.seedLottery(L, ES);
is("seeding an already-drawn lottery does nothing", eco.seedLottery(L, ES), false);

const drawKey = eco.drawKeyFor(Date.now(), ES);
is("draw key is in the past", drawKey <= Date.now(), true);
is("next draw is within 24h", drawKey + 86400000 > Date.now(), true);

const fresh2 = "999999999999999998";
eco.buyTickets(fresh2, A, 1, Object.assign({}, ES, { lotteryTicketPrice: 0 }));
const won = eco.drawLottery(fresh2, ES, Date.now(), 0);
is("draw picks a winner when tickets exist", won.winner, A);
is("winner is paid the prize", won.prize, ES.lotteryPrize);
is("second draw the same day is refused", eco.drawLottery(fresh2, ES).reason, "already_drawn");

const empty = "999999999999999997";
is("draw with no tickets has no winner", eco.drawLottery(empty, ES, Date.now(), 0).winner, null);

is("formatMoney uses the currency name",
    eco.formatMoney(1234, { currencyName: "WILL", currencySymbol: "" }), "1,234 WILL");

section("TIER 2d  data safety");

is("handler wrote to the scratch dir", fs.existsSync(path.join(SCRATCH, "shifts.json")), true);
is("handler did not touch the real data dir", fs.existsSync(path.join(__dirname, "data", "shifts.json")), false);

fs.rmSync(SCRATCH, { recursive: true, force: true });

console.log(`\n${failed ? "FAILED" : "OK"}  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
