// ==========================================================================
// USERS — gestion des profils utilisateurs (création, stats de base,
// watchtime StreamElements). C'est ici qu'il faudra brancher un futur
// système de rôles/admin pour les modos.
// ==========================================================================

const express = require('express');
const { redis } = require('./redis');
const { clean } = require('./utils');
const { SE_JWT_TOKEN, SE_CHANNEL_ID } = require('./config');

const router = express.Router();

// Crée le profil d'un utilisateur s'il n'existe pas encore (idempotent).
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
  if (!SE_JWT_TOKEN || !SE_CHANNEL_ID) return 0;

  try {
    const r = await fetch(
      `https://api.streamelements.com/kappa/v2/loyalty/${SE_CHANNEL_ID}/${encodeURIComponent(username)}`,
      { headers: { Authorization: `Bearer ${SE_JWT_TOKEN}` } }
    );
    if (!r.ok) return 0;
    const data = await r.json();
    if (typeof data.watchtime === 'number') return Math.floor(data.watchtime);
    return 0;
  } catch (e) {
    return 0;
  }
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

module.exports = { router, ensureUser, getWatchtimeMinutes };
