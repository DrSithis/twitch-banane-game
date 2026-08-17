// ==========================================================================
// ROUTES BANANE — !banane, !bananestats, !bananepoints, !topbanane,
// !banane_add (commande modo) et le debug de watchtime StreamElements.
// ==========================================================================

const express = require('express');
const { redis } = require('../lib/redis');
const messages = require('../lib/messages');
const { clean, pick, render } = require('../lib/utils');
const { ensureUser, getWatchtimeMinutes } = require('../lib/users');
const { addItem, removeItem } = require('../lib/inventory');
const { setManualRole, VALID_ROLES } = require('../lib/roles');
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
  ITEM_ID_TRIPLE,
  STUN_DURATION_SECONDS,
  SE_JWT_TOKEN,
  SE_CHANNEL_ID,
} = require('../lib/config');

const router = express.Router();

// ==========================================================================
// Un seul tir de banane : applique le RNG (critique / classique / pénalité /
// consolation / neutre), met à jour les stats + le classement dans Redis, et
// renvoie le résultat brut (sans phrase de tchat). Utilisé à la fois par le
// tir simple et par la Banane Triple, pour garantir un comportement identique.
// ==========================================================================
async function resolveThrow(fromLower, toLower, watchMinutes) {
  const statsKey = `stats:${fromLower}`;
  const targetedKey = `targeted:${toLower}`;

  await redis.hincrby(statsKey, 'throws', 1);
  await redis.zincrby(`targets:${fromLower}`, 1, toLower);
  await redis.hincrby(targetedKey, 'throws', 1);

  // 1. Coup critique : 4% de chance sur CHAQUE tir, indépendamment de la cible.
  const isCritical = Math.random() < CRIT_CHANCE;
  const isTrollTarget = toLower === TROLL_TARGET;

  let success;
  if (isCritical) {
    success = true;
  } else if (isTrollTarget) {
    // Règle Troll Streamer : hors coup critique, le tir est forcé en échec.
    success = false;
  } else {
    const watchHours = watchMinutes / 60;
    const bonus = Math.min(watchHours * WATCHTIME_BONUS_PER_HOUR, CHANCE_MAX - CHANCE_BASE);
    const chance = Math.min(CHANCE_BASE + bonus, CHANCE_MAX);
    success = Math.random() * 100 < chance;
  }

  // ---- Tir réussi : critique ou classique ----
  if (success) {
    const earnedPoints = isCritical ? POINTS_CRITICAL : POINTS_CLASSIC;
    await redis.hincrby(statsKey, 'hits', 1);
    if (isCritical) await redis.hincrby(statsKey, 'crits', 1);
    await redis.hincrby(statsKey, 'points', earnedPoints);
    await redis.hincrby(targetedKey, 'hits', 1);
    await redis.zincrby('leaderboard', earnedPoints, fromLower);
    return { type: isCritical ? 'critical' : 'hit', points: earnedPoints };
  }

  // ---- Tir raté : sous-tirage pénalité / neutre / consolation ----
  const missRoll = Math.random();

  if (missRoll < MISS_PENALTY_CHANCE) {
    const currentStats = (await redis.hgetall(statsKey)) || {};
    const currentPoints = parseInt(currentStats.points || 0, 10);
    const appliedDelta = Math.max(POINTS_MISS_PENALTY, -currentPoints);
    if (appliedDelta !== 0) {
      await redis.hincrby(statsKey, 'points', appliedDelta);
      await redis.zincrby('leaderboard', appliedDelta, fromLower);
    }
    return { type: 'penalty', points: appliedDelta };
  }

  if (missRoll < MISS_PENALTY_CHANCE + MISS_CONSOLATION_CHANCE) {
    await redis.hincrby(statsKey, 'points', POINTS_MISS_CONSOLATION);
    await redis.zincrby('leaderboard', POINTS_MISS_CONSOLATION, fromLower);
    return { type: 'consolation', points: POINTS_MISS_CONSOLATION };
  }

  return { type: 'neutral', points: 0 };
}

// ---- Route de debug pour vérifier la réponse brute de StreamElements ----
router.get('/api/debug-watchtime', async (req, res) => {
  const user = clean(req.query.user);
  if (!SE_JWT_TOKEN || !SE_CHANNEL_ID) {
    return res.json({ error: 'SE_JWT_TOKEN ou SE_CHANNEL_ID manquant' });
  }
  try {
    const r = await fetch(
      `https://api.streamelements.com/kappa/v2/loyalty/${SE_CHANNEL_ID}/${encodeURIComponent(user)}`,
      { headers: { Authorization: `Bearer ${SE_JWT_TOKEN}` } }
    );
    const data = await r.json();
    return res.json({ status: r.status, raw: data });
  } catch (e) {
    return res.json({ error: e.message });
  }
});

// ---- !banane @pseudo  (ou !banane @p1 @p2 @p3 avec une Banane Triple en inventaire) ----
router.get('/api/banane', async (req, res) => {
  const from = clean(req.query.from);
  const fromDisplay = req.query.from || from;

  // Découpe la chaîne "to" en pseudos individuels (espaces et/ou virgules).
  const rawTargets = (req.query.to || '')
    .toString()
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);

  if (!from || rawTargets.length === 0) {
    return res.send(messages.usageBanane);
  }

  // ---- Blocage Banane Stop : le lanceur ne peut rien faire tant qu'il est stun ----
  const stunKey = `stunted:${from}`;
  const isStunned = await redis.get(stunKey);
  if (isStunned) {
    const ttl = await redis.ttl(stunKey);
    const ttlDisplay = ttl > 0 ? ttl : STUN_DURATION_SECONDS;
    return res.send(render(messages.stunned, { from: fromDisplay, seconds: ttlDisplay }));
  }

  // Cible unique historique : on garde le comportement/les messages inchangés.
  if (rawTargets.length === 1) {
    const to = clean(rawTargets[0]);
    const toDisplay = rawTargets[0].replace(/^@/, '');

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

    const watchMinutes = await getWatchtimeMinutes(from);
    const result = await resolveThrow(from, to, watchMinutes);

    if (result.type === 'critical' || result.type === 'hit') {
      const template = result.type === 'critical' ? pick(messages.successCritical) : pick(messages.successClassic);
      return res.send(render(template, { from: fromDisplay, to: toDisplay, points: result.points }));
    }
    if (result.type === 'penalty') {
      return res.send(render(pick(messages.missPenalty), { from: fromDisplay, to: toDisplay, points: result.points }));
    }
    if (result.type === 'consolation') {
      return res.send(
        render(pick(messages.missConsolation), { from: fromDisplay, to: toDisplay, points: result.points })
      );
    }
    return res.send(render(pick(messages.missNeutral), { from: fromDisplay, to: toDisplay }));
  }

  // ---- 2 ou 3 pseudos détectés : tentative de Banane Triple ----
  // Dédoublonne et retire le lanceur lui-même de la liste des cibles.
  const seen = new Set();
  const targets = [];
  for (const raw of rawTargets) {
    const lower = clean(raw);
    if (!lower || lower === from || seen.has(lower)) continue;
    seen.add(lower);
    targets.push({ lower, display: raw.replace(/^@/, '') });
  }

  if (targets.length === 0) {
    return res.send(render(pick(messages.selfThrow), { from: fromDisplay }));
  }

  if (targets.length > 3) {
    return res.send(render(messages.tripleTooMany, { from: fromDisplay }));
  }

  // Après nettoyage il ne reste qu'une seule cible réelle -> tir simple classique.
  if (targets.length === 1) {
    const to = targets[0].lower;
    const toDisplay = targets[0].display;

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

    const watchMinutes = await getWatchtimeMinutes(from);
    const result = await resolveThrow(from, to, watchMinutes);

    if (result.type === 'critical' || result.type === 'hit') {
      const template = result.type === 'critical' ? pick(messages.successCritical) : pick(messages.successClassic);
      return res.send(render(template, { from: fromDisplay, to: toDisplay, points: result.points }));
    }
    if (result.type === 'penalty') {
      return res.send(render(pick(messages.missPenalty), { from: fromDisplay, to: toDisplay, points: result.points }));
    }
    if (result.type === 'consolation') {
      return res.send(
        render(pick(messages.missConsolation), { from: fromDisplay, to: toDisplay, points: result.points })
      );
    }
    return res.send(render(pick(messages.missNeutral), { from: fromDisplay, to: toDisplay }));
  }

  // ---- Vraie Banane Triple : 2 ou 3 cibles distinctes, il faut l'objet en inventaire ----
  await ensureUser(from, fromDisplay);
  const hasItem = await removeItem(from, ITEM_ID_TRIPLE, 1);
  if (!hasItem) {
    return res.send(render(messages.tripleNoItem, { from: fromDisplay }));
  }

  const cooldownKey = `cooldown:${from}`;
  const onCooldown = await redis.get(cooldownKey);
  if (onCooldown) {
    // Le cooldown bloque bien avant l'achat/la conso d'objet côté utilisateur normalement,
    // mais si jamais il est encore actif, on rend l'objet et on affiche le cooldown restant.
    await addItem(from, ITEM_ID_TRIPLE, 1);
    const ttl = await redis.ttl(cooldownKey);
    const ttlDisplay = ttl > 0 ? ttl : COOLDOWN_SECONDS;
    return res.send(render(pick(messages.cooldown), { from: fromDisplay, seconds: ttlDisplay }));
  }
  await redis.set(cooldownKey, '1', { ex: COOLDOWN_SECONDS });

  const watchMinutes = await getWatchtimeMinutes(from);
  let total = 0;
  const lines = [];

  for (const target of targets) {
    await ensureUser(target.lower, target.display);
    const result = await resolveThrow(from, target.lower, watchMinutes);
    total += result.points;

    const vars = { target: target.display, points: result.points };
    if (result.type === 'critical') lines.push(render(messages.tripleResultCritical, vars));
    else if (result.type === 'hit') lines.push(render(messages.tripleResultHit, vars));
    else if (result.type === 'penalty') lines.push(render(messages.tripleResultPenalty, vars));
    else if (result.type === 'consolation') lines.push(render(messages.tripleResultConsolation, vars));
    else lines.push(render(messages.tripleResultNeutral, vars));
  }

  const totalDisplay = total > 0 ? `+${total}` : `${total}`;
  return res.send(
    render(messages.tripleSummary, { from: fromDisplay, details: lines.join(' | '), total: totalDisplay })
  );
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
    return res.send(render(messages.statsTarget, { target: targetDisplay, throws: throwsCount, hits, rate }));
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
  const favPhrase = favTarget ? render(messages.favTargetPhrase, { target: favTarget }) : messages.favTargetEmpty;

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

  const isStreamer = user && user.toLowerCase() === TROLL_TARGET;
  if (!isStreamer) {
    return res.send(`⛔ Seul ${TROLL_TARGET} peut donner des bananes !`);
  }

  if (!target || !amount) {
    return res.send('⚠️ Usage : !banane_add @pseudo <nombre> (ex: !banane_add @joueur 50)');
  }

  const cleanTarget = clean(target);
  const pointsToAdd = parseInt(amount, 10);
  if (isNaN(pointsToAdd)) {
    return res.send('⚠️ Le montant doit être un nombre valide.');
  }

  await ensureUser(cleanTarget, target.replace('@', ''));
  await redis.hincrby(`stats:${cleanTarget}`, 'points', pointsToAdd);
  const newScore = await redis.zincrby('leaderboard', pointsToAdd, cleanTarget);

  return res.send(`🍌 @${user} a donné ${pointsToAdd} points à @${cleanTarget} ! (Nouveau solde : ${newScore} pts)`);
});

// ---- Commande pour attribuer/retirer un badge VIP, Abonné ou Modérateur ----
// Le streamer peut tout faire. Les modérateurs peuvent gérer VIP et Abonné,
// mais pas le badge "mod" lui-même (évite qu'un modo puisse en promouvoir/rétrograder d'autres).
router.get('/api/banane-role', async (req, res) => {
  const { user, target, role } = req.query;
  const userLower = user ? user.toLowerCase() : '';

  const isStreamer = userLower === TROLL_TARGET;
  const isMod = !isStreamer && userLower && (await redis.get(`role:${userLower}`)) === 'mod';

  if (!isStreamer && !isMod) {
    return res.send(`⛔ Seuls ${TROLL_TARGET} et les modérateurs peuvent gérer les rôles !`);
  }

  if (!target || !role) {
    return res.send('⚠️ Usage : !banane_role @pseudo <mod|vip|sub|aucun>');
  }

  const cleanTarget = clean(target);
  const roleLower = role.toString().toLowerCase();

  if (roleLower === 'aucun' || roleLower === 'none' || roleLower === 'retirer') {
    if (!isStreamer) {
      const currentRole = await redis.get(`role:${cleanTarget}`);
      if (currentRole === 'mod') {
        return res.send(`⛔ Seul ${TROLL_TARGET} peut retirer le badge Modérateur.`);
      }
    }
    await setManualRole(cleanTarget, null);
    return res.send(`🍌 Rôle retiré pour @${cleanTarget}.`);
  }

  if (!VALID_ROLES.includes(roleLower)) {
    return res.send('⚠️ Rôle invalide. Utilise : mod, vip, sub, ou aucun.');
  }

  if (roleLower === 'mod' && !isStreamer) {
    return res.send(`⛔ Seul ${TROLL_TARGET} peut attribuer le badge Modérateur.`);
  }

  await ensureUser(cleanTarget, target.replace('@', ''));
  await setManualRole(cleanTarget, roleLower);
  const roleLabels = { mod: 'Modérateur 🛡️', vip: 'VIP 💎', sub: 'Abonné ⭐' };
  return res.send(`🍌 @${cleanTarget} porte maintenant le badge ${roleLabels[roleLower]} !`);
});

module.exports = { router };
