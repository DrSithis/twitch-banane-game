// ==========================================================================
// GAME — le "lancer" de banane : commandes !banane, !bananestats,
// !bananepoints, !topbanane et !banane_add (commande modo).
// ==========================================================================

const express = require('express');
const { redis } = require('./redis');
const messages = require('./messages');
const { clean, pick, render } = require('./utils');
const { ensureUser, getWatchtimeMinutes } = require('./users');
const {
  CHANCE_BASE,
  CHANCE_MAX,
  WATCHTIME_BONUS_PER_HOUR,
  COOLDOWN_SECONDS,
  TOP_DEFAULT_LIMIT,
  CRIT_CHANCE,
  POINTS_CRITICAL,
  POINTS_CLASSIC,
  MISS_PENALTY_CHANCE,
  MISS_CONSOLATION_CHANCE,
  POINTS_MISS_PENALTY,
  POINTS_MISS_CONSOLATION,
  TROLL_TARGET,
} = require('./config');

const router = express.Router();

// ---- !banane @pseudo ----
router.get('/api/banane', async (req, res) => {
  const from = clean(req.query.from);
  const to = clean(req.query.to);
  const fromDisplay = req.query.from || from;
  const toDisplay = req.query.to || to;

  if (!from || !to) {
    return res.send(messages.usageBanane);
  }
  if (from === to) {
    return res.send(render(pick(messages.selfThrow), { from: fromDisplay }));
  }

  await ensureUser(from, fromDisplay);
  await ensureUser(to, toDisplay);

  const cooldownKey = `cooldown:${from}`;
  const onCooldown = await redis.get(cooldownKey);
  if (onCooldown) {
    const ttl = await redis.ttl(cooldownKey);
    const ttlDisplay = ttl > 0 ? ttl : COOLDOWN_SECONDS;
    return res.send(render(pick(messages.cooldown), { from: fromDisplay, seconds: ttlDisplay }));
  }
  await redis.set(cooldownKey, '1', { ex: COOLDOWN_SECONDS });

  const statsKey = `stats:${from}`;
  const targetedKey = `targeted:${to}`;

  await redis.hincrby(statsKey, 'throws', 1);
  await redis.zincrby(`targets:${from}`, 1, to);
  await redis.hincrby(targetedKey, 'throws', 1);

  // 1. Coup critique : 4% de chance sur CHAQUE tir, indépendamment de la cible.
  //    C'est la seule façon de toucher "drsithis" hors défaillance du système Troll Streamer.
  const isCritical = Math.random() < CRIT_CHANCE;
  const isTrollTarget = to === TROLL_TARGET;

  let success;
  if (isCritical) {
    success = true;
  } else if (isTrollTarget) {
    // Règle Troll Streamer : hors coup critique, le tir est forcé en échec.
    // Totalement invisible pour le tchat : on retombe sur les mêmes messages qu'un raté normal.
    success = false;
  } else {
    const watchMinutes = await getWatchtimeMinutes(from);
    const watchHours = watchMinutes / 60;
    const bonus = Math.min(watchHours * WATCHTIME_BONUS_PER_HOUR, CHANCE_MAX - CHANCE_BASE);
    const chance = Math.min(CHANCE_BASE + bonus, CHANCE_MAX);
    success = Math.random() * 100 < chance;
  }

  // ---- Tir réussi : critique (+5 par défaut) ou classique (+3 par défaut) ----
  if (success) {
    const earnedPoints = isCritical ? POINTS_CRITICAL : POINTS_CLASSIC;
    await redis.hincrby(statsKey, 'hits', 1);
    await redis.hincrby(statsKey, 'points', earnedPoints);
    await redis.hincrby(targetedKey, 'hits', 1);
    await redis.zincrby('leaderboard', earnedPoints, from);

    const template = isCritical ? pick(messages.successCritical) : pick(messages.successClassic);
    return res.send(render(template, { from: fromDisplay, to: toDisplay, points: earnedPoints }));
  }

  // ---- Tir raté (naturel ou forcé par la règle Troll Streamer) : sous-tirage pénalité / neutre / consolation ----
  const missRoll = Math.random();

  if (missRoll < MISS_PENALTY_CHANCE) {
    // Pénalité (-1 par défaut), jamais sous 0
    const currentStats = (await redis.hgetall(statsKey)) || {};
    const currentPoints = parseInt(currentStats.points || 0, 10);
    const appliedDelta = Math.max(POINTS_MISS_PENALTY, -currentPoints);
    if (appliedDelta !== 0) {
      await redis.hincrby(statsKey, 'points', appliedDelta);
      await redis.zincrby('leaderboard', appliedDelta, from);
    }
    return res.send(render(pick(messages.missPenalty), { from: fromDisplay, to: toDisplay, points: appliedDelta }));
  }

  if (missRoll < MISS_PENALTY_CHANCE + MISS_CONSOLATION_CHANCE) {
    // Consolation (+1 par défaut)
    await redis.hincrby(statsKey, 'points', POINTS_MISS_CONSOLATION);
    await redis.zincrby('leaderboard', POINTS_MISS_CONSOLATION, from);
    return res.send(
      render(pick(messages.missConsolation), { from: fromDisplay, to: toDisplay, points: POINTS_MISS_CONSOLATION })
    );
  }

  // Neutre (0 pt, aucun appel Redis supplémentaire nécessaire)
  return res.send(render(pick(messages.missNeutral), { from: fromDisplay, to: toDisplay }));
});

// ---- !bananestats [ou] !bananecible @pseudo ----
router.get('/api/bananestats', async (req, res) => {
  const user = clean(req.query.user);
  const target = clean(req.query.target);
  const userDisplay = req.query.user || user;
  const targetDisplay = req.query.target || target;

  if (target) {
    const targeted = (await redis.hgetall(`targeted:${target}`)) || {};
    const throwsCount = parseInt(targeted.throws || 0, 10);
    const hits = parseInt(targeted.hits || 0, 10);
    const rate = throwsCount ? ((hits / throwsCount) * 100).toFixed(0) : 0;
    return res.send(
      render(messages.statsTarget, { target: targetDisplay, throws: throwsCount, hits, rate })
    );
  }

  if (!user) return res.send(messages.usageStats);

  const stats = (await redis.hgetall(`stats:${user}`)) || {};
  const throwsCount = parseInt(stats.throws || 0, 10);
  const hits = parseInt(stats.hits || 0, 10);
  const points = parseInt(stats.points || 0, 10);
  const rate = throwsCount ? ((hits / throwsCount) * 100).toFixed(0) : 0;

  const topTargets = await redis.zrange(`targets:${user}`, 0, 0, { rev: true });
  const favTargetLower = topTargets && topTargets.length ? topTargets[0] : null;
  const favTarget = favTargetLower ? (await redis.get(`displayname:${favTargetLower}`)) || favTargetLower : null;
  const favPhrase = favTarget
    ? render(messages.favTargetPhrase, { target: favTarget })
    : messages.favTargetEmpty;

  return res.send(
    render(messages.statsSelf, { user: userDisplay, throws: throwsCount, hits, rate, points, favPhrase })
  );
});

// ---- !bananepoints (ou !bananepoints @pseudo) ----
router.get('/api/bananepoints', async (req, res) => {
  const user = clean(req.query.user);
  const userDisplay = req.query.user || user;
  if (!user) return res.send(messages.usagePoints);

  const stats = (await redis.hgetall(`stats:${user}`)) || {};
  const points = parseInt(stats.points || 0, 10);

  return res.send(render(messages.points, { user: userDisplay, points, plural: points > 1 ? 's' : '' }));
});

// ---- !topbanane (top 3 par défaut dans le tchat) ----
router.get('/api/topbanane', async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || TOP_DEFAULT_LIMIT;
  const members = await redis.zrange('leaderboard', 0, limit - 1, { rev: true });
  if (!members || !members.length) {
    return res.send(messages.topEmpty);
  }
  const medals = ['🥇', '🥈', '🥉'];
  const results = [];
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    const score = await redis.zscore('leaderboard', m);
    const displayName = (await redis.get(`displayname:${m}`)) || m;
    const medal = medals[i] || `${i + 1}.`;
    results.push(render(messages.topEntry, { medal, user: displayName, points: score || 0 }));
  }
  return res.send(messages.topPrefix + results.join(' | '));
});

// ---- Commande modo pour ajouter ou retirer des points ----
router.get('/api/banane-add', async (req, res) => {
  const { user, target, amount } = req.query;

  // 1. VÉRIFICATION DES PERMISSIONS (DrSithis ou Modérateur uniquement)
  const isStreamer = user && user.toLowerCase() === 'drsithis';

  if (!isStreamer) {
    return res.send(`⛔ Seul DrSithis peut donner des bananes !`);
  }

  // 2. VÉRIFICATION DES ARGUMENTS
  if (!target || !amount) {
    return res.send(`⚠️ Usage : !banane_add @pseudo <nombre> (ex: !banane_add @joueur 50)`);
  }

  const cleanTarget = target.replace('@', '').toLowerCase();
  const pointsToAdd = parseInt(amount, 10);

  if (isNaN(pointsToAdd)) {
    return res.send(`⚠️ Le montant doit être un nombre valide.`);
  }

  // 3. AJOUT DES POINTS DANS REDIS
  // On utilise bien la clé "leaderboard" (celle lue par !topbanane, /classement,
  // !bananestats et la boutique) — pas "banane:leaderboard", qui n'était lue nulle
  // part ailleurs et rendait cette commande invisible partout.
  await ensureUser(cleanTarget, target.replace('@', ''));
  await redis.hincrby(`stats:${cleanTarget}`, 'points', pointsToAdd);
  const newScore = await redis.zincrby('leaderboard', pointsToAdd, cleanTarget);

  return res.send(`🍌 @${user} a donné ${pointsToAdd} points à @${cleanTarget} ! (Nouveau solde : ${newScore} pts)`);
});

module.exports = { router };
