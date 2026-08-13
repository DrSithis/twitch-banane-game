// ==========================================================================
// ROUTES INVENTORY — !banane_inventaire (consultation),
// !banane_use (activation d'un objet acheté avec Est_Inventaire=TRUE).
// ==========================================================================

const express = require('express');
const { redis } = require('../lib/redis');
const { clean } = require('../lib/utils');
const { getShopItems } = require('../lib/shop');
const { getInventory, removeItem, addItem } = require('../lib/inventory');
const { TRIGGERFYRE_ENABLED, TRIGGERFYRE_PREFIX } = require('../lib/config');

const router = express.Router();

// ---- !banane_inventaire (ou !banane_inv) ----
router.get('/api/inventaire', async (req, res) => {
  const userLower = clean(req.query.user);
  const userDisplay = req.query.user || userLower;
  if (!userLower) return res.send('Utilisation : !banane_inventaire');

  const inv = await getInventory(userLower);
  const entries = Object.entries(inv).filter(([, qty]) => parseInt(qty, 10) > 0);

  if (!entries.length) {
    return res.send(`🎒 ${userDisplay}, ton inventaire est vide. Achète des objets stockables sur /boutique !`);
  }

  let items = [];
  try {
    items = await getShopItems(redis);
  } catch (e) {
    items = []; // si la boutique est indisponible, on affiche quand même les ID bruts
  }

  const parts = entries.map(([itemId, qty]) => {
    const item = items.find((it) => it.id.toLowerCase() === itemId.toLowerCase());
    const name = item ? item.nom : itemId;
    return `${name} x${qty}`;
  });

  return res.send(`🎒 Inventaire de ${userDisplay} : ${parts.join(' | ')}`);
});

// ---- !banane_use <id> [@cible] : active un objet stocké dans l'inventaire ----
router.get('/api/use', async (req, res) => {
  const userLower = clean(req.query.user);
  const userDisplay = req.query.user || userLower;
  const itemId = (req.query.id || '').toString().trim().toLowerCase();
  const targetDisplay = req.query.target || '';

  if (!userLower || !itemId) {
    return res.send('Utilisation : !banane_use <id_objet> [@cible]');
  }

  let items;
  try {
    items = await getShopItems(redis);
  } catch (e) {
    return res.send('🍌 La boutique est momentanément indisponible, réessaie dans une minute.');
  }

  const item = items.find((it) => it.id.toLowerCase() === itemId);
  if (!item || !item.estInventaire) {
    return res.send(`🎒 "${req.query.id}" n'est pas un objet utilisable depuis l'inventaire.`);
  }

  const removed = await removeItem(userLower, item.id, 1);
  if (!removed) {
    return res.send(`🎒 ${userDisplay}, tu n'as pas "${item.nom}" dans ton inventaire. Achète-le sur /boutique !`);
  }

  // Cooldown propre à CET objet, appliqué au moment de l'ACTIVATION (pas de l'achat)
  const itemCooldownKey = `shopcooldown:${item.id}`;
  if (item.cooldownMinutes > 0) {
    const onCooldown = await redis.get(itemCooldownKey);
    if (onCooldown) {
      const ttl = await redis.ttl(itemCooldownKey);
      const ttlDisplay = ttl > 0 ? ttl : item.cooldownMinutes * 60;
      // L'activation est refusée : on rend l'objet au joueur, il ne doit pas le perdre pour rien.
      await addItem(userLower, item.id, 1);
      return res.send(`🍌 "${item.nom}" vient d'être utilisé, réessaie dans ${Math.ceil(ttlDisplay / 60)} min.`);
    }
    await redis.set(itemCooldownKey, '1', { ex: item.cooldownMinutes * 60 });
  }

  // Alerte mise en file d'attente pour l'overlay (voir /alerts), identique à un achat direct
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
  await redis.ltrim('alerts:queue', -20, -1);

  const triggerCmd = TRIGGERFYRE_ENABLED ? `!${TRIGGERFYRE_PREFIX}${item.id} ` : '';
  return res.send(`${triggerCmd}🎒 ${userDisplay} active "${item.nom}" depuis son inventaire !`);
});

module.exports = { router };
