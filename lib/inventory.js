// ==========================================================================
// INVENTORY — inventaire des viewers : objets achetés avec Est_Inventaire=TRUE
// dans le Google Sheet, stockés pour être activés plus tard via !banane_use.
// Pure logique, aucune route ici (voir routes/inventory.js).
// ==========================================================================

const { redis } = require('./redis');

// Ajoute qty exemplaire(s) d'un objet à l'inventaire d'un joueur.
async function addItem(usernameLower, itemId, qty = 1) {
  return redis.hincrby(`inventory:${usernameLower}`, itemId, qty);
}

// Renvoie tout l'inventaire brut : { itemId: quantite, ... }
async function getInventory(usernameLower) {
  return (await redis.hgetall(`inventory:${usernameLower}`)) || {};
}

async function getItemQuantity(usernameLower, itemId) {
  const inv = await getInventory(usernameLower);
  return parseInt(inv[itemId] || 0, 10);
}

// Retire qty exemplaire(s). Renvoie false si le joueur n'en a pas assez (rien n'est modifié dans ce cas).
async function removeItem(usernameLower, itemId, qty = 1) {
  const current = await getItemQuantity(usernameLower, itemId);
  if (current < qty) return false;

  const newQty = current - qty;
  if (newQty <= 0) {
    await redis.hdel(`inventory:${usernameLower}`, itemId);
  } else {
    await redis.hincrby(`inventory:${usernameLower}`, itemId, -qty);
  }
  return true;
}

module.exports = { addItem, getInventory, getItemQuantity, removeItem };
