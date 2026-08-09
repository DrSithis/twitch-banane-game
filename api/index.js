const express = require('express');
const { redis } = require('../lib/redis');
const messages = require('../lib/messages');
const { getShopItems } = require('../lib/shop');
const fs = require('fs');
const path = require('path');

const app = express();

// ---- Config (modifiable via variables d'environnement Vercel) ----
const CHANCE_BASE = parseInt(process.env.CHANCE_BASE || '35', 10);           // % de base
const CHANCE_MAX = parseInt(process.env.CHANCE_MAX || '80', 10);             // % plafond
const WATCHTIME_BONUS_PER_HOUR = parseFloat(process.env.WATCHTIME_BONUS_PER_HOUR || '1.5'); // % gagné par heure de présence
const COOLDOWN_SECONDS = parseInt(process.env.COOLDOWN_SECONDS || '20', 10); // anti-spam
const POINTS_PER_HIT = parseInt(process.env.POINTS_PER_HIT || '10', 10);
const POINTS_PER_MISS = parseInt(process.env.POINTS_PER_MISS || '2', 10);    // points de consolation (0 pour désactiver)
const TOP_DEFAULT_LIMIT = parseInt(process.env.TOP_DEFAULT_LIMIT || '3', 10); // top3 par défaut dans le tchat
const TRIGGERFYRE_ENABLED = (process.env.TRIGGERFYRE_ENABLED || 'true').toLowerCase() !== 'false';
const TRIGGERFYRE_PREFIX = process.env.TRIGGERFYRE_PREFIX || 'fyre_'; // le nom de commande TriggerFyre sera !fyre_<id>

function clean(name) {
  return (name || '').toString().trim().toLowerCase().replace(/^@/, '');
}

// Choisit une phrase au hasard dans une liste, et remplace les {placeholders} par leurs valeurs.
function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}
function render(template, vars) {
  return template.replace(/{(\w+)}/g, (match, key) => (vars[key] !== undefined ? vars[key] : match));
}

// ---- Gestion des profils ----
async function ensureUser(usernameLower, displayName) {
  if (!usernameLower) return;
  await redis.sadd('users', usernameLower);
  await redis.hsetnx(`stats:${usernameLower}`, 'throws', 0);
  await redis.hsetnx(`stats:${usernameLower}`, 'hits', 0);
  await redis.hsetnx(`stats:${usernameLower}`, 'points', 0);
  await redis.hsetnx(`profile:${usernameLower}`, 'createdAt', Date.now());
  if (displayName) {
    await redis.set(`displayname:${usernameLower}`, displayName);
  }
}

// Récupère le watchtime (en minutes) via l'API loyalty de StreamElements.
async function getWatchtimeMinutes(username) {
  const jwt = process.env.SE_JWT_TOKEN;
  const channelId = process.env.SE_CHANNEL_ID;
  if (!jwt || !channelId) return 0;

  try {
    const r = await fetch(
      `https://api.streamelements.com/kappa/v2/loyalty/${channelId}/${encodeURIComponent(username)}`,
      { headers: { Authorization: `Bearer ${jwt}` } }
    );
    if (!r.ok) return 0;
    const data = await r.json();
    if (typeof data.watchtime === 'number') return Math.floor(data.watchtime);
    return 0;
  } catch (e) {
    return 0;
  }
}

app.get('/api/debug-watchtime', async (req, res) => {
  const jwt = process.env.SE_JWT_TOKEN;
  const channelId = process.env.SE_CHANNEL_ID;
  const user = clean(req.query.user);
  if (!jwt || !channelId) return res.json({ error: 'SE_JWT_TOKEN ou SE_CHANNEL_ID manquant' });
  try {
    const r = await fetch(
      `https://api.streamelements.com/kappa/v2/loyalty/${channelId}/${encodeURIComponent(user)}`,
      { headers: { Authorization: `Bearer ${jwt}` } }
    );
    const data = await r.json();
    return res.json({ status: r.status, raw: data });
  } catch (e) {
    return res.json({ error: e.message });
  }
});

// ---- !banane @pseudo ----
app.get('/api/banane', async (req, res) => {
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

  const watchMinutes = await getWatchtimeMinutes(from);
  const watchHours = watchMinutes / 60;
  const bonus = Math.min(watchHours * WATCHTIME_BONUS_PER_HOUR, CHANCE_MAX - CHANCE_BASE);
  const chance = Math.min(CHANCE_BASE + bonus, CHANCE_MAX);

  const success = Math.random() * 100 < chance;

  const statsKey = `stats:${from}`;
  const targetedKey = `targeted:${to}`;

  await redis.hincrby(statsKey, 'throws', 1);
  await redis.zincrby(`targets:${from}`, 1, to);
  await redis.hincrby(targetedKey, 'throws', 1);

  if (success) {
    await redis.hincrby(statsKey, 'hits', 1);
    await redis.hincrby(statsKey, 'points', POINTS_PER_HIT);
    await redis.hincrby(targetedKey, 'hits', 1);
    await redis.zincrby('leaderboard', POINTS_PER_HIT, from);
    return res.send(
      render(pick(messages.success), {
        from: fromDisplay,
        to: toDisplay,
        points: POINTS_PER_HIT,
        chance: chance.toFixed(0),
      })
    );
  } else {
    if (POINTS_PER_MISS > 0) {
      await redis.hincrby(statsKey, 'points', POINTS_PER_MISS);
      await redis.zincrby('leaderboard', POINTS_PER_MISS, from);
      return res.send(
        render(pick(messages.fail), {
          from: fromDisplay,
          to: toDisplay,
          points: POINTS_PER_MISS,
          chance: chance.toFixed(0),
        })
      );
    }
    return res.send(
      render(pick(messages.failNoPoints), { from: fromDisplay, to: toDisplay, chance: chance.toFixed(0) })
    );
  }
});

// ---- !banane_stat [ou] !bananecible @pseudo ----
app.get('/api/bananestats', async (req, res) => {
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

// ---- !banane_points (ou !bananepoints @pseudo) ----
app.get('/api/bananepoints', async (req, res) => {
  const user = clean(req.query.user);
  const userDisplay = req.query.user || user;
  if (!user) return res.send(messages.usagePoints);

  const stats = (await redis.hgetall(`stats:${user}`)) || {};
  const points = parseInt(stats.points || 0, 10);

  return res.send(render(messages.points, { user: userDisplay, points, plural: points > 1 ? 's' : '' }));
});

// ---- !banane_top (top 3 par défaut dans le tchat) ----
app.get('/api/topbanane', async (req, res) => {
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

// ==========================================================================
// BOUTIQUE (points dépensables contre des défis, définis dans le Google Sheet)
// ==========================================================================

// ---- !banane_buy <id> [@cible optionnelle] ----
app.get('/api/buy', async (req, res) => {
  const userLower = clean(req.query.user);
  const userDisplay = req.query.user || userLower;
  const itemId = (req.query.id || '').toString().trim().toLowerCase();
  const targetDisplay = req.query.target || '';

  if (!userLower || !itemId) {
    return res.send('Utilisation : !banane_buy <id_recompense> [@cible]');
  }

  let items;
  try {
    items = await getShopItems(redis);
  } catch (e) {
    return res.send('🍌 La boutique est momentanément indisponible, réessaie dans une minute.');
  }

  const item = items.find((it) => it.id.toLowerCase() === itemId && it.actif);
  if (!item) {
    return res.send(`🍌 Récompense "${req.query.id}" introuvable ou indisponible. Liste complète sur /boutique.`);
  }

  await ensureUser(userLower, userDisplay);

  const stats = (await redis.hgetall(`stats:${userLower}`)) || {};
  const points = parseInt(stats.points || 0, 10);

  if (points < item.prix) {
    return res.send(
      `🍌 ${userDisplay}, il te manque ${item.prix - points} Points Banane pour "${item.nom}" (${item.prix} pts, tu en as ${points}).`
    );
  }

  // Cooldown propre à CETTE récompense (évite le spam du même effet en boucle)
  const itemCooldownKey = `shopcooldown:${item.id}`;
  if (item.cooldownMinutes > 0) {
    const onCooldown = await redis.get(itemCooldownKey);
    if (onCooldown) {
      const ttl = await redis.ttl(itemCooldownKey);
      const ttlDisplay = ttl > 0 ? ttl : item.cooldownMinutes * 60;
      return res.send(`🍌 "${item.nom}" vient d'être utilisé, réessaie dans ${Math.ceil(ttlDisplay / 60)} min.`);
    }
  }

  // Débit des points (portefeuille + classement, cohérents entre eux)
  await redis.hincrby(`stats:${userLower}`, 'points', -item.prix);
  await redis.zincrby('leaderboard', -item.prix, userLower);

  if (item.cooldownMinutes > 0) {
    await redis.set(itemCooldownKey, '1', { ex: item.cooldownMinutes * 60 });
  }

// ---- !banane_shop : pointe vers la page /boutique ----
app.get('/api/shop', async (req, res) => {
  let items;
  try {
    items = await getShopItems(redis);
  } catch (e) {
    return res.send('🍌 La boutique est momentanément indisponible.');
  }
  const activeCount = items.filter((i) => i.actif).length;
  const host = `${req.protocol}://${req.get('host')}`;
  return res.send(
    `🍌 Boutique Banane : ${activeCount} défis disponibles. Utilise !banane_buy <id> pour en débloquer un. Liste complète : ${host}/boutique`
  );
});

// ---- Page HTML stylée de la boutique, template modifiable dans public/boutique.html ----
app.get('/boutique', async (req, res) => {
  let items = [];
  let errorMsg = null;
  try {
    items = (await getShopItems(redis)).filter((i) => i.actif);
  } catch (e) {
    errorMsg = e.message;
  }

  const byCategory = {};
  for (const item of items) {
    const cat = item.categorie || 'Autre';
    byCategory[cat] = byCategory[cat] || [];
    byCategory[cat].push(item);
  }

  const contentHtml = errorMsg
    ? `<div class="empty">Erreur de chargement de la boutique : ${escapeHtml(errorMsg)}</div>`
    : items.length
    ? Object.entries(byCategory)
        .map(([cat, catItems]) => {
          const cardsHtml = catItems
            .sort((a, b) => a.prix - b.prix)
            .map(
              (it) => `
              <div class="reward-card">
                <div class="reward-header">
                  <span class="reward-name">${escapeHtml(it.nom)}</span>
                  <span class="reward-price">${it.prix} pts</span>
                </div>
                <p class="reward-desc">${escapeHtml(it.description)}</p>
                <div class="reward-footer">
                  <code class="reward-id">${escapeHtml(it.id)}</code>
                  ${it.cooldownMinutes > 0 ? `<span class="reward-cooldown">⏱ ${it.cooldownMinutes} min</span>` : ''}
                </div>
              </div>`
            )
            .join('');
          return `
          <section class="category-block">
            <h2>${escapeHtml(cat)}</h2>
            <div class="rewards-grid">${cardsHtml}</div>
          </section>`;
        })
        .join('')
    : `<div class="empty">Aucune récompense disponible pour le moment.</div>`;

  try {
    const templatePath = path.join(process.cwd(), 'public', 'boutique.html');
    let html = fs.readFileSync(templatePath, 'utf8');
    html = html.replace('{{COUNT}}', items.length).replace('{{CONTENT}}', contentHtml);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    console.error('Erreur lecture template boutique.html:', err);
    return res.status(500).send('Erreur lors du chargement de la boutique.');
  }
});

// ---- Données brutes du classement (réutilisées par /api/leaderboard et /classement) ----
async function getLeaderboardData(limit) {
  const members = await redis.zrange('leaderboard', 0, limit - 1, { rev: true });
  if (!members || !members.length) return [];

  const rows = [];
  for (const m of members) {
    const [score, stats, displayName] = await Promise.all([
      redis.zscore('leaderboard', m),
      redis.hgetall(`stats:${m}`),
      redis.get(`displayname:${m}`),
    ]);
    const throwsCount = parseInt((stats && stats.throws) || 0, 10);
    const hits = parseInt((stats && stats.hits) || 0, 10);
    rows.push({
      username: displayName || m,
      points: parseInt(score || 0, 10),
      throws: throwsCount,
      hits,
      accuracy: throwsCount ? Math.round((hits / throwsCount) * 100) : 0,
    });
  }
  return rows;
}

app.get('/api/leaderboard', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const rows = await getLeaderboardData(limit);
  return res.json(rows);
});

app.get('/classement', async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 500;
  const refresh = Math.max(parseInt(req.query.refresh, 10) || 30, 5);
  const rows = await getLeaderboardData(limit);

  // 1. Génération des lignes du tableau
  const rowsHtml = rows
    .map((r, i) => {
      const rankIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
      return `
        <tr>
          <td class="rank">${rankIcon}</td>
          <td class="name">${escapeHtml(r.username)}</td>
          <td class="points">${r.points} pts</td>
          <td>${r.throws}</td>
          <td>${r.hits}</td>
          <td>${r.accuracy}%</td>
        </tr>`;
    })
    .join('');

  const tableContent = rows.length
    ? `<table>
        <thead>
          <tr><th>#</th><th>Joueur</th><th>Points</th><th>Lancers</th><th>Réussites</th><th>Précision</th></tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>`
    : `<div class="empty">Aucun lancer de banane enregistré pour le moment.</div>`;

  // 2. Lecture du fichier HTML externe
  try {
    const templatePath = path.join(process.cwd(), 'public', 'classement.html');
    let html = fs.readFileSync(templatePath, 'utf8');

    // 3. Remplacement des variables dans le HTML
    html = html
      .replace('{{COUNT}}', rows.length)
      .replace('{{CONTENT}}', tableContent);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    console.error('Erreur lecture template HTML:', err);
    return res.status(500).send('Erreur lors du chargement de la page.');
  }
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

app.get('/api', (req, res) => res.send('Twitch Banane Game API — OK'));
app.get('/', (req, res) => res.send('Twitch Banane Game API — OK. Voir /classement pour le classement en ligne.'));

module.exports = app;
