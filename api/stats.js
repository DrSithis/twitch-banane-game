import redis from '../libs/redis.js';

export default async function handler(req, res) {
  try {
    // 1. Récupération de toutes les clés d'utilisateurs dans Redis
    const keys = await redis.keys('user:*');
    const stats = [];

    for (const key of keys) {
      const data = await redis.hgetall(key);
      if (data) {
        const lances = parseInt(data.lances || data.attempts || 0);
        const reussites = parseInt(data.reussites || data.successes || 0);
        const precision = lances > 0 ? ((reussites / lances) * 100).toFixed(1) : '0.0';
        const points = parseInt(data.points || 0);
        const favoriteTarget = data.favorite_target || data.target || '-';

        stats.push({
          username: key.replace('user:', ''),
          lances,
          reussites,
          precision,
          points,
          favoriteTarget
        });
      }
    }

    // Tri par points décroissants (puis par réussites si égalité)
    stats.sort((a, b) => b.points - a.points || b.reussites - a.reussites);

    // 2. Construction du tableau HTML
    const rows = stats.map((player, index) => `
      <tr>
        <td class="rank">#${index + 1}</td>
        <td class="username">${player.username}</td>
        <td class="points">${player.points} pts</td>
        <td>${player.reussites} / ${player.lances}</td>
        <td>${player.precision}%</td>
        <td>${player.favoriteTarget}</td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Classement - Jeu de la Banane 🍌</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0e0e10; color: #efeff1; margin: 0; padding: 24px; }
          .container { max-width: 900px; margin: 0 auto; }
          h1 { text-align: center; color: #ffe135; font-size: 2rem; margin-bottom: 24px; display: flex; align-items: center; justify-content: center; gap: 10px; }
          .table-wrapper { background: #18181b; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4); border: 1px solid #26262c; }
          table { width: 100%; border-collapse: collapse; text-align: left; }
          th, td { padding: 14px 18px; border-bottom: 1px solid #26262c; }
          th { background-color: #1f1f23; color: #adadb8; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
          tr:last-child td { border-bottom: none; }
          tr:hover { background-color: #202025; }
          .rank { font-weight: bold; color: #ffe135; width: 60px; }
          .username { font-weight: 600; color: #fff; }
          .points { color: #a970ff; font-weight: bold; }
          .empty { text-align: center; padding: 30px; color: #adadb8; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🍌 Classement Général - Lancé de Bananes</h1>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Rang</th>
                  <th>Joueur</th>
                  <th>Points</th>
                  <th>Réussites / Lancés</th>
                  <th>Précision</th>
                  <th>Cible Favorite</th>
                </tr>
              </thead>
              <tbody>
                ${rows.length > 0 ? rows : '<tr><td colspan="6" class="empty">Aucune statistique enregistrée pour le moment.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);

  } catch (error) {
    console.error('Erreur API Stats:', error);
    return res.status(500).send('Erreur lors du chargement des statistiques.');
  }
}