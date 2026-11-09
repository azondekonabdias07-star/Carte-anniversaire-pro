/* Serveur : sert la PWA + vérifie les paiements KKiaPay.
   Le navigateur n'est JAMAIS cru sur parole : on interroge KKiaPay avec nos clés privées. */
require('dotenv').config();
const express = require('express'), crypto = require('crypto'), fs = require('fs'), path = require('path');
const mod = require('@kkiapay-org/nodejs-sdk');
const kkiapay = mod.default || mod;

const { PORT = 3000, KKIAPAY_PUBLIC_KEY, KKIAPAY_PRIVATE_KEY, KKIAPAY_SECRET, KKIAPAY_SANDBOX = 'true', KKIAPAY_WEBHOOK_SECRET } = process.env;
const TOKEN_SECRET = process.env.TOKEN_SECRET || crypto.randomBytes(32).toString('hex');
const paymentConfigured = Boolean(KKIAPAY_PUBLIC_KEY && KKIAPAY_PRIVATE_KEY && KKIAPAY_SECRET);
const PRICE = 500, TOKEN_TTL = 24 * 3600 * 1000;
const k = paymentConfigured ? kkiapay({ publickey: KKIAPAY_PUBLIC_KEY, privatekey: KKIAPAY_PRIVATE_KEY, secretkey: KKIAPAY_SECRET, sandbox: KKIAPAY_SANDBOX === 'true' }) : null;

// Transactions déjà consommées (1 paiement = 1 carte). Un fichier suffit pour démarrer ; passez à une vraie base ensuite.
const USED = path.join(__dirname, 'used.json');
const used = fs.existsSync(USED) ? JSON.parse(fs.readFileSync(USED, 'utf8')) : {};
// Transactions confirmées par le webhook KKiaPay (déjà vérifiées : statut SUCCESS + montant)
const CONFIRMED = path.join(__dirname, 'confirmed.json');
const confirmed = fs.existsSync(CONFIRMED) ? JSON.parse(fs.readFileSync(CONFIRMED, 'utf8')) : {};
const sign = body => crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('hex');

const app = express();
app.use(express.json({ limit: '10kb' }));

// 1) Après le widget : vérifier la transaction chez KKiaPay, puis délivrer un jeton signé
app.post('/api/verify', async (req, res) => {
  if (!paymentConfigured) return res.status(503).json({ error: 'Paiement temporairement indisponible' });
  const { transactionId, cardId } = req.body || {};
  if (!/^[\w-]{3,64}$/.test(String(transactionId)) || !/^[a-z]{3,20}$/.test(String(cardId)))
    return res.status(400).json({ error: 'Requête invalide' });
  if (used[transactionId] && used[transactionId] !== cardId)
    return res.status(409).json({ error: 'Cette transaction a déjà servi pour une autre carte' });
  try {
    if (!confirmed[transactionId]) {          // sinon le webhook l'a déjà confirmée
      const t = await k.verify(transactionId);
      if (!t || t.status !== 'SUCCESS' || Number(t.amount) !== PRICE)
        return res.status(402).json({ error: 'Paiement non confirmé' });
    }
    used[transactionId] = cardId; fs.writeFileSync(USED, JSON.stringify(used));
    const body = `${transactionId}|${cardId}|${Date.now() + TOKEN_TTL}`;
    res.json({ token: Buffer.from(body).toString('base64url') + '.' + sign(body) });
  } catch (e) {
    console.error('verify:', e.message || e);
    res.status(502).json({ error: 'Vérification impossible, réessayez dans un instant' });
  }
});

// Webhook KKiaPay : URL à déclarer dans le tableau de bord (https://votre-domaine/api/webhook)
// L'en-tête x-kkiapay-secret doit correspondre au "hash secret" saisi dans le tableau de bord.
// On ne croit pas le contenu du message : on re-vérifie la transaction auprès de KKiaPay.
app.post('/api/webhook', async (req, res) => {
  if (!paymentConfigured) return res.sendStatus(503);
  const got = Buffer.from(String(req.get('x-kkiapay-secret') || '')), want = Buffer.from(KKIAPAY_WEBHOOK_SECRET || '');
  if (!want.length || got.length !== want.length || !crypto.timingSafeEqual(got, want)) return res.sendStatus(401);
  const { event, transactionId } = req.body || {};
  if (event === 'transaction.success' && /^[\w-]{3,64}$/.test(String(transactionId)) && !confirmed[transactionId]) {
    try {
      const t = await k.verify(transactionId);
      if (t && t.status === 'SUCCESS' && Number(t.amount) === PRICE) {
        confirmed[transactionId] = Date.now(); fs.writeFileSync(CONFIRMED, JSON.stringify(confirmed));
      }
    } catch (e) { console.error('webhook:', e.message || e); return res.sendStatus(500); }
  }
  res.sendStatus(200);
});

// 2) Avant chaque téléchargement : le jeton est-il authentique, non expiré, et pour cette carte ?
app.post('/api/check', (req, res) => {
  const { token, cardId } = req.body || {};
  const [b64, sig] = String(token || '').split('.');
  if (!b64 || !sig) return res.status(401).json({ error: 'Jeton manquant' });
  const body = Buffer.from(b64, 'base64url').toString(), good = Buffer.from(sign(body)), got = Buffer.from(sig);
  const [, cid, exp] = body.split('|');
  if (good.length !== got.length || !crypto.timingSafeEqual(good, got) || cid !== cardId || Date.now() > Number(exp))
    return res.status(401).json({ error: 'Jeton invalide ou expiré' });
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, 'public')));
app.listen(PORT, () => console.log(`http://localhost:${PORT}  (KKiaPay ${KKIAPAY_SANDBOX === 'true' ? 'SANDBOX' : 'PRODUCTION'})`));
