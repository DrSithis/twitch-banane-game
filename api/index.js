const express = require('express');

const usersRoutes = require('../lib/users');
const gameRoutes = require('../lib/game');
const shopRoutes = require('../lib/shop-routes');
const leaderboardRoutes = require('../lib/leaderboard');

const app = express();

// ---- Montage des différents modules de routes ----
app.use(usersRoutes.router);       // /api/debug-watchtime
app.use(gameRoutes.router);        // /api/banane, /api/bananestats, /api/bananepoints, /api/topbanane, /api/banane-add
app.use(shopRoutes.router);        // /api/buy, /api/shop, /boutique
app.use(leaderboardRoutes.router); // /api/leaderboard, /classement, /api/alerts/pop, /alerts

// ---- Routes racine ----
app.get('/api', (req, res) => res.send('Twitch Banane Game API — OK'));
app.get('/', (req, res) => res.send('Twitch Banane Game API — OK. Voir /classement pour le classement en ligne.'));

module.exports = app;
