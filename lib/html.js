// ==========================================================================
// HTML — lecture des templates dans /public (boutique.html, classement.html)
// et remplacement des {{PLACEHOLDER}}. Partagé par routes/shop.js et
// routes/leaderboard.js pour éviter de dupliquer la lecture de fichier.
// ==========================================================================

const fs = require('fs');
const path = require('path');

function renderTemplate(fileName, vars) {
  const templatePath = path.join(process.cwd(), 'public', fileName);
  let html = fs.readFileSync(templatePath, 'utf8');
  for (const [key, value] of Object.entries(vars)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }
  return html;
}

module.exports = { renderTemplate };
