// ==========================================================================
// UTILS — petites fonctions génériques réutilisées par plusieurs modules.
// ==========================================================================

// Normalise un pseudo : trim, minuscule, retire le "@" éventuel.
function clean(name) {
  return (name || '').toString().trim().toLowerCase().replace(/^@/, '');
}

// Choisit une phrase au hasard dans une liste.
function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// Remplace les {placeholders} d'un template par leurs valeurs.
function render(template, vars) {
  return template.replace(/{(\w+)}/g, (match, key) => (vars[key] !== undefined ? vars[key] : match));
}

// Échappe le HTML pour éviter l'injection dans les pages générées.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { clean, pick, render, escapeHtml };
