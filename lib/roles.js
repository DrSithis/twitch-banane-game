// ==========================================================================
// ROLES — badge de rôle affiché sur le profil : Diffuseur / Modérateur / VIP
// / Abonné. Tous attribués manuellement par le streamer avec !banane_role
// (broadcaster excepté, déduit automatiquement). Aucune API gratuite fiable
// ne permet de vérifier ces rôles automatiquement — DecAPI, qui proposait un
// check abonné via subage, a fini par couper cet endpoint (Twitch API).
// ==========================================================================

const { redis } = require('./redis');
const { TROLL_TARGET, SPECIAL_BADGES } = require('./config');

const VALID_ROLES = ['mod', 'vip', 'sub']; // rôles assignables manuellement via !banane_role

// Attribue (ou retire, avec role = null) un rôle manuel à un joueur.
async function setManualRole(usernameLower, role) {
  if (role === null) {
    await redis.del(`role:${usernameLower}`);
    return;
  }
  await redis.set(`role:${usernameLower}`, role);
}

// Détermine le badge à afficher pour un joueur : Diffuseur > rôle manuel > aucun.
async function getPlayerBadge(usernameLower) {
  if (!usernameLower) return null;
  if (usernameLower === TROLL_TARGET) return 'broadcaster';

  const manualRole = await redis.get(`role:${usernameLower}`);
  if (VALID_ROLES.includes(manualRole)) {
    // Badge spécial propre à cette personne (visuel uniquement, les permissions
    // restent celles du rôle réel stocké, ex: "mod" pour Raven_spectral).
    if (manualRole === 'mod' && SPECIAL_BADGES[usernameLower]) {
      return SPECIAL_BADGES[usernameLower];
    }
    return manualRole;
  }

  return null;
}

module.exports = { setManualRole, getPlayerBadge, VALID_ROLES };
