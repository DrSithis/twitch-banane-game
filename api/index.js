const express = require('express');

const bananeRoutes = require('../routes/banane');
const shopRoutes = require('../routes/shop');
const inventoryRoutes = require('../routes/inventory');
const leaderboardRoutes = require('../routes/leaderboard');
const alertsRoutes = require('../routes/alerts');

const app = express();

// ---- Montage des différents modules de routes ----
app.use(bananeRoutes.router);      // /api/banane, /api/bananestats, /api/bananepoints, /api/topbanane, /api/banane-add, /api/debug-watchtime
app.use(shopRoutes.router);        // /api/buy, /api/shop, /boutique
app.use(inventoryRoutes.router);   // /api/inventaire, /api/use
app.use(leaderboardRoutes.router); // /api/leaderboard, /classement
app.use(alertsRoutes.router);      // /api/alerts/pop, /alerts

// ---- Routes racine ----
app.get('/api', (req, res) => res.send('Twitch Banane Game API — OK'));
app.get('/', (req, res) => res.send('Twitch Banane Game API — OK. Voir /classement pour le classement en ligne.'));

module.exports = app;
