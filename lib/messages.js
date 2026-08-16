// ==========================================================================
// Tous les textes affichés dans le tchat sont centralisés ici.
// Tu peux ajouter, retirer ou modifier des variantes librement.
// À chaque lancer, une phrase est choisie AU HASARD parmi la liste correspondante.
//
// Placeholders disponibles (remplacés automatiquement) :
//   {from}    -> pseudo du lanceur
//   {to}      -> pseudo de la cible
//   {points}  -> points gagnés/perdus sur ce lancer (peut être négatif, 0, ou positif)
//   {seconds} -> secondes de cooldown restantes
//   {user}    -> pseudo (commandes stats/points/inventaire)
//   {target}  -> pseudo ciblé (commandes stats)
//   {throws}, {hits}, {rate} -> statistiques
//   {items}     -> liste des objets d'un inventaire, déjà formatée
//   {itemName}  -> nom lisible d'un objet de la boutique
//   {itemId}    -> identifiant brut d'un objet (tel que tapé par le viewer)
//   {minutes}   -> minutes de cooldown restantes sur un objet, ou durée du stun
//   {details}   -> résultats formatés d'une Banane Triple (une ligne par cible)
//   {total}     -> total de points d'une Banane Triple (signé : +8, -1, 0...)
// ==========================================================================

module.exports = {
  // ---- !banane : COUP CRITIQUE (4% de chance sur chaque tir, +5 pts par défaut) ----
  successCritical: [
    '🍌💥 COUP CRITIQUE ! {from} explose {to} avec une précision surhumaine ! (+{points} Points Banane)',
    '🍌💥 BOOM ! {from} place un tir parfait sur {to}, coup critique ! (+{points} Points Banane)',
    '🍌💥 {from} sort le grand jeu et écrase {to} en plein cœur, critique absolu ! (+{points} Points Banane)',
  ],

  // ---- !banane : réussite classique (tir normal réussi, +3 pts par défaut) ----
  successClassic: [
    '🍌 SPLASH ! {from} a écrasé une banane sur {to} ! (+{points} Points Banane)',
    '🍌 Bien joué {from}, ta banane a atterri en pleine tronche de {to} ! (+{points} Points Banane)',
    "🍌 {to} n'a rien vu venir, {from} vise juste ! (+{points} Points Banane)",
  ],

  // ---- !banane : tir raté, tirage "pénalité" (-1 pt par défaut, jamais sous 0) ----
  // NOTE : si le solde du lanceur est déjà à 0, {points} affichera 0 au lieu de -1 (plancher appliqué).
  missPenalty: [
    "🍌 Aïe, {from} glisse en visant {to} et perd l'équilibre... ({points} pt)",
    '🍌 Raté maladroit de {from} sur {to}, la banane part dans le décor. ({points} pt)',
    '🍌 {from} rate complètement {to}... et se fait une entorse en plus. ({points} pt)',
  ],

  // ---- !banane : tir raté, tirage "neutre" (0 pt) ----
  missNeutral: [
    '🍌 Raté ! La banane de {from} a fini au sol, {to} l\'a esquivée.',
    "🍌 Bien tenté {from} d'avoir visé {to}, mais c'est raté !",
    '🍌 {from} a lancé... et a raté {to} de peu. Prochaine fois !',
  ],

  // ---- !banane : tir raté, tirage "consolation" (+1 pt par défaut) ----
  missConsolation: [
    '🍌 Raté, mais {from} récupère quand même sa banane intacte. (+{points} Points Banane pour l\'effort)',
    "🍌 Ça n'a pas touché {to}, mais {from} gagne un petit quelque chose pour la tentative. (+{points} Points Banane)",
    '🍌 Presque ! {from} manque {to} de peu. (+{points} Points Banane de consolation)',
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

  // ---- !banane_inventaire ----
  usageInventaire: 'Utilisation : !banane_inventaire',
  inventaireEmpty: '🎒 {user}, ton inventaire est vide. Achète des objets stockables sur /boutique !',
  inventaireList: '🎒 Inventaire de {user} : {items}',

  // ---- !banane_use <id> [@cible] ----
  usageUse: 'Utilisation : !banane_use <id_objet> [@cible]',
  shopUnavailable: '🍌 La boutique est momentanément indisponible, réessaie dans une minute.',
  useNotUsable: '🎒 "{itemId}" n\'est pas un objet utilisable depuis l\'inventaire.',
  useNotOwned: '🎒 {user}, tu n\'as pas "{itemName}" dans ton inventaire. Achète-le sur /boutique !',
  useOnCooldown: '🍌 "{itemName}" vient d\'être utilisé, réessaie dans {minutes} min.',
  useSuccess: '🎒 {user} active "{itemName}" depuis son inventaire !',

  // ---- !banane_use ban_stop <cible> (cas spécial : bloque une cible) ----
  useStopUsage: '🎒 Utilisation : !banane_use ban_stop <cible> (une cible est obligatoire pour cet objet).',
  useStopSelf: '🎒 {user}, tu ne peux pas te bloquer toi-même avec une Banane Stop !',
  useStopSuccess: '🎒 {user} bloque {target} avec une Banane Stop pendant {minutes} min ! 🚫',

  // ---- !banane : joueur actuellement bloqué par une Banane Stop ----
  stunned: '🍌 {from}, tu as glissé sur une banane stop ! Impossible de tirer pendant encore {seconds}s.',

  // ---- !banane <cible1> <cible2> <cible3> : Banane Triple (objet d'inventaire ban_tripple) ----
  tripleNoItem:
    "🍌 {from}, tu n'as pas de Banane Triple dans ton inventaire ! Utilise !banane <pseudo> pour une cible unique.",
  tripleTooMany:
    '🍌 {from}, trois cibles maximum pour une Banane Triple ! Utilise : !banane <cible1> <cible2> <cible3>',
  tripleResultCritical: '{target}: CRITIQUE (+{points} pts)',
  tripleResultHit: '{target}: Touché (+{points} pts)',
  tripleResultPenalty: '{target}: Raté ({points} pt)',
  tripleResultConsolation: '{target}: Raté (+{points} pt)',
  tripleResultNeutral: '{target}: Raté !',
  tripleSummary: '🍌🍌🍌 {from} lance une Banane Triple ! {details} — Total : {total} points !',

  // ---- !banane_profil ----
  profileLink: '🍌 {user}, voici ton profil : {url}',
};
