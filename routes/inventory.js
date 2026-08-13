// ==========================================================================
// ROUTES INVENTORY — !banane_inventaire (consultation),
// !banane_use (activation d'un objet acheté avec Est_Inventaire=TRUE).
// ==========================================================================

const express = require('express');
const { redis } = require('../lib/redis');
const { clean, render } = require('../lib/utils');
const { getShopItems } = require('../lib/shop');
const { getInventory, removeItem, addItem } = require('../lib/inventory');
const { TRIGGERFYRE_ENABLED, TRIGGERFYRE_PREFIX, ITEM_ID_STOP, STUN_DURATION_SECONDS } = require('../lib/config');
const messages = require('../lib/messages');

const router = express.Router();

// ---- !banane_inventaire (ou !banane_inv) ----
router.get('/api/inventaire', async (req, res) => {
  const userLower = clean(req.query.user);
  const userDisplay = req.query.user || userLower;
  if (!userLower) return res.send(messages.usageInventaire);

  const inv = await getInventory(userLower);
  const entries = Object.entries(inv).filter(([, qty]) => parseInt(qty, 10) > 0);

  if (!entries.length) {
    return res.send(render(messages.inventaireEmpty, { user: userDisplay }));
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

  return res.send(render(messages.inventaireList, { user: userDisplay, items: parts.join(' | ') }));
});

// ---- !banane_use <id> [@cible] : active un objet stocké dans l'inventaire ----
router.get('/api/use', async (req, res) => {
  const userLower = clean(req.query.user);
  const userDisplay = req.query.user || userLower;
  const itemId = (req.query.id || '').toString().trim().toLowerCase();
  const targetDisplay = req.query.target || '';

  if (!userLower || !itemId) {
    return res.send(messages.usageUse);
  }

  let items;
  try {
    items = await getShopItems(redis);
  } catch (e) {
    return res.send(messages.shopUnavailable);
  }

  const item = items.find((it) => it.id.toLowerCase() === itemId);
  if (!item || !item.estInventaire) {
    return res.send(render(messages.useNotUsable, { itemId: req.query.id }));
  }

  // Banane Stop exige une cible AVANT de consommer l'objet, pour ne pas le perdre pour rien.
  const targetLower = clean(targetDisplay);
  if (item.id === ITEM_ID_STOP) {
    if (!targetLower) {
      return res.send(render(messages.useStopUsage, { user: userDisplay }));
    }
    if (targetLower === userLower) {
      return res.send(render(messages.useStopSelf, { user: userDisplay }));
    }
  }

  const removed = await removeItem(userLower, item.id, 1);
  if (!removed) {
    return res.send(render(messages.useNotOwned, { user: userDisplay, itemName: item.nom }));
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
      return res.send(
        render(messages.useOnCooldown, { itemName: item.nom, minutes: Math.ceil(ttlDisplay / 60) })
      );
    }
    await redis.set(itemCooldownKey, '1', { ex: item.cooldownMinutes * 60 });
  }

  // Banane Stop : applique le blocage sur la cible (elle ne peut plus lancer pendant STUN_DURATION_SECONDS).
  if (item.id === ITEM_ID_STOP) {
    await redis.set(`stunted:${targetLower}`, '1', { ex: STUN_DURATION_SECONDS });
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

  if (item.id === ITEM_ID_STOP) {
    const minutes = Math.ceil(STUN_DURATION_SECONDS / 60);
    return res.send(
      triggerCmd + render(messages.useStopSuccess, { user: userDisplay, target: targetDisplay, minutes })
    );
  }
  return res.send(triggerCmd + render(messages.useSuccess, { user: userDisplay, itemName: item.nom }));
});

module.exports = { router };
