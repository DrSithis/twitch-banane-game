const Papa = require('papaparse');

// Par défaut, pointe vers le Google Sheet fourni. Modifiable via SHOP_SHEET_ID
// (juste l'ID, trouvable dans l'URL entre /d/ et /edit) ou SHOP_CSV_URL (URL complète).
// IMPORTANT : le Google Sheet doit rester en partage "Toute personne disposant du lien peut voir".
const DEFAULT_SHEET_ID = '1jgAVaH2DmRxk63uYyYgLHTI9-IwsAikROt_pAt0ve-Y';
const SHEET_ID = process.env.SHOP_SHEET_ID || DEFAULT_SHEET_ID;
const CSV_URL = process.env.SHOP_CSV_URL || `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;
const CACHE_TTL_SECONDS = parseInt(process.env.SHOP_CACHE_TTL || '60', 10);

async function fetchShopFromSheet() {
  const r = await fetch(CSV_URL);
  if (!r.ok) throw new Error(`Impossible de lire le Google Sheet (HTTP ${r.status})`);
  const csvText = await r.text();
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });

  return parsed.data
    .map((row) => ({
      id: (row.ID || '').toString().trim(),
      nom: (row.Nom || '').toString().trim(),
      description: (row.Description || '').toString().trim(),
      prix: parseInt(row.Prix, 10) || 0,
      categorie: (row.Categorie || '').toString().trim(),
      typeCible: (row.Type_cible || '').toString().trim(),
      cooldownMinutes: parseInt(row.Cooldown, 10) || 0,
      actif: (row.Actif || '').toString().trim().toUpperCase() === 'TRUE',
    }))
    .filter((item) => item.id); // ignore les lignes vides / d'en-tête
}

// Récupère la boutique, avec un cache Redis de courte durée pour éviter
// de solliciter Google Sheets à chaque commande !banane_buy / !banane_shop.
async function getShopItems(redis) {
  const cacheKey = 'shop:cache';
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (e) {
    // pas grave, on retombe sur un fetch direct
  }

  const items = await fetchShopFromSheet();

  try {
    await redis.set(cacheKey, JSON.stringify(items), { ex: CACHE_TTL_SECONDS });
  } catch (e) {
    // le cache est un bonus, pas un blocage
  }

  return items;
}

module.exports = { getShopItems };
