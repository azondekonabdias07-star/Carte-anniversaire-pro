'use strict';
/* ==========================================================================
   Cartes d’anniversaire — logique de l'application
   1. Configuration   2. Gabarits de cartes   3. Rendu & grille
   4. Formulaire      5. Paiement             6. Export HD   7. PWA
   ========================================================================== */

/* ---------- 1. CONFIGURATION ---------- */
const CARD_W = 540, CARD_H = 675;      // taille de conception (ratio 4:5)
const EXPORT_SCALE = 2;                // 540x675 -> 1080x1350 px
const PRICE = 500;                     // FCFA

const PALETTES = {
  rose:   { label: 'Rose',   c1: '#FF4F8B', c2: '#FFB36B', ink: '#3A1030' },
  ocean:  { label: 'Océan',  c1: '#2B6BFF', c2: '#2FD4C8', ink: '#08224A' },
  or:     { label: 'Doré',   c1: '#C99A2E', c2: '#F2DB9B', ink: '#2B1E05' },
  menthe: { label: 'Menthe', c1: '#1FAE7A', c2: '#C6F1B0', ink: '#0C3324' },
  violet: { label: 'Violet', c1: '#7B3FE4', c2: '#E58BFF', ink: '#26104F' },
};
const FORMATS = [['png', 'PNG'], ['jpeg', 'JPEG'], ['pdf', 'PDF']];
const OPERATORS = [['mtn', 'MTN MoMo'], ['moov', 'Moov Money'], ['orange', 'Orange Money'], ['card', 'Carte bancaire']];

// État global : tout passe par ici
const state = { data: null, selected: null, format: 'png', paid: new Map(), operator: 'mtn', palette: 'rose', files: [] };

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Réduit la taille de police selon la longueur du texte (évite les débordements)
const fit = (txt, max) => Math.min(max, Math.floor(450 / Math.max(txt.length * 0.6, 1)));
// Générateur pseudo-aléatoire à graine : mêmes confettis à l'aperçu et à l'export
const rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/* ---------- 2. GABARITS DE CARTES (HTML + styles inline pour html2canvas) ---------- */
const BASE = `width:${CARD_W}px;height:${CARD_H}px;position:relative;overflow:hidden;box-sizing:border-box;`;
const photo = (d, size, radius, extra = '') => d.photos[0]
  ? `<img src="${d.photos[0]}" style="width:${size}px;height:${size}px;object-fit:cover;border-radius:${radius};${extra}">` : '';
const minis = (d, size, radius, extra = '') => d.photos.slice(1, 4)
  .map(u => `<img src="${u}" style="width:${size}px;height:${size}px;object-fit:cover;border-radius:${radius};${extra}">`).join('');

const STYLES = [
  { id: 'moderne', label: 'Moderne', render: (d, p) => `
    <div style="${BASE}background:linear-gradient(155deg,${p.c1},${p.c2});color:#fff;font-family:Montserrat,sans-serif;padding:44px;display:flex;flex-direction:column;align-items:flex-start">
      <div style="position:absolute;right:-110px;top:-110px;width:340px;height:340px;border-radius:50%;background:rgba(255,255,255,.2)"></div>
      <div style="position:absolute;left:-60px;bottom:130px;width:180px;height:180px;border-radius:50%;background:rgba(255,255,255,.12)"></div>
      <p style="font-size:18px;font-weight:500;position:relative">Joyeux anniversaire</p>
      <h2 style="font-size:${fit(d.name, 60)}px;font-weight:800;line-height:1.05;margin:8px 0 22px;position:relative">${esc(d.name)}</h2>
      <div style="display:flex;align-items:center;gap:18px;position:relative">
        ${photo(d, 210, '42% 58% 55% 45%', 'border:6px solid #fff')}
        ${d.age ? `<div style="font-size:${d.photos[0] ? 120 : 230}px;font-weight:800;line-height:.9">${esc(d.age)}</div>` : ''}
      </div>
      <div style="display:flex;gap:10px;margin-top:14px;position:relative">${minis(d, 64, '16px', 'border:3px solid #fff')}</div>
      <p style="margin-top:auto;font-size:21px;line-height:1.4;position:relative;max-width:92%">${esc(d.message)}</p>
    </div>` },

  { id: 'festif', label: 'Festif', render: (d, p) => {
      const r = rng(97 + d.name.length), cols = [p.c1, p.c2, '#FFD23F', '#3EC1D3', '#FF7AA8'];
      // Confettis générés une seule fois par carte
      const confetti = Array.from({ length: 46 }, () =>
        `<i style="position:absolute;left:${r() * 100}%;top:${r() * 100}%;width:${8 + r() * 10}px;height:${5 + r() * 9}px;background:${cols[Math.floor(r() * cols.length)]};transform:rotate(${r() * 360}deg);border-radius:${r() > .6 ? '50%' : '2px'}"></i>`).join('');
      return `
    <div style="${BASE}background:linear-gradient(180deg,${p.c2}99,#fff 70%);font-family:Montserrat,sans-serif;color:${p.ink};text-align:center;padding:40px;display:flex;flex-direction:column;align-items:center">
      ${confetti}
      <div style="position:absolute;left:22px;top:18px;font-size:58px">🎈</div>
      <div style="position:absolute;right:22px;top:18px;font-size:58px">🎉</div>
      <h2 style="font-family:Pacifico,cursive;font-size:46px;color:${p.c1};margin-top:36px;line-height:1.1;position:relative;text-shadow:2px 2px 0 #fff">Joyeux<br>Anniversaire !</h2>
      <p style="font-size:${fit(d.name, 44)}px;font-weight:800;margin:10px 0 14px;position:relative">${esc(d.name)}</p>
      <div style="position:relative;display:flex;align-items:center;justify-content:center">
        ${photo(d, 190, '50%', `border:6px solid #fff;box-shadow:0 0 0 5px ${p.c1}`)}
        ${d.age ? `<div style="position:${d.photos[0] ? 'absolute' : 'static'};right:-34px;bottom:-8px;width:92px;height:92px;border-radius:50%;background:${p.c1};color:#fff;font-size:44px;font-weight:800;display:flex;align-items:center;justify-content:center;border:4px solid #fff">${esc(d.age)}</div>` : ''}
      </div>
      <div style="display:flex;gap:10px;margin-top:18px;position:relative">${minis(d, 56, '50%', '')}</div>
      <p style="margin-top:auto;background:#fff;border-radius:22px;padding:16px 20px;font-size:19px;line-height:1.4;position:relative;box-shadow:0 6px 18px ${p.c1}33">${esc(d.message)}</p>
    </div>`; } },

  { id: 'minimaliste', label: 'Minimaliste', render: (d, p) => `
    <div style="${BASE}background:#fff;font-family:Jost,sans-serif;color:#1c1c1c;padding:52px 46px;display:flex;flex-direction:column">
      <p style="font-size:16px;letter-spacing:.18em;font-weight:400">joyeux anniversaire</p>
      <div style="width:48px;height:3px;background:${p.c1};margin:16px 0 18px"></div>
      <h2 style="font-size:${fit(d.name, 64)}px;font-weight:300;line-height:1.05">${esc(d.name)}</h2>
      ${d.photos[0] ? `<img src="${d.photos[0]}" style="width:100%;height:240px;object-fit:cover;margin-top:26px">` : ''}
      <div style="display:flex;gap:8px;margin-top:8px">${minis(d, 56, '0')}</div>
      <div style="margin-top:auto;display:flex;align-items:flex-end;justify-content:space-between;gap:20px">
        <p style="font-size:20px;line-height:1.5;font-weight:300;max-width:290px">${esc(d.message)}</p>
        ${d.age ? `<span style="font-size:110px;font-weight:500;line-height:.8;color:${p.c1}">${esc(d.age)}</span>` : ''}
      </div>
    </div>` },

  { id: 'elegant', label: 'Élégant', render: (d, p) => `
    <div style="${BASE}background:${p.ink};font-family:'Cormorant Garamond',serif;color:#fff;text-align:center;padding:30px">
      <div style="position:absolute;inset:16px;border:1px solid ${p.c2}"></div>
      <div style="position:absolute;inset:24px;border:3px double ${p.c2}88"></div>
      <div style="position:relative;height:100%;display:flex;flex-direction:column;align-items:center;padding:34px 26px 24px">
        <p style="font-size:42px;font-style:italic;color:${p.c2};line-height:1.1">Joyeux Anniversaire</p>
        <p style="color:${p.c2};letter-spacing:.6em;margin:8px 0 14px">✦ ✦ ✦</p>
        ${photo(d, 200, '50%', `height:250px;border:3px solid ${p.c2};padding:5px;background:${p.ink}`)}
        <h2 style="font-size:${fit(d.name, 54)}px;font-weight:600;margin-top:14px">${esc(d.name)}</h2>
        ${d.age ? `<p style="font-size:26px;font-style:italic;color:${p.c2}">${esc(d.age)} ans</p>` : ''}
        <p style="margin-top:auto;font-size:22px;font-style:italic;line-height:1.35;opacity:.92">${esc(d.message)}</p>
      </div>
    </div>` },
];

// Filigrane affiché UNIQUEMENT sur les aperçus non payés
const WM = 'url("data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="230" height="150"><text x="115" y="80" text-anchor="middle" transform="rotate(-25 115 75)" font-family="sans-serif" font-size="22" font-weight="700" fill="rgba(110,110,110,.5)" stroke="rgba(255,255,255,.6)" stroke-width=".7">APERÇU · 500 FCFA</text></svg>') + '")';

/* ---------- 3. RENDU & GRILLE ---------- */
function buildCard(id, watermark) {
  const tpl = STYLES.find(s => s.id === id), d = state.data, p = PALETTES[d.palette];
  const el = document.createElement('div');
  el.style.cssText = `width:${CARD_W}px;height:${CARD_H}px;position:relative;transform-origin:top left`;
  el.innerHTML = tpl.render(d, p) + (watermark
    ? `<div style="position:absolute;inset:0;z-index:5;pointer-events:none;background:${WM}"></div>` : '');
  return el;
}

function renderGrid() {
  const grid = $('#grid'); grid.innerHTML = '';
  STYLES.forEach(s => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'text-left'; b.dataset.id = s.id;
    b.innerHTML = `<div class="wrap relative w-full overflow-hidden rounded-2xl shadow-lg ring-1 ring-black/5" style="aspect-ratio:4/5"></div>
                   <p class="mt-2 font-semibold">${s.label}${state.paid.has(s.id) ? ' ✔' : ''}</p>`;
    $('.wrap', b).appendChild(buildCard(s.id, !state.paid.has(s.id)));
    b.onclick = () => selectCard(s.id);
    grid.appendChild(b);
  });
  scalePreviews();
}
// Adapte les cartes 540px à la largeur réelle de la grille
function scalePreviews() {
  document.querySelectorAll('#grid .wrap').forEach(w => { w.firstChild.style.transform = `scale(${w.clientWidth / CARD_W})`; });
}
addEventListener('resize', scalePreviews);

function selectCard(id) {
  state.selected = id;
  document.querySelectorAll('#grid .wrap').forEach(w => w.classList.remove('ring-4', 'ring-[#FF4F8B]'));
  $(`#grid [data-id="${id}"] .wrap`).classList.add('ring-4', 'ring-[#FF4F8B]');
  $('#sheet-style').textContent = STYLES.find(s => s.id === id).label;
  updateSheet(); $('#sheet').hidden = false;
}

function updateSheet() {
  $('#formats').innerHTML = FORMATS.map(([k, l]) =>
    `<button type="button" data-f="${k}" aria-pressed="${state.format === k}" class="seg flex-1 rounded-xl border border-[#E5DAF7] py-2 font-semibold">${l}</button>`).join('');
  document.querySelectorAll('#formats button').forEach(b => b.onclick = () => { state.format = b.dataset.f; updateSheet(); });
  $('#sheet-action').textContent = state.paid.has(state.selected)
    ? `Télécharger en HD (${state.format.toUpperCase()})` : `Débloquer pour ${PRICE} FCFA`;
}

$('#sheet-close').onclick = () => { $('#sheet').hidden = true; };
$('#sheet-action').onclick = () => {
  if (state.paid.has(state.selected)) exportCard(state.selected, state.format);
  else openPay();
};

/* ---------- 4. FORMULAIRE ---------- */
// Pastilles de couleurs
$('#palettes').innerHTML = Object.entries(PALETTES).map(([k, p]) =>
  `<button type="button" data-p="${k}" aria-label="${p.label}" aria-pressed="${k === state.palette}" class="chip w-11 h-11 rounded-full" style="background:linear-gradient(135deg,${p.c1},${p.c2})"></button>`).join('');
document.querySelectorAll('.chip').forEach(c => c.onclick = () => {
  state.palette = c.dataset.p;
  document.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', x === c));
});

// Photos : URLs temporaires + miniatures
$('#f-photos').onchange = e => {
  state.files.forEach(URL.revokeObjectURL);
  state.files = [...e.target.files].slice(0, 4).map(f => URL.createObjectURL(f));
  $('#thumbs').innerHTML = state.files.map(u => `<img src="${u}" class="w-14 h-14 rounded-xl object-cover">`).join('');
};

$('#form').onsubmit = async e => {
  e.preventDefault();
  state.data = {
    name: $('#f-name').value.trim(),
    age: $('#f-age').value.trim(),
    message: $('#f-msg').value.trim() || 'Que cette nouvelle année t’apporte joie, santé et réussite !',
    palette: state.palette,
    photos: [...state.files],
  };
  state.paid.clear(); state.selected = null;
  const credit = store.get('credit');           // paiement retrouvé : 1 paiement = 1 carte
  if (credit) { state.paid.set(credit.cardId, credit.token); store.del('credit'); } $('#sheet').hidden = true;
  $('#view-form').hidden = true; $('#view-results').hidden = false;
  await document.fonts.ready;      // évite un premier rendu avec une police de secours
  renderGrid(); scrollTo(0, 0);
};
$('#btn-back').onclick = () => { $('#view-results').hidden = true; $('#view-form').hidden = false; $('#sheet').hidden = true; };

/* ---------- 5. PAIEMENT (KKiaPay + vérification serveur) ---------- */
/* Principe : le widget KKiaPay encaisse, puis NOTRE serveur (/api/verify) vérifie la transaction
   auprès de KKiaPay (statut SUCCESS + montant de 500 FCFA). Seul le serveur délivre le jeton qui
   débloque le téléchargement. Tant que la clé publique n'est pas renseignée, l'app reste en démo. */
const CONFIG = { KKIAPAY_KEY: 'VOTRE_CLE_PUBLIQUE', SANDBOX: true };   // clé PUBLIQUE uniquement
const LIVE = !CONFIG.KKIAPAY_KEY.startsWith('VOTRE');
const api = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(async r => ({ ok: r.ok, status: r.status, ...(await r.json().catch(() => ({}))) }));

// Petit coffre localStorage (sans erreur si indisponible)
const store = {
  get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del: k => { try { localStorage.removeItem(k); } catch {} },
};

const Payment = {
  pending: null,
  init() {
    if (!LIVE) return;
    // Un seul jeu d'écouteurs pour toute la session ; chaque paiement attend dans this.pending
    const end = fn => v => { const p = this.pending; this.pending = null; if (p) fn(p, v); };
    addSuccessListener(end((p, r) => p.resolve(r)));
    addFailedListener(end(p => p.reject(new Error('Paiement refusé ou échoué'))));
    if (typeof addKkiapayCloseListener === 'function')
      addKkiapayCloseListener(end(p => p.reject(new Error('Paiement annulé'))));
  },
  async pay(cardId, phone = '') {
    if (!LIVE) { await sleep(1800); return { token: 'SIM-' + Date.now() }; }        // démo
    const r = await new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      openKkiapayWidget({ amount: PRICE, api_key: CONFIG.KKIAPAY_KEY, sandbox: CONFIG.SANDBOX, phone, data: cardId, theme: '#FF4F8B' });
    });
    if (typeof closeKkiapayWidget === 'function') closeKkiapayWidget();
    // On garde la trace AVANT de vérifier : si la page se ferme ou si le réseau coupe, on pourra reprendre
    store.set('pendingTx', { transactionId: r.transactionId, cardId, at: Date.now() });
    const v = await api('/api/verify', { transactionId: r.transactionId, cardId });  // confirmation côté serveur
    if (!v.ok || !v.token) throw new Error(v.error || 'Paiement non confirmé');
    store.del('pendingTx');
    return v;
  },
  // Au chargement : reprend un paiement interrompu et garde le déblocage pour la prochaine génération
  async recover() {
    const p = store.get('pendingTx');
    if (!LIVE || !p) return;
    const v = await api('/api/verify', p);
    if (v.ok && v.token) {
      store.set('credit', { cardId: p.cardId, token: v.token }); store.del('pendingTx');
      toast('Paiement retrouvé : recréez votre carte, elle sera déjà débloquée.');
    } else if (v.status === 400 || v.status === 409 || Date.now() - p.at > 24 * 3600 * 1000) store.del('pendingTx');
  },
  // Revalide le jeton juste avant chaque téléchargement
  async check(cardId, token) { return !LIVE || (await api('/api/check', { cardId, token })).ok; },
};
Payment.init(); Payment.recover();

async function startPayment(phone = '') {
  try {
    const res = await Payment.pay(state.selected, phone);
    state.paid.set(state.selected, res.token);      // déblocage uniquement après confirmation du serveur
    closePay(); renderGrid(); selectCard(state.selected);
    toast('Paiement confirmé. Votre carte est prête.');
  } catch (err) {
    if (LIVE) toast(err.message || 'Le paiement a échoué.'); else $('#pay-msg').textContent = err.message;
  }
}

// Interface de démonstration (visible seulement sans clé KKiaPay)
$('#ops').innerHTML = OPERATORS.map(([k, l]) =>
  `<button type="button" data-op="${k}" aria-pressed="${k === state.operator}" class="seg rounded-xl border border-[#E5DAF7] py-3 font-semibold">${l}</button>`).join('');
document.querySelectorAll('#ops button').forEach(b => b.onclick = () => {
  state.operator = b.dataset.op;
  document.querySelectorAll('#ops button').forEach(x => x.setAttribute('aria-pressed', x === b));
  $('#pay-phone').hidden = state.operator === 'card';
});

const openPay = () => { if (LIVE) return startPayment(); $('#pay-msg').textContent = ''; $('#pay').hidden = false; };
const closePay = () => { $('#pay').hidden = true; };
$('#pay-close').onclick = closePay;

$('#pay-form').onsubmit = async e => {
  e.preventDefault();
  const phone = $('#pay-phone').value.replace(/\D/g, '');
  if (state.operator !== 'card' && phone.length < 8) { $('#pay-msg').textContent = 'Entrez un numéro valide (8 chiffres ou plus).'; return; }
  const btn = $('#pay-submit'); btn.disabled = true; btn.textContent = 'Validation en cours…'; $('#pay-msg').textContent = '';
  await startPayment(phone);
  btn.disabled = false; btn.textContent = `Payer ${PRICE} FCFA`;
};

/* ---------- 6. EXPORT HD ---------- */
async function exportCard(id, fmt) {
  if (!state.paid.has(id)) return openPay();        // garde-fou : jamais sans paiement
  if (!(await Payment.check(id, state.paid.get(id)))) {   // le serveur revalide le jeton
    state.paid.delete(id); renderGrid(); selectCard(id); return toast('Accès expiré : veuillez payer à nouveau.');
  }
  const btn = $('#sheet-action'); btn.disabled = true; btn.textContent = 'Préparation…';
  const host = $('#offscreen'); host.innerHTML = '';
  const el = buildCard(id, false); host.appendChild(el);    // version propre, sans filigrane
  try {
    await document.fonts.ready;
    const canvas = await html2canvas(el, { scale: EXPORT_SCALE, useCORS: true, backgroundColor: '#ffffff' });
    const file = `carte-${state.data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${id}`;
    if (fmt === 'pdf') {
      const pdf = new jspdf.jsPDF({ unit: 'px', format: [CARD_W, CARD_H], orientation: 'portrait' });
      pdf.addImage(canvas.toDataURL('image/jpeg', .95), 'JPEG', 0, 0, CARD_W, CARD_H);
      pdf.save(file + '.pdf');
    } else {
      const mime = fmt === 'jpeg' ? 'image/jpeg' : 'image/png';
      canvas.toBlob(b => {
        const a = document.createElement('a'); a.href = URL.createObjectURL(b);
        a.download = file + (fmt === 'jpeg' ? '.jpg' : '.png'); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }, mime, .95);
    }
  } catch (err) { toast('Export impossible. Réessayez.'); }
  finally { host.innerHTML = ''; btn.disabled = false; updateSheet(); }
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3200);
}

/* ---------- 7. PWA ---------- */
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(console.warn));
}
