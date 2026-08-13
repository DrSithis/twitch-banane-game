// ==========================================================================
// ROUTES LEADERBOARD — /api/leaderboard (JSON) et /classement (page HTML).
// ==========================================================================

const express = require('express');
const { redis } = require('../lib/redis');
const { escapeHtml } = require('../lib/utils');
const { renderTemplate } = require('../lib/html');

const router = express.Router();

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

router.get('/api/leaderboard', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const rows = await getLeaderboardData(limit);
  return res.json(rows);
});

router.get('/classement', async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 500;
  const rows = await getLeaderboardData(limit);

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

  try {
    const html = renderTemplate('classement.html', { COUNT: rows.length, CONTENT: tableContent });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    console.error('Erreur lecture template HTML:', err);
    return res.status(500).send('Erreur lors du chargement de la page.');
  }
});

module.exports = { router, getLeaderboardData };
