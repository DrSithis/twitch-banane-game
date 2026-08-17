// ==========================================================================
// ROUTES PAGES — pages simples sans donnée dynamique côté serveur :
// l'accueil (/) et le changelog (/changelog). Toutes deux passent par
// renderPage pour bénéficier du header/footer partagés (public/partials/).
// ==========================================================================

const express = require('express');
const { renderPage } = require('../lib/html');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const html = renderPage('index.html', {
      TITLE: '🍌 Twitch Banane Game',
      SUBTITLE: 'Le jeu de tout les macaques du stream ! LANCE, ACCUMULE, RÉCOMPENSE.',
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    console.error('Erreur lecture template index.html:', err);
    return res.status(500).send("Erreur lors du chargement de la page d'accueil.");
  }
});

router.get('/changelog', (req, res) => {
  try {
    const html = renderPage('changelog.html', { TITLE: '', SUBTITLE: '' });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    console.error('Erreur lecture template changelog.html:', err);
    return res.status(500).send('Erreur lors du chargement du changelog.');
  }
});

module.exports = { router };
