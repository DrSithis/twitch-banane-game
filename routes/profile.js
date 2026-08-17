// ==========================================================================
// ROUTES PROFILE — page /profil/:username, son API JSON, et !banane_profil.
// ==========================================================================

const express = require('express');
const { redis } = require('../lib/redis');
const messages = require('../lib/messages');
const { clean, render } = require('../lib/utils');
const { getInventory } = require('../lib/inventory');
const { getShopItems } = require('../lib/shop');
const { getTwitchAvatar } = require('../lib/users');
const { getPlayerBadge } = require('../lib/roles');
const { renderPage } = require('../lib/html');

const router = express.Router();

// ==========================================================================
// Script client de la page /profil/:username (ex-inline dans public/profil.html,
// sorti ici pour garder toute la logique du profil au même endroit). Consomme
// /api/profile/:username ci-dessous et remplit le DOM de profil.html.
// ==========================================================================
const PROFILE_SCRIPT = `(function () {
  // Le pseudo est le dernier segment de l'URL : /profil/DrSithis -> "DrSithis"
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const username = decodeURIComponent(pathParts[pathParts.length - 1] || '');

  if (!username) {
    document.getElementById('player-name').textContent = 'Aucun joueur spécifié';
    return;
  }

  document.title = 'Profil de ' + username + ' - DrSithis Twitch Banane Game';

  // Avatar : servi par notre propre API (/api/profile/...), qui va chercher l'URL réelle
  // côté serveur via decapi.me — decapi renvoie du texte, pas une image, donc on ne peut
  // pas l'utiliser directement en src="". On garde l'avatar par défaut en attendant la réponse.
  const avatarImg = document.getElementById('player-avatar');
  const defaultAvatar = 'https://static-cdn.jtvnw.net/user-default-pictures-uv/998f01ae-def8-11e9-b95c-784f43822e80-profile_image-70x70.png';
  avatarImg.src = defaultAvatar;
  avatarImg.onerror = function () {
    avatarImg.onerror = null;
    avatarImg.src = defaultAvatar;
  };

  fetch('/api/profile/' + encodeURIComponent(username))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      document.getElementById('player-name').textContent = data.displayName;
      document.getElementById('player-rank').textContent = data.rank
        ? '🏆 Rang #' + data.rank
        : '🏆 Non classé';
      document.getElementById('player-points').textContent = '💰 ' + data.points + ' pts';

      if (data.avatarUrl) {
        avatarImg.src = data.avatarUrl;
      }

      document.getElementById('stat-shots').textContent = data.throws;
      document.getElementById('stat-misses').textContent = data.misses;
      document.getElementById('stat-accuracy').textContent = data.accuracy + '%';
      document.getElementById('stat-favorite-target').textContent = data.favoriteTarget || 'Aucune';

      const badgeConfig = {
        broadcaster: { type: 'img', src: '/badges/broadcaster.png', label: 'Le Docteur' },
        mod: {
          type: 'svg',
          label: 'Modérateur',
          svg: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2 L20 5.5 V11 C20 16 16.5 20.2 12 22 C7.5 20.2 4 16 4 11 V5.5 Z" fill="#00ad03" stroke="#0a3d02" stroke-width="1"/><path d="M9 12 L11 14.5 L15.5 9" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
        },
        vip: {
          type: 'svg',
          label: 'VIP',
          svg: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2 L17 8 L12 22 L7 8 Z" fill="#e005b9" stroke="#7a0261" stroke-width="1"/><path d="M4 8 H20 L17 8 H7 Z" fill="#ff5fd8"/><path d="M4 8 L7 8 L12 2 L4 8 Z" fill="#ff85e0"/><path d="M20 8 L17 8 L12 2 L20 8 Z" fill="#ff85e0"/></svg>',
        },
        sub: { type: 'img', src: '/badges/sub.png', label: 'Abonné' },
        supermod: { type: 'img', src: '/badges/supermod.png', label: 'Modaque' },
      };
      const badgeEl = document.getElementById('player-role-badge');
      const cfg = data.badge ? badgeConfig[data.badge] : null;
      badgeEl.className = 'role-badge' + (data.badge ? ' role-badge--' + data.badge : '');
      if (cfg && cfg.type === 'img') {
        badgeEl.innerHTML =
          '<img src="' + cfg.src + '" alt="' + cfg.label + '" class="role-badge-icon"><span>' + cfg.label + '</span>';
      } else if (cfg && cfg.type === 'svg') {
        badgeEl.innerHTML = cfg.svg.replace('<svg ', '<svg class="role-badge-icon" ') + '<span>' + cfg.label + '</span>';
      } else {
        badgeEl.innerHTML = '';
      }

      const invEl = document.getElementById('inventory-list');
      if (!data.inventory.length) {
        invEl.innerHTML = '<p class="empty-inventory">Le sac à dos est vide.</p>';
      } else {
        invEl.innerHTML = data.inventory
          .map(function (it) {
            return '<div class="inventory-item"><span>' + it.name +
              '</span><span class="item-count">x' + it.qty + '</span></div>';
          })
          .join('');
      }
    })
    .catch(function () {
      document.getElementById('player-name').textContent = 'Erreur de chargement du profil';
    });
})();
`;

// ---- Sert le script client ci-dessus en tant que fichier JS séparé ----
router.get('/profil.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  return res.send(PROFILE_SCRIPT);
});

// ---- Données JSON consommées par le script de public/profil.html ----
router.get('/api/profile/:username', async (req, res) => {
  const usernameLower = clean(req.params.username);
  if (!usernameLower) {
    return res.status(400).json({ error: 'Pseudo manquant' });
  }

  const [stats, displayName, rankIndex, topTargets, avatarUrl, badge] = await Promise.all([
    redis.hgetall(`stats:${usernameLower}`),
    redis.get(`displayname:${usernameLower}`),
    redis.zrevrank('leaderboard', usernameLower),
    redis.zrange(`targets:${usernameLower}`, 0, 0, { rev: true }),
    getTwitchAvatar(usernameLower),
    getPlayerBadge(usernameLower),
  ]);

  const throwsCount = parseInt((stats && stats.throws) || 0, 10);
  const hits = parseInt((stats && stats.hits) || 0, 10);
  const crits = parseInt((stats && stats.crits) || 0, 10);
  const points = parseInt((stats && stats.points) || 0, 10);
  const misses = Math.max(throwsCount - hits, 0);
  const critRate = throwsCount ? Math.round((crits / throwsCount) * 100) : 0;
  const accuracy = throwsCount ? Math.round((hits / throwsCount) * 100) : 0;

  // Cible favorite : même logique que !bananestats (routes/banane.js).
  const favTargetLower = topTargets && topTargets.length ? topTargets[0] : null;
  const favoriteTarget = favTargetLower ? (await redis.get(`displayname:${favTargetLower}`)) || favTargetLower : null;

  let items = [];
  try {
    items = await getShopItems(redis);
  } catch (e) {
    items = []; // si la boutique est indisponible, on affiche quand même les ID bruts
  }

  const rawInventory = await getInventory(usernameLower);
  const inventory = Object.entries(rawInventory)
    .filter(([, qty]) => parseInt(qty, 10) > 0)
    .map(([itemId, qty]) => {
      const item = items.find((it) => it.id.toLowerCase() === itemId.toLowerCase());
      return { id: itemId, name: item ? item.nom : itemId, qty: parseInt(qty, 10) };
    });

  return res.json({
    username: usernameLower,
    displayName: displayName || req.params.username,
    rank: rankIndex === null || rankIndex === undefined ? null : rankIndex + 1,
    points,
    throws: throwsCount,
    hits,
    crits,
    misses,
    critRate,
    accuracy,
    favoriteTarget,
    avatarUrl,
    badge,
    inventory,
  });
});

// ---- !banane_profil : renvoie le lien vers son propre profil ----
router.get('/api/profile-link', async (req, res) => {
  const userLower = clean(req.query.user);
  const userDisplay = req.query.user || userLower;
  if (!userLower) return res.send('Utilisation : !banane_profil');

  const host = `${req.protocol}://${req.get('host')}`;
  const url = `${host}/profil/${encodeURIComponent(userDisplay)}`;
  return res.send(render(messages.profileLink, { user: userDisplay, url }));
});

// ---- Page profil : toujours le même fichier statique, le pseudo est lu côté client ----
router.get('/profil/:username', (req, res) => {
  try {
    const html = renderPage('profil.html', { TITLE: '', SUBTITLE: '' });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    console.error('Erreur lecture template profil.html:', err);
    return res.status(500).send('Erreur lors du chargement du profil.');
  }
});

module.exports = { router };
