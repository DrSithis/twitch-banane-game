// ==========================================================================
// USERS — gestion des profils utilisateurs (création, watchtime StreamElements).
// Pure logique, aucune route ici (voir routes/banane.js pour /api/debug-watchtime).
// C'est ici qu'il faudra brancher un futur système de rôles/admin pour les modos.
// ==========================================================================

const { redis } = require('./redis');
const { SE_JWT_TOKEN, SE_CHANNEL_ID } = require('./config');

const AVATAR_CACHE_SECONDS = 1800; // 30 min, aligné sur le cache de decapi.me côté serveur

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

// Récupère l'URL de l'avatar Twitch via decapi.me (pas besoin de clé API Twitch).
// IMPORTANT : cet endpoint renvoie du TEXTE contenant l'URL de l'image, pas l'image
// elle-même — on ne peut donc pas le mettre directement dans un <img src="...">.
// Mis en cache 30 min dans Redis pour éviter de spammer decapi à chaque chargement de profil.
async function getTwitchAvatar(usernameLower) {
  if (!usernameLower) return null;

  const cacheKey = `avatar:${usernameLower}`;
  const cached = await redis.get(cacheKey);
  if (cached) return cached === 'null' ? null : cached;

  try {
    const r = await fetch(`https://decapi.me/twitch/avatar/${encodeURIComponent(usernameLower)}`);
    const text = (await r.text()).trim();
    // decapi renvoie un message d'erreur en texte (pas une URL) si le pseudo est introuvable.
    const isValidUrl = /^https?:\/\//.test(text);
    const result = isValidUrl ? text : null;
    await redis.set(cacheKey, result || 'null', { ex: AVATAR_CACHE_SECONDS });
    return result;
  } catch (e) {
    return null;
  }
}

module.exports = { ensureUser, getWatchtimeMinutes, getTwitchAvatar };
