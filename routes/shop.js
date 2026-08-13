// ==========================================================================
// ROUTES SHOP — !banane_buy, !banane_shop et la page /boutique.
// La récupération des données (items) reste dans lib/shop.js ; ce fichier
// gère uniquement les routes HTTP et l'affichage.
// ==========================================================================

const express = require('express');
const { redis } = require('../lib/redis');
const { getShopItems } = require('../lib/shop');
const { addItem } = require('../lib/inventory');
const { clean, escapeHtml } = require('../lib/utils');
const { renderTemplate } = require('../lib/html');
const { ensureUser } = require('../lib/users');
const { TRIGGERFYRE_ENABLED, TRIGGERFYRE_PREFIX } = require('../lib/config');

const router = express.Router();

// ---- !banane_buy <id> [@cible optionnelle] ----
router.get('/api/buy', async (req, res) => {
  const userLower = clean(req.query.user);
  const userDisplay = req.query.user || userLower;
  const itemId = (req.query.id || '').toString().trim().toLowerCase();
  const targetDisplay = req.query.target || '';

  if (!userLower || !itemId) {
    return res.send('Utilisation : !banane_buy <id_recompense> [@cible]');
  }

  let items;
  try {
    items = await getShopItems(redis);
  } catch (e) {
    return res.send('🍌 La boutique est momentanément indisponible, réessaie dans une minute.');
  }

  const item = items.find((it) => it.id.toLowerCase() === itemId && it.actif);
  if (!item) {
    return res.send(`🍌 Récompense "${req.query.id}" introuvable ou indisponible. Liste complète sur /boutique.`);
  }

  await ensureUser(userLower, userDisplay);

  const stats = (await redis.hgetall(`stats:${userLower}`)) || {};
  const points = parseInt(stats.points || 0, 10);

  if (points < item.prix) {
    return res.send(
      `🍌 ${userDisplay}, il te manque ${item.prix - points} Points Banane pour "${item.nom}" (${item.prix} pts, tu en as ${points}).`
    );
  }

  // ---- Objet STOCKABLE (Est_Inventaire = TRUE) : pas d'effet immédiat, pas de cooldown à l'achat ----
  // Le cooldown de l'objet ne s'applique qu'au moment de l'activation via !banane_use.
  if (item.estInventaire) {
    await redis.hincrby(`stats:${userLower}`, 'points', -item.prix);
    await redis.zincrby('leaderboard', -item.prix, userLower);
    await addItem(userLower, item.id, 1);
    const remaining = points - item.prix;
    return res.send(
      `🎒 ${userDisplay} a ajouté "${item.nom}" à son inventaire pour ${item.prix} pts ! (${remaining} pts restants) → utilise !banane_use ${item.id} pour l'activer.`
    );
  }

  // ---- Objet à EFFET IMMÉDIAT (comportement existant) ----
  // Cooldown propre à CETTE récompense (évite le spam du même effet en boucle)
  const itemCooldownKey = `shopcooldown:${item.id}`;
  if (item.cooldownMinutes > 0) {
    const onCooldown = await redis.get(itemCooldownKey);
    if (onCooldown) {
      const ttl = await redis.ttl(itemCooldownKey);
      const ttlDisplay = ttl > 0 ? ttl : item.cooldownMinutes * 60;
      return res.send(`🍌 "${item.nom}" vient d'être utilisé, réessaie dans ${Math.ceil(ttlDisplay / 60)} min.`);
    }
  }

  // Débit des points (portefeuille + classement, cohérents entre eux)
  await redis.hincrby(`stats:${userLower}`, 'points', -item.prix);
  await redis.zincrby('leaderboard', -item.prix, userLower);

  if (item.cooldownMinutes > 0) {
    await redis.set(itemCooldownKey, '1', { ex: item.cooldownMinutes * 60 });
  }

  // Alerte mise en file d'attente pour l'overlay (voir /alerts)
  const alertPayload = {
    id: item.id,
    nom: item.nom,
    description: item.description,
    categorie: item.categorie,
    prix: item.prix,
    buyer: userDisplay,
    target: targetDisplay || null,
    timestamp: Date.now(),
  };
  await redis.rpush('alerts:queue', JSON.stringify(alertPayload));
  await redis.ltrim('alerts:queue', -20, -1); // jamais plus de 20 alertes en attente

  const remaining = points - item.prix;
  const triggerCmd = TRIGGERFYRE_ENABLED ? `!${TRIGGERFYRE_PREFIX}${item.id} ` : '';
  return res.send(
    `${triggerCmd}🍌 ${userDisplay} a débloqué "${item.nom}" pour ${item.prix} pts ! (${remaining} pts restants) → à activer en live !`
  );
});

// ---- !banane_shop : pointe vers la page /boutique ----
router.get('/api/shop', async (req, res) => {
  let items;
  try {
    items = await getShopItems(redis);
  } catch (e) {
    return res.send('🍌 La boutique est momentanément indisponible.');
  }
  const activeCount = items.filter((i) => i.actif).length;
  const host = `${req.protocol}://${req.get('host')}`;
  return res.send(
    `🍌 Boutique Banane : ${activeCount} défis disponibles. Utilise !banane_buy <id> pour en débloquer un. Liste complète : ${host}/boutique`
  );
});

// ---- Page HTML stylée de la boutique, template modifiable dans public/boutique.html ----
router.get('/boutique', async (req, res) => {
  let items = [];
  let errorMsg = null;
  try {
    items = (await getShopItems(redis)).filter((i) => i.actif);
  } catch (e) {
    errorMsg = e.message;
  }

  const byCategory = {};
  for (const item of items) {
    const cat = item.categorie || 'Autre';
    byCategory[cat] = byCategory[cat] || [];
    byCategory[cat].push(item);
  }

  const contentHtml = errorMsg
    ? `<div class="empty">Erreur de chargement de la boutique : ${escapeHtml(errorMsg)}</div>`
    : items.length
    ? Object.entries(byCategory)
        .map(([cat, catItems]) => {
          const cardsHtml = catItems
            .sort((a, b) => a.prix - b.prix)
            .map(
              (it) => `
              <div class="reward-card">
                <div class="reward-header">
                  <span class="reward-name">${escapeHtml(it.nom)}</span>
                  <span class="reward-price">${it.prix} pts</span>
                </div>
                <p class="reward-desc">${escapeHtml(it.description)}</p>
                <div class="reward-footer">
                  <code class="reward-id">${escapeHtml(it.id)}</code>
                  ${it.cooldownMinutes > 0 ? `<span class="reward-cooldown">⏱ ${it.cooldownMinutes} min</span>` : ''}
                </div>
              </div>`
            )
            .join('');
          return `
          <section class="category-block">
            <h2>${escapeHtml(cat)}</h2>
            <div class="rewards-grid">${cardsHtml}</div>
          </section>`;
        })
        .join('')
    : `<div class="empty">Aucune récompense disponible pour le moment.</div>`;

  try {
    const html = renderTemplate('boutique.html', { COUNT: items.length, CONTENT: contentHtml });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    console.error('Erreur lecture template boutique.html:', err);
    return res.status(500).send('Erreur lors du chargement de la boutique.');
  }
});

module.exports = { router };
