// ==========================================================================
// CONFIG — toutes les variables paramétrables du jeu.
// Modifiable via les variables d'environnement Vercel, avec valeurs par
// défaut ici. C'est le point d'entrée à faire évoluer plus tard pour un
// système d'admin (panel modo) : il suffira de faire lire/écrire ces valeurs
// depuis Redis au lieu de process.env, sans toucher au reste du code.
// ==========================================================================

// ---- Probabilités de base ----
const CHANCE_BASE = parseInt(process.env.CHANCE_BASE || '35', 10);           // % de base
const CHANCE_MAX = parseInt(process.env.CHANCE_MAX || '80', 10);             // % plafond
const WATCHTIME_BONUS_PER_HOUR = parseFloat(process.env.WATCHTIME_BONUS_PER_HOUR || '1.5'); // % gagné par heure de présence
const COOLDOWN_SECONDS = parseInt(process.env.COOLDOWN_SECONDS || '45', 10); // anti-spam
const TOP_DEFAULT_LIMIT = parseInt(process.env.TOP_DEFAULT_LIMIT || '3', 10); // top3 par défaut dans le tchat

// ---- TriggerFyre (déclenchement d'effets visuels/sonores) ----
const TRIGGERFYRE_ENABLED = (process.env.TRIGGERFYRE_ENABLED || 'true').toLowerCase() !== 'false';
const TRIGGERFYRE_PREFIX = process.env.TRIGGERFYRE_PREFIX || 'fyre_'; // le nom de commande TriggerFyre sera !fyre_<id>

// ---- Logique de tir : coup critique / classique / pénalité / neutre / consolation ----
const CRIT_CHANCE = parseFloat(process.env.CRIT_CHANCE || '0.04');           // 4% de coup critique, sur CHAQUE tir
const POINTS_CRITICAL = parseInt(process.env.POINTS_CRITICAL || '5', 10);    // pts si coup critique
const POINTS_CLASSIC = parseInt(process.env.POINTS_CLASSIC || '3', 10);      // pts si réussite classique
const MISS_PENALTY_CHANCE = parseFloat(process.env.MISS_PENALTY_CHANCE || '0.30');           // 30% des ratés
const MISS_CONSOLATION_CHANCE = parseFloat(process.env.MISS_CONSOLATION_CHANCE || '0.20');   // 20% des ratés (le reste, 50%, est neutre)
const POINTS_MISS_PENALTY = parseInt(process.env.POINTS_MISS_PENALTY || '-1', 10);
const POINTS_MISS_CONSOLATION = parseInt(process.env.POINTS_MISS_CONSOLATION || '1', 10);
const TROLL_TARGET = (process.env.TROLL_TARGET || 'drsithis').toLowerCase(); // cible dont le tir est forcé en échec (sauf critique)

// ---- StreamElements (watchtime) ----
const SE_JWT_TOKEN = process.env.SE_JWT_TOKEN;
const SE_CHANNEL_ID = process.env.SE_CHANNEL_ID;

module.exports = {
  CHANCE_BASE,
  CHANCE_MAX,
  WATCHTIME_BONUS_PER_HOUR,
  COOLDOWN_SECONDS,
  TOP_DEFAULT_LIMIT,
  TRIGGERFYRE_ENABLED,
  TRIGGERFYRE_PREFIX,
  CRIT_CHANCE,
  POINTS_CRITICAL,
  POINTS_CLASSIC,
  MISS_PENALTY_CHANCE,
  MISS_CONSOLATION_CHANCE,
  POINTS_MISS_PENALTY,
  POINTS_MISS_CONSOLATION,
  TROLL_TARGET,
  SE_JWT_TOKEN,
  SE_CHANNEL_ID,
};
