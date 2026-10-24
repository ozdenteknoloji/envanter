// Kullanım: node gonder.js sabah|aksam   (GitHub Actions çalıştırır; FIREBASE_SERVICE_ACCOUNT gizli anahtarı gerekir)
import admin from 'firebase-admin';
import { hesapKur } from '../hesap.js';

const mod = process.argv[2] || 'sabah';
const kuru = process.env.KURU === '1'; // gönderme, sadece yaz
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const fmt = n => String(Math.round(n * 100) / 100).replace('.', ',');

const urunler = (await db.doc('genel/urunler').get()).data()?.u || {};
const subeler = {}; (await db.collection('subeler').get()).forEach(d => subeler[d.id] = d.data());
const cihazlar = (await db.collection('cihazlar').get()).docs.map(d => d.data());
console.log(`mod=${mod} cihaz=${cihazlar.length} sube=${Object.keys(subeler).length}`);

async function subeMesaj(id) {
  const sb = subeler[id]; if (!sb) return null;
  const S = { urunler, subeler, subeId: id, sayimlar: [], irsaliyeler: [] };
  const sonSayim = new Date(Date.now() - 20 * 864e5).toISOString().slice(0, 10);
  (await db.collection('sayimlar').where('sube', '==', id).get()).forEach(d => { const v = d.data(); if (v.tarih >= sonSayim) S.sayimlar.push({ id: d.id, ...v }); });
  S.irsaliyeler = (await db.collection('irsaliyeler').where('sube', '==', id).get()).docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.tarih.localeCompare(a.tarih) || (b.zaman || '').localeCompare(a.zaman || ''));
  const H = hesapKur(S);
  if (mod === 'aksam') {
    const e = H.eksikIrsaliyeler(sb); if (!e.length) return null;
    return { title: `${sb.ad || id}: irsaliye girilmedi`, body: `${e.map(x => x.sevk.split('-').reverse().slice(0, 2).join('.')).join(', ')} sevkiyatının irsaliyesi henüz girilmemiş.`, tag: 'irs' };
  }
  const R = H.bugun(), Y = H.gunEkle(R, 1), bugunSkt = [], yarinSkt = [], atik = [];
  for (const u of Object.keys(urunler)) {
    const x = urunler[u]; if (x.aktif === false || !x.sktGun) continue;
    let d; try { d = H.sktDurum(u); } catch { continue; }
    if (!d || d.sayimYok) continue;
    const ad = x.ad || u, bi = x.birim || '';
    // atık: süresi bitmiş stok
    if (d.atik > 0) atik.push(`${ad} ${fmt(d.atik)}${bi ? ' ' + bi : ''}`);
    for (const p of d.gecerli) if (p.a > 0) { if (p.son === R) bugunSkt.push(`${ad} ${fmt(p.a)}`); else if (p.son === Y) yarinSkt.push(`${ad} ${fmt(p.a)}`); }
  }
  if (!bugunSkt.length && !yarinSkt.length && !atik.length) return { title: `${sb.ad || id}: SKT özeti`, body: 'Bugün SKT yok ✓', tag: 'skt', temiz: true };
  const par = [];
  if (atik.length) par.push('Atık: ' + atik.join(', '));
  if (bugunSkt.length) par.push('Bugün SKT: ' + bugunSkt.join(', '));
  if (yarinSkt.length) par.push('Yarın SKT: ' + yarinSkt.join(', '));
  return { title: `${sb.ad || id}: SKT özeti`, body: par.join(' · '), tag: 'skt' };
}

// Şube başına bir kez hesapla, her cihaza ilgili şubelerin mesajını gönder
const cache = {};
const sil = [];
for (const c of cihazlar) {
  const ids = c.admin ? Object.keys(subeler) : (c.subeler || []);
  const msg = [];
  for (const id of ids) { if (!(id in cache)) cache[id] = await subeMesaj(id).catch(e => (console.error(id, e.message), null)); if (cache[id]) msg.push(cache[id]); }
  if (c.test) msg.push({ title: 'Envanter', body: 'Deneme bildirimi: bildirimler çalışıyor ✓', tag: 'test' });
  if (!msg.length) continue;
  if (mod === 'sabah' && msg.length > 1) { // birden çok şube: SKT'si olmayanlar tek satırda
    const dolu = msg.filter(m => !m.temiz), temiz = msg.filter(m => m.temiz);
    if (!dolu.length) { msg.length = 0; msg.push({ title: 'SKT özeti', body: 'Bugün hiçbir şubede SKT yok ✓' }); }
    else if (temiz.length) { msg.length = 0; msg.push(...dolu, { title: 'Diğerleri', body: 'SKT yok ✓' }); }
  }
  const title = msg.length === 1 ? msg[0].title : `Envanter: ${msg.length} şube`;
  const body = msg.length === 1 ? msg[0].body : msg.map(m => m.title.split(':')[0] + ' – ' + m.body).join('\n');
  console.log(`-> ${c.ad}: ${title} | ${body}`);
  if (kuru) continue;
  try { await admin.messaging().send({ token: c.token, data: { title, body, tag: mod, url: './' }, webpush: { headers: { Urgency: 'high', TTL: '7200' } } }); if (c.test) await db.doc('cihazlar/' + c.token).update({ test: null }); }
  catch (e) { console.error('hata', c.ad, e.code); if (/registration-token-not-registered|invalid-argument|invalid-registration/.test(e.code || '')) sil.push(c.token); }
}
for (const t of sil) await db.doc('cihazlar/' + t).delete();
console.log('bitti');
