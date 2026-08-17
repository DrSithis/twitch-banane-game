const express = require('express');
const path = require('path');

const bananeRoutes = require('../routes/banane');
const shopRoutes = require('../routes/shop');
const inventoryRoutes = require('../routes/inventory');
const leaderboardRoutes = require('../routes/leaderboard');
const alertsRoutes = require('../routes/alerts');
const profileRoutes = require('../routes/profile');
const pagesRoutes = require('../routes/pages');

const app = express();

// ---- Pages HTML dynamiques (doivent passer AVANT express.static, sinon Express
// servirait directement le fichier brut non-templaté pour "/") ----
app.use(pagesRoutes.router);       // /, /changelog

// ---- Fichiers statiques (CSS, logo, partials...) ----
app.use(express.static(path.join(__dirname, '../public')));

// ---- Montage des différents modules de routes ----
app.use(bananeRoutes.router);      // /api/banane, /api/bananestats, /api/bananepoints, /api/topbanane, /api/banane-add, /api/debug-watchtime
app.use(shopRoutes.router);        // /api/buy, /api/shop, /boutique
app.use(inventoryRoutes.router);   // /api/inventaire, /api/use
app.use(leaderboardRoutes.router); // /api/leaderboard, /classement
app.use(alertsRoutes.router);      // /api/alerts/pop, /alerts
app.use(profileRoutes.router);     // /profil/:username, /api/profile/:username, /api/profile-link

// ---- Routes racine ----
app.get('/api', (req, res) => res.send('Twitch Banane Game API — OK'));

module.exports = app;
