// ==========================================================================
// HTML — lecture des templates dans /public et remplacement des {{PLACEHOLDER}}.
//
// Deux fonctions :
//   - renderTemplate(fileName, vars) : rendu simple d'un seul fichier (historique).
//   - renderPage(fileName, vars)      : pareil, MAIS injecte en plus automatiquement
//     public/partials/header.html et public/partials/footer.html dans les
//     emplacements {{HEADER}} / {{FOOTER}} de la page. C'est la fonction à utiliser
//     pour toute page complète (classement, boutique, profil, accueil, changelog).
//
// vars.TITLE et vars.SUBTITLE sont propagées dans le header partagé — laisse-les
// vides ('') si une page ne veut pas de titre dans son bandeau (ex: profil, changelog).
// ==========================================================================

const fs = require('fs');
const path = require('path');

function readPublicFile(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), 'public', relativePath), 'utf8');
}

function fillTemplate(html, vars) {
  let out = html;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

function renderTemplate(fileName, vars) {
  return fillTemplate(readPublicFile(fileName), vars);
}

function renderPage(fileName, vars = {}) {
  const headerHtml = fillTemplate(readPublicFile(path.join('partials', 'header.html')), {
    TITLE: vars.TITLE || '',
    SUBTITLE: vars.SUBTITLE || '',
  });
  const footerHtml = readPublicFile(path.join('partials', 'footer.html'));

  return fillTemplate(readPublicFile(fileName), {
    ...vars,
    HEADER: headerHtml,
    FOOTER: footerHtml,
  });
}

module.exports = { renderTemplate, renderPage };
