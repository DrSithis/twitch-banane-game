// ==========================================================================
// Tous les textes affichés dans le tchat sont centralisés ici.
// Tu peux ajouter, retirer ou modifier des variantes librement.
// À chaque lancer, une phrase est choisie AU HASARD parmi la liste correspondante.
//
// Placeholders disponibles (remplacés automatiquement) :
//   {from}    -> pseudo du lanceur
//   {to}      -> pseudo de la cible
//   {points}  -> points gagnés sur ce lancer
//   {chance}  -> % de chance qu'avait le lanceur
//   {seconds} -> secondes de cooldown restantes
//   {user}    -> pseudo (commandes stats/points)
//   {target}  -> pseudo ciblé (commandes stats)
//   {throws}, {hits}, {rate} -> statistiques
// ==========================================================================

module.exports = {
  // ---- !banane : lancer réussi (avec points > 0) ----
  success: [
    '🍌 SPLASH ! {from} a écrasé une banane sur {to} ! (+{points} Points Banane, {chance}% de chance)',
    '🍌 Bien joué {from}, ta banane a atterri en pleine tronche de {to} ! (+{points} Points Banane)',
    "🍌 {to} n'a rien vu venir, {from} vise juste ! (+{points} Points Banane, {chance}% de chance)",
    '🍌 Précision chirurgicale de {from} sur {to} ! (+{points} Points Banane)',
  ],

  // ---- !banane : lancer raté, AVEC points de consolation (POINTS_PER_MISS > 0) ----
  fail: [
    '🍌 Bien tenté {from} d\'avoir visé {to}, mais c\'est raté ! (+{points} Points Banane quand même, {chance}% de chance)',
    "🍌 Raté ! La banane de {from} a fini au sol, {to} l'a esquivée. (+{points} Points Banane pour l'effort)",
    '🍌 {from} a lancé... et a raté {to} de peu. (+{points} Points Banane, prochaine fois !)',
  ],

  // ---- !banane : lancer raté, SANS points de consolation (POINTS_PER_MISS = 0) ----
  failNoPoints: [
    "🍌 Bien tenté {from} d'avoir visé {to}, mais c'est raté ! ({chance}% de chance)",
    "🍌 Raté ! La banane de {from} a fini au sol, {to} l'a esquivée. ({chance}% de chance)",
    '🍌 {from} a lancé... et a raté {to} de peu. Prochaine fois !',
  ],

  // ---- !banane sur soi-même ----
  selfThrow: [
    '🍌 {from} tente de se lancer une banane à lui-même... et trébuche dessus.',
  ],

  // ---- !banane en cooldown ----
  cooldown: [
    '🍌 {from}, laisse refroidir ta banane encore {seconds}s avant de relancer.',
  ],

  usageBanane: 'Utilisation : !banane @pseudo',

  // ---- !bananestats (soi-même) ----
  statsSelf: '🍌 {user} : {throws} lancers, {hits} réussites ({rate}% de précision), {points} Points Banane. {favPhrase}',
  favTargetPhrase: 'Cible favorite : {target}.',
  favTargetEmpty: 'Aucune cible favorite pour le moment.',

  // ---- !bananecible @pseudo ----
  statsTarget: '🍌 {target} a été visé {throws} fois et touché {hits} fois ({rate}% de réussite adverse).',

  usageStats: 'Utilisation : !bananestats ou !bananecible @pseudo',

  // ---- !bananepoints ----
  points: '🍌 {user} a {points} Point{plural} Banane.',
  usagePoints: 'Utilisation : !bananepoints ou !bananepoints @pseudo',

  // ---- !topbanane ----
  topPrefix: '🏆 Top Lanceurs de Bananes : ',
  topEntry: '{medal} {user} ({points} pts)',
  topEmpty: 'Aucun lancer de banane enregistré pour le moment 🍌',
};
