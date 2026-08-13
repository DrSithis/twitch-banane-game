// ==========================================================================
// ROUTES ALERTS — file d'attente d'alertes et overlay OBS (/alerts).
// Séparé de leaderboard.js : ça n'a rien à voir avec le classement,
// c'est juste que ça vivait au même endroit avant.
// ==========================================================================

const express = require('express');
const { redis } = require('../lib/redis');

const router = express.Router();

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

module.exports = { router };
