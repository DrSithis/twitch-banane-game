// ==========================================================================
// LEADERBOARD & ALERTS — classement des joueurs (/api/leaderboard, /classement)
// et file d'attente d'alertes consommée par l'overlay OBS (/alerts).
// ==========================================================================

const express = require('express');
const { redis } = require('./redis');
const { escapeHtml } = require('./utils');

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
  // NOTE : `refresh` est lu ici mais n'est pas utilisé côté template pour l'instant
  // (laissé tel quel pour rester fidèle au comportement d'origine).
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
    const path = require('path');
    const fs = require('fs');
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

// ---- File d'attente d'alertes (consommée par la page /alerts) ----
router.get('/api/alerts/pop', async (req, res) => {
  const raw = await redis.lpop('alerts:queue');
  if (!raw) return res.json(null);
  try {
    return res.json(JSON.parse(raw));
  } catch (e) {
    return res.json(null);
  }
});

// ---- Page d'overlay à ajouter en Browser Source (OBS / Streamlabs) ----
router.get('/alerts', (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Alertes Banane</title>
<style>
  html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; font-family: 'Segoe UI', Arial, sans-serif; }
  #alert-card {
    position: fixed; top: 40px; left: 50%;
    transform: translateX(-50%) translateY(-160%);
    background: linear-gradient(135deg, #f0c419, #f7dc6f);
    color: #1a1a1a; padding: 20px 32px; border-radius: 16px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.4);
    min-width: 380px; max-width: 560px; text-align: center;
    transition: transform 0.5s cubic-bezier(.17,.67,.35,1.34);
  }
  #alert-card.show { transform: translateX(-50%) translateY(0); }
  #alert-card .emoji { font-size: 2.2rem; }
  #alert-card .title { font-size: 1.3rem; font-weight: 800; margin: 6px 0 2px; }
  #alert-card .desc { font-size: 0.95rem; opacity: 0.85; margin-bottom: 8px; }
  #alert-card .meta { font-size: 0.85rem; font-weight: 600; }
</style>
</head>
<body>
  <div id="alert-card">
    <div class="emoji">🍌</div>
    <div class="title" id="alert-title"></div>
    <div class="desc" id="alert-desc"></div>
    <div class="meta" id="alert-meta"></div>
  </div>
  <script>
    const card = document.getElementById('alert-card');
    const titleEl = document.getElementById('alert-title');
    const descEl = document.getElementById('alert-desc');
    const metaEl = document.getElementById('alert-meta');

    async function poll() {
      try {
        const res = await fetch('/api/alerts/pop');
        const data = await res.json();
        if (data) {
          titleEl.textContent = data.nom;
          descEl.textContent = data.description;
          metaEl.textContent = data.target
            ? ('Acheté par ' + data.buyer + ' — visant ' + data.target + ' (' + data.prix + ' pts)')
            : ('Acheté par ' + data.buyer + ' (' + data.prix + ' pts)');
          card.classList.add('show');
          setTimeout(function () { card.classList.remove('show'); }, 6000);
          setTimeout(poll, 7000);
          return;
        }
      } catch (e) {}
      setTimeout(poll, 3000);
    }
    poll();
  </script>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(html);
});

module.exports = { router, getLeaderboardData };
