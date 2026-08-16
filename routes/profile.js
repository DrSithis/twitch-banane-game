// ==========================================================================
// ROUTES PROFILE — page /profil/:username, son API JSON, et !banane_profil.
// ==========================================================================

const express = require('express');
const path = require('path');
const { redis } = require('../lib/redis');
const messages = require('../lib/messages');
const { clean, render } = require('../lib/utils');
const { getInventory } = require('../lib/inventory');
const { getShopItems } = require('../lib/shop');

const router = express.Router();

// ---- Données JSON consommées par le script de public/profil.html ----
router.get('/api/profile/:username', async (req, res) => {
  const usernameLower = clean(req.params.username);
  if (!usernameLower) {
    return res.status(400).json({ error: 'Pseudo manquant' });
  }

  const [stats, displayName, rankIndex] = await Promise.all([
    redis.hgetall(`stats:${usernameLower}`),
    redis.get(`displayname:${usernameLower}`),
    redis.zrevrank('leaderboard', usernameLower),
  ]);

  const throwsCount = parseInt((stats && stats.throws) || 0, 10);
  const hits = parseInt((stats && stats.hits) || 0, 10);
  const crits = parseInt((stats && stats.crits) || 0, 10);
  const points = parseInt((stats && stats.points) || 0, 10);
  const misses = Math.max(throwsCount - hits, 0);
  const critRate = throwsCount ? Math.round((crits / throwsCount) * 100) : 0;

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
  res.sendFile(path.join(process.cwd(), 'public', 'profil.html'));
});

module.exports = { router };
