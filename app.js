import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, createUserWithEmailAndPassword,
  updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  onSnapshot, collection, writeBatch, query, where, deleteField, addDoc, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, GIRIS_ALANI, VAPID_KEY } from "./config.js?v=3";
import { hesapKur } from "./hesap.js?v=2";

/* ================= Firebase ================= */
const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
// Soğuk hava deposunda çekmeyebilir: yazılanlar telefonda tutulur, internet gelince gönderilir.
const db = initializeFirestore(fbApp, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
let ikincil = null; const ikincilAuth = () => (ikincil ||= getAuth(initializeApp(firebaseConfig, 'ikincil')));

/* ================= Yardımcılar ================= */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ascii = s => String(s || '').toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/i̇/g, 'i');
const kadiNorm = s => ascii(s).replace(/[^a-z0-9._-]/g, '');
const eposta = k => `${kadiNorm(k)}@${GIRIS_ALANI}`;
const slug = s => ascii(s).replace(/[^a-z0-9]+/g, '').slice(0, 24) || 'x';
const yeniId = p => p + Math.random().toString(36).slice(2, 8);
const bugun = () => new Date().toLocaleDateString('sv-SE');
// İş günü: dükkanlar gece kapandığı için 00:00–06:00 arası yapılan sayım bir önceki günün sayımıdır.
// İş günü: belirli saate kadar bir önceki gün sayılır (sayım tarihi ve sipariş günleri). Saat Ayarlar → Sistem ayarları → Gün değişim saati (varsayılan 12:00).
const gunSaat = () => { const n = parseInt(S.ayar && S.ayar.gunSaat, 10); return n >= 0 && n <= 23 ? n : 12; };
const isGunuAt = h => { const d = new Date(); if (d.getHours() < h) d.setDate(d.getDate() - 1); return d.toLocaleDateString('sv-SE'); };
const isGunu = () => isGunuAt(gunSaat());
const GUNU = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const AYK = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const haftaGunu = s => (new Date(s + 'T12:00').getDay() + 6) % 7; // 0 = Pazartesi
const trTarih = s => { const [y, m, d] = s.split('-'); return `${+d} ${AYK[+m - 1]} ${GUNU[haftaGunu(s)]}`; };
const saat = iso => iso ? new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
const r6 = n => Math.round(n * 1e6) / 1e6;
const sayiOku = s => { if (s == null) return null; s = String(s).trim().replace(/\s/g, ''); if (!s) return null; if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); const n = parseFloat(s); return isNaN(n) ? null : n; };
const yaz = n => n == null ? '' : String(r6(n)).replace('.', ',');
const fmt = (n, birim) => { if (n == null || isNaN(n)) return '–'; n = r6(n); return n.toLocaleString('tr-TR', { maximumFractionDigits: birim === 'adet' ? 2 : 3 }); };
const TUR = { gunluk: 'Günlük', haftalik: 'Haftalık' };
const YON = { koli: 'Koli', tarti: 'Tartı', adet: 'Adet' };
function toast(msg, err) { const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg; $('#toastRoot').replaceChildren(t); clearTimeout(toast.t); toast.t = setTimeout(() => t.remove(), err ? 4500 : 2200); }
function hataMetni(e) { const c = (e && e.code) || ''; if (c.includes('permission')) return 'Bu işlem için yetkiniz yok.'; if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'Kullanıcı adı ya da şifre yanlış.'; if (c.includes('email-already')) return 'Bu kullanıcı adı zaten var.'; if (c.includes('weak-password')) return 'Şifre en az 6 karakter olmalı.'; if (c.includes('unavailable') || c.includes('network')) return 'İnternet bağlantısı yok.'; return (e && e.message) || 'Bir hata oluştu.'; }
const hata = e => { console.error(e); toast(hataMetni(e), true); };
function openSheet(html, onMount) { const bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.innerHTML = `<div class="sheet">${html}</div>`; bg.addEventListener('click', e => { if (e.target === bg) closeSheet(); }); $('#sheetRoot').replaceChildren(bg); onMount && onMount(bg.firstElementChild); }
const closeSheet = () => $('#sheetRoot').replaceChildren();
async function onayla(msg, evet = 'Evet') { return new Promise(res => { openSheet(`<h2>Emin misiniz?</h2><p class="note" style="font-size:14px">${msg}</p><div class="btns"><button class="btn alt" id="hy">Vazgeç</button><button class="btn" id="he">${esc(evet)}</button></div>`, el => { el.querySelector('#hy').onclick = () => { closeSheet(); res(false); }; el.querySelector('#he').onclick = () => { closeSheet(); res(true); }; }); }); }

/* ================= Durum ================= */
const S = { ai: {}, ayar: {}, ayarYuklendi: false, eslesme: {}, irsaliyeler: [], siparisler: [],
  user: null, me: null, meYuklendi: false, kurulumVar: null,
  urunler: {}, urunYuklendi: false, subeler: {}, kullanicilar: [],
  subeId: null, sayimlar: [], tab: 'sayim', ar: null, syId: null, sonucId: null,
  f: null, buf: null, ek: null, unsub: {}, temizlendi: {}
};
const admin = () => S.me && S.me.rol === 'admin';
const benAd = () => (S.me && (S.me.ad || S.me.kullaniciAdi)) || '';
const subeIds = () => admin() ? Object.keys(S.subeler).filter(id => S.subeler[id].aktif !== false).sort((a, b) => S.subeler[a].ad.localeCompare(S.subeler[b].ad, 'tr')) : (S.me?.subeler || []).filter(id => S.subeler[id]);
const sube = () => S.subeler[S.subeId];
const urunAd = id => S.urunler[id]?.ad || '?';
const urunlerSirali = () => Object.entries(S.urunler).map(([id, u]) => ({ id, ...u })).sort((a, b) => (a.sira ?? 999) - (b.sira ?? 999) || a.ad.localeCompare(b.ad, 'tr'));

/* ================= Gezinme (telefonun geri tuşu çalışsın) ================= */
const gecmis = [];
function go(patch) { commitBuf(); gecmis.push({ tab: S.tab, ar: S.ar, syId: S.syId }); history.pushState({ n: gecmis.length }, ''); Object.assign(S, patch); S.f = null; S.buf = null; render(); window.scrollTo(0, 0); }
window.addEventListener('popstate', () => { const p = gecmis.pop(); if (!p) return; commitBuf(); closeSheet(); Object.assign(S, p); S.f = null; S.buf = null; render(); });
// Geri: geçmiş varsa tarayıcı geri; yenilemeden sonra geçmiş boşsa bir üst ekrana (sayım listesi) dön
const geri = () => { if (gecmis.length) return history.back(); commitBuf(); closeSheet(); S.syId = null; S.ar = null; S.f = null; S.buf = null; render(); };
function setTab(t) { commitBuf(); gecmis.length = 0; S.tab = t; S.ar = null; S.syId = null; S.f = null; render(); window.scrollTo(0, 0); }

/* ================= Giriş ================= */
onAuthStateChanged(auth, async u => {
  for (const f of Object.values(S.unsub)) try { f(); } catch (e) { }
  S.gor = GOR0.v; S.gorYuklendi = false; S.unsub = {}; S.user = u; S.subeSecildi = false; S.me = null; S.tab = 'sayim'; S.ar = null; S.syId = null; S.sonucId = null; S.subeId = null; S.f = null; S.buf = null; gecmis.length = 0; S.meYuklendi = false; S.subeler = {}; S.sayimlar = []; S.urunler = {}; S.urunYuklendi = false;
  if (!u) return render();
  S.unsub.me = onSnapshot(doc(db, 'kullanicilar', u.uid), async s => {
    S.me = s.exists() ? s.data() : null; S.meYuklendi = true;
    if (!S.me) { try { S.kurulumVar = (await getDoc(doc(db, 'sistem', 'kurulum'))).exists(); } catch (e) { S.kurulumVar = true; } return render(); }
    if (S.me.aktif === false) return render();
    baglan();
  }, e => { S.meYuklendi = true; hata(e); render(); });
  render();
});
function baglan() {
  if (!S.unsub.ayar) S.unsub.ayar = onSnapshot(doc(db, 'genel', 'ayar'), s => { S.ayar = (s.exists() && s.data()) || {}; S.ayarYuklendi = true; eskiIrsaliyeleriSil(); }, () => { });
  if (!S.unsub.ai) S.unsub.ai = onSnapshot(doc(db, 'genel', 'ai'), s => { S.ai = (s.exists() && s.data()) || {}; }, () => { });
  if (!S.unsub.esl) S.unsub.esl = onSnapshot(doc(db, 'genel', 'eslesme'), s => { S.eslesme = (s.exists() && s.data().m) || {}; }, () => { });
  if (!S.unsub.urun) S.unsub.urun = onSnapshot(doc(db, 'genel', 'urunler'), s => { S.urunler = (s.exists() && s.data().u) || {}; S.urunDuzen = (s.exists() && s.data().duzen) || 0; S.urunYuklendi = true; adlariDuzenle(); gunlukTasi(); siparisKur(); grupKur(); render(); }, hata);
  for (const k of Object.keys(S.unsub)) if (k.startsWith('sb:')) { S.unsub[k](); delete S.unsub[k]; }
  if (admin()) {
    S.unsub['sb:*'] = onSnapshot(collection(db, 'subeler'), s => { S.subeler = {}; s.forEach(d => S.subeler[d.id] = d.data()); S.subelerYuklendi = true; subeSec(); gunlukTasi(); siparisKur(); grupKur(); render(); }, hata);
    if (!S.unsub.kul) S.unsub.kul = onSnapshot(collection(db, 'kullanicilar'), s => { S.kullanicilar = s.docs.map(d => ({ uid: d.id, ...d.data() })); render(); }, hata);
  } else {
    S.subeler = {};
    const gelen = new Set(); const toplam = (S.me.subeler || []).length;
    for (const id of S.me.subeler || []) S.unsub['sb:' + id] = onSnapshot(doc(db, 'subeler', id), s => { if (s.exists()) S.subeler[id] = s.data(); else delete S.subeler[id]; gelen.add(id); if (gelen.size >= toplam) S.subelerYuklendi = true; subeSec(); render(); }, hata);
  }
  render();
}
function subeSec(id) {
  const ids = subeIds();
  if (id) { try { localStorage.setItem('env_sube', id); } catch (e) { } }
  let hedef = id || S.subeId; if (!hedef || !ids.includes(hedef)) { let k = null; try { k = localStorage.getItem('env_sube'); } catch (e) { } hedef = ids.includes(k) ? k : ids[0]; }
  if (hedef === S.subeId && S.unsub.sy) return;
  S.subeId = hedef || null; S.sayimlar = []; S.syId = null; S.sonucId = null;
  if (S.unsub.sy) { S.unsub.sy(); delete S.unsub.sy; }
  if (S.unsub.irs) { S.unsub.irs(); delete S.unsub.irs; } S.irsaliyeler = [];
  if (S.unsub.sip) { S.unsub.sip(); delete S.unsub.sip; } S.siparisler = [];
  if (!S.subeId) return;
  const sid = S.subeId;
  S.unsub.sip = onSnapshot(query(collection(db, 'siparisler'), where('sube', '==', sid)), s => {
    if (sid !== S.subeId) return; S.siparisler = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.tarih.localeCompare(a.tarih));
    if (!S.temizlendi['s' + sid]) { S.temizlendi['s' + sid] = 1; const eski = S.siparisler.filter(x => x.tarih < gunEkle(bugun(), -14)); if (eski.length) { const b = writeBatch(db); eski.forEach(x => b.delete(doc(db, 'siparisler', x.id))); b.commit().catch(() => { }); } }
    if (!(S.tab === 'siparis' && document.activeElement && document.activeElement.closest && document.activeElement.closest('.sp'))) render();
  }, () => { });
  S.unsub.irs = onSnapshot(query(collection(db, 'irsaliyeler'), where('sube', '==', sid)), s => {
    if (sid !== S.subeId) return; S.irsaliyeler = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.tarih.localeCompare(a.tarih) || (b.zaman || '').localeCompare(a.zaman || ''));
    eskiIrsaliyeleriSil(); render();
  }, hata);
  S.unsub.sy = onSnapshot(query(collection(db, 'sayimlar'), where('sube', '==', sid)), s => {
    if (sid !== S.subeId) return;
    S.sayimlar = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.id.localeCompare(a.id));
    sayimlariDuzenle(); render();
  }, hata);
}
// Son 7 günden eski sayımlar silinir (veri büyümesin).
const GUNLUK_VARSAYILAN = ['7 HAMUR', '10 HAMUR', '13 HAMUR', 'PAN HAMUR', '10 TABAN', '13 TABAN', 'SUCUK', 'SOSİS', 'PEPPERONİ', 'JAMBON', 'PASTIRMA', 'MANGAL SUCUK', 'KÜP SUCUK', 'TANDIR ETİ', 'MOZZARELLA', 'ÇUBUK MOZZARELLA', 'CHEDDAR PEYNİRİ', 'ERİTME PEYNİRİ', 'PATATES', 'FİNGERS', 'TAVUK PARÇALARI', 'ÇITIR TAVUK TOPLARI', 'KÖFTE', 'SUFLE', 'PİZZA SOSU', 'MANTAR', 'TON BALIĞI', 'SİYAH ZEYTİN'];
// Bir kez: şubelerin eski "günlük sayım listesi"ndeki ürünler ürün düzeyinde "Günlük" işaretlenir.
let gunlukTasindi = false;
const SIPARIS_KOLI = {"7 HAMUR": 12, "13 HAMUR": 6, "10 HAMUR": 10, "PAN HAMUR": 6, "PASTIRMA": 4, "PEPPERONİ": 10, "SUCUK": 10, "SOSİS": 10, "TAVUK PARÇALARI": 1.5, "MOZZARELLA": 12, "PİZZA SOSU": 10, "MANTAR": 2, "ÇITIR TAVUK TOPLARI": 2.25, "TON BALIĞI": 1.248, "SİYAH ZEYTİN": 8, "JAMBON": 10, "10 TABAN": 24, "13 TABAN": 16, "PATATES": 2.5, "FİNGERS": 1, "CHEDDAR PEYNİRİ": 3.8, "TANDIR ETİ": 1.8, "ÇUBUK MOZZARELLA": 0.25, "SUFLE": 36, "MANGAL SUCUK": 3, "KÜP SUCUK": 3, "KÖFTE": 0.55, "ERİTME PEYNİRİ": 1, "PİZZA KUTUSU 10": 100, "PİZZA KUTUSU 12,5": 50, "PİZZA KUTUSU 14,5": 50};
const TAKVIM_GRUP = [{ ad: ['serik', 'belek', 'legends', 'manavgat', 'kumkoy', 'ilkbahar'], t: [{ gun: 0, sure: 5 }, { gun: 3, sure: 6 }] }, { ad: ['dosemealti', 'altinkale', 'yildiz'], t: [{ gun: 1, sure: 5 }, { gun: 4, sure: 6 }] }];
const takvimVarsayilan = ad => { const a = ascii(ad).replace(/[^a-z]/g, ''); const g = TAKVIM_GRUP.find(g => g.ad.some(x => a.includes(x))); return g ? g.t : null; };
const ICECEK_RE = /KOLA|FANTA|SPRITE|AYRAN|FUSE TEA|CAPPY|MONSTER|SCHWEPPES|\bSU\b|LİMONATA|GAZOZ|MEYVE SUYU/;
const icecekMi = u => ICECEK_RE.test(ascii(S.urunler[u]?.ad || '').toUpperCase().replace(/I/g, 'İ')) || ICECEK_RE.test((S.urunler[u]?.ad || '').toUpperCase());
function icecekAyir(k) { const sat = (k.satirlar || []).map(x => x.g == null && icecekMi(x.u) ? { ...x, g: 'i' } : x); return { ...k, gruplu: true, satirlar: [...sat.filter(x => x.g !== 'i'), ...sat.filter(x => x.g === 'i')] }; }
const grupKuruldu = new Set();
function grupKur() { // Walk-in'de ürünler/içecekler ayrı başlık; bir kez, gruplu alanı hiç yazılmamış konumlara
  if (!admin() || !S.urunYuklendi || !S.subelerYuklendi || !Object.keys(S.urunler).length) return;
  for (const [sid, sb] of Object.entries(S.subeler)) { if (grupKuruldu.has(sid)) continue; if (!(sb.konumlar || []).some(k => k.gruplu === undefined && /walk/.test(ascii(k.ad)))) continue; grupKuruldu.add(sid);
    const yeni = sb.konumlar.map(k => k.gruplu === undefined && /walk/.test(ascii(k.ad)) ? icecekAyir(k) : k); sb.konumlar = yeni; subeKaydet(sid, { konumlar: yeni }); }
}
let siparisKuruldu = false;
function siparisKur() {
  if (siparisKuruldu || !admin() || !S.urunYuklendi || !S.subelerYuklendi || !Object.keys(S.urunler).length) return; siparisKuruldu = true;
  if ((S.urunDuzen || 0) < 6) { const p = { duzen: 6 }; const v0 = S.urunDuzen || 0; if (v0 < 4) { for (const [id, x] of Object.entries(S.urunler)) { const k = SIPARIS_KOLI[x.ad]; if (k != null && x.siparis == null) { p[`u.${id}.siparis`] = true; if (x.sKoli == null) p[`u.${id}.sKoli`] = k; } } } if (v0 < 5) for (const [id, x] of Object.entries(S.urunler)) if (x.dara != null) p[`u.${id}.dara`] = deleteField();
    if (v0 < 5) for (const [sid, sb] of Object.entries(S.subeler)) if ((sb.konumlar || []).some(k => (k.satirlar || []).some(x => x.d != null))) subeKaydet(sid, { konumlar: sb.konumlar.map(k => ({ ...k, satirlar: (k.satirlar || []).map(({ d, ...x }) => x) })) });
    updateDoc(doc(db, 'genel', 'urunler'), p).catch(() => { siparisKuruldu = false; }); }
  for (const [sid, sb] of Object.entries(S.subeler)) if (!sb.takvim) { const t = takvimVarsayilan(sb.ad); if (t) { sb.takvim = t; subeKaydet(sid, { takvim: t }); } }
}
function gunlukTasi() {
  if (gunlukTasindi || !admin() || !S.urunYuklendi || !S.subelerYuklendi || (S.urunDuzen || 0) >= 3 || !Object.keys(S.urunler).length) return; gunlukTasindi = true;
  const g = new Set(); Object.values(S.subeler).forEach(sb => (sb.gunluk || []).forEach(u => g.add(u))); const p = { duzen: 3 };
  for (const [id, x] of Object.entries(S.urunler)) if ((g.has(id) || GUNLUK_VARSAYILAN.includes(x.ad)) && !x.gunluk) { p[`u.${id}.gunluk`] = true; x.gunluk = true; }
  updateDoc(doc(db, 'genel', 'urunler'), p).catch(() => { gunlukTasindi = false; });
}
function gunlukKur() { return; // her şubede günlük liste bir kez, boşsa doldurulur
  if (!admin() || !S.urunYuklendi) return; const adId = {}; Object.entries(S.urunler).forEach(([id, x]) => { if (x.aktif !== false) adId[x.ad] = id; });
  for (const [sid, s] of Object.entries(S.subeler)) {
    if (s.gunlukKuruldu || (s.gunluk || []).length) continue; const var_ = subedekiUrunler(s); const l = GUNLUK_VARSAYILAN.map(a => adId[a]).filter(u => u && var_.has(u));
    if (!l.length) continue; s.gunlukKuruldu = true; s.gunluk = l; subeKaydet(sid, { gunluk: l, gunlukKuruldu: true });
  }
}
// Saklama: her türden (günlük / haftalık) sadece son bitmiş sayım + bugünün devam eden sayımı kalır.
// Önceki günlerden bitirilmeden kalmış sayım kendiliğinden bitirilmiş sayılır.
function sayimlariDuzenle(zorla) {
  if ((!zorla && S.temizlendi[S.subeId]) || !S.sayimlar.length) return; S.temizlendi[S.subeId] = 1;
  const bg = isGunu(); const b = writeBatch(db); let n = 0;
  for (const tur of ['gunluk', 'haftalik']) {
    const l = S.sayimlar.filter(x => x.tur === tur);
    for (const x of l) if (x.durum !== 'bitti' && x.tarih < bg) { Object.assign(x, { durum: 'bitti', bitis: x.son || x.basla, bitiren: 'otomatik' }); b.update(doc(db, 'sayimlar', x.id), { durum: 'bitti', bitis: x.bitis, bitiren: 'otomatik' }); n++; }
    const biten = l.filter(x => x.durum === 'bitti').sort((a, c) => c.tarih.localeCompare(a.tarih) || (c.bitis || '').localeCompare(a.bitis || ''));
    for (const x of biten.slice(1)) { b.delete(doc(db, 'sayimlar', x.id)); n++; }
  }
  if (n) b.commit().catch(() => { });
}

/* İçecek adları tek düzen: önce boyut/ambalaj, sonra ad (eski kayıtlar bir kez yeniden adlandırılır). */
const AD_DUZEN = {"KOLA 1 LT": "1 LT KOLA", "KOLA KUTU": "KUTU KOLA", "DIET KOLA 1 LT": "1 LT DIET KOLA", "DIET KOLA KUTU": "KUTU DIET KOLA", "ZERO KOLA 1 LT": "1 LT ZERO KOLA", "ZERO KOLA KUTU": "KUTU ZERO KOLA", "FANTA 1 LT": "1 LT FANTA", "FANTA KUTU": "KUTU FANTA", "SPRITE 1 LT": "1 LT SPRITE", "SPRITE KUTU": "KUTU SPRITE", "AYRAN 1 LT": "1 LT AYRAN", "AYRAN 300 ML": "300 ML AYRAN", "AYRAN 200 ML": "200 ML AYRAN", "FUSE TEA ŞEFTALİ": "KUTU FUSE TEA ŞEFTALİ", "FUSE TEA LİMON": "KUTU FUSE TEA LİMON", "FUSE TEA MANGO": "KUTU FUSE TEA MANGO", "1LT FUSETEA LİMON": "1 LT FUSE TEA LİMON", "1LT FUSETEA ŞEFTALİ": "1 LT FUSE TEA ŞEFTALİ", "MONSTER ENERGY": "KUTU MONSTER ENERGY", "MONSTER ULTRA": "KUTU MONSTER ULTRA", "CAPPY KARIŞIK": "KUTU CAPPY KARIŞIK", "SWEPS LİMON": "1 LT SCHWEPPES BİTTER LİMON", "SWEPS PORTAKAL": "1 LT SCHWEPPES MANDALİNA", "SU": "500 ML DAMLA SU", "DOMİNOS SOS 530 GR.": "DOMİNOS SOS", "KETCAP 550G": "KETÇAP", "MAYONEZ 550 GR": "MAYONEZ", "CHEDDAR SOS 790 GR": "CHEDDAR SOS"}
// Yanlışlıkla eklenen kopyalar (XL YOĞURT / XL DOMİNOS ile aynı): bir kez kaldırılır.
const KOPYALAR = ["YOĞURTLU SOS 80G", "DOMİNOS SOS 80 GR"];
// Listede yoksa bir kez eklenen ürünler (kaldırılırsa geri gelmez).
const YENI_URUNLER = [{ ad: "PET 450 ML KOLA", birim: "adet", koliIci: 12 }, { ad: "PET 450 ML ZERO KOLA", birim: "adet", koliIci: 12 }, { ad: "KUTU REDBULL KLASİK", birim: "adet", koliIci: null }, { ad: "KUTU REDBULL ŞEFTALİ", birim: "adet", koliIci: null }, { ad: "ALGIDA CLASSICS VANİLYA", birim: "adet", koliIci: null }, { ad: "ALGIDA MARAŞ USULÜ CUP", birim: "adet", koliIci: null }, { ad: "ALGIDA MAX CLASSIC KAKAO", birim: "adet", koliIci: null }, { ad: "MAGNUM MİNİ BADEM", birim: "adet", koliIci: null }, { ad: "CHEDDAR SOS", birim: "kg", koliIci: 0.79 }, { ad: "WAFFLE & KREP KREMA SOS", birim: "kg", koliIci: null }, { ad: "35*35 YAĞLI KAĞIT TABAKA", birim: "kg", koliIci: null }, { ad: "ALÜMİNYUM FOLYO", birim: "adet", koliIci: null }];;
let adDuzenYapildi = false;
function adlariDuzenle() {
  if (adDuzenYapildi || !admin() || !S.urunYuklendi) return; adDuzenYapildi = true;
  const mevcut = new Set(Object.values(S.urunler).map(x => x.ad)); const p = {};
  for (const [id, x] of Object.entries(S.urunler)) { const y = AD_DUZEN[x.ad]; if (y && !mevcut.has(y)) { p[`u.${id}.ad`] = y; mevcut.add(y); } }
  if (S.urunDuzen < 2 && Object.keys(S.urunler).length) { for (const [id, x] of Object.entries(S.urunler)) if (KOPYALAR.includes(x.ad) && x.aktif !== false) { p[`u.${id}.aktif`] = false; p[`u.${id}.kaldirma`] = new Date().toISOString(); } p.duzen = 2; }
  let ek = 0; if (Object.keys(S.urunler).length) { let sira = Math.max(0, ...Object.values(S.urunler).map(x => x.sira ?? 0)); for (const y of YENI_URUNLER) if (!mevcut.has(y.ad)) { p[`u.${yeniId('u')}`] = { ...y, sktGun: null, cozulmeGun: null, aktif: true, sira: ++sira }; mevcut.add(y.ad); ek++; } }
  const ad = Object.keys(p).filter(k => k.endsWith('.ad')).length;
  if (Object.keys(p).length) updateDoc(doc(db, 'genel', 'urunler'), p).then(() => toast([ad ? `${ad} ürün adı düzenlendi` : '', Object.keys(p).some(k => k.endsWith('.aktif')) ? 'kopya XL soslar kaldırıldı' : '', ek ? `${ek} yeni içecek eklendi` : ''].filter(Boolean).join(' · ') + '.')).catch(() => { adDuzenYapildi = false; });
}
/* ================= Çizim ================= */
const GOR0 = { v: (() => { try { return JSON.parse(sessionStorage.getItem('env_gor')); } catch (e) { return null; } })() }; // sayfa yüklenirken bir kez okunur
// Bildirimden gelen yönlendirme: ?git=skt|irs&sube=id
function gitOku(q) { const p = new URLSearchParams(q); if (p.get('git')) S.git = { git: p.get('git'), sube: p.get('sube') }; }
gitOku(location.search);
try { if (location.search.includes('git=')) history.replaceState(null, '', location.pathname); } catch (e) { }
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.git) { gitOku(e.data.git); render(); } });
// Sayfa yenilenince kaldığın yerden devam: sekme, ekran ve açık sayım sessionStorage'dan geri yüklenir
function gorunumGeriYukle() {
  const g = S.gor; S.gor = null; GOR0.v = null; S.gorYuklendi = true;
  if (g.sube && subeIds().includes(g.sube)) { S.subeSecildi = true; if (g.sube !== S.subeId) subeSec(g.sube); }
  if (g.tab && g.tab !== 'sayim' || g.ar || g.syId) { S.tab = g.tab || 'sayim'; S.ar = g.ar || null; S.sonucId = g.sonucId || null;
    if (g.syId) { S.gorSy = g.syId; setTimeout(() => { S.gorSy = null; }, 5000); } }
}
function gitUygula() {
  const g = S.git; S.git = null; S.gor = null; S.gorYuklendi = true;
  if (g.sube && subeIds().includes(g.sube)) { S.subeSecildi = true; subeSec(g.sube); }
  S.tab = 'skt'; S.ar = null; S.syId = null; gecmis.length = 0;
  if (g.git === 'irs') setTimeout(() => { if (S.tab === 'skt') irsaliyeEkle(); }, 150);
  if (g.git === 'skt') setTimeout(() => { if (S.tab === 'skt') ozetPaylas(); }, 150);
}
// SKT özeti resmi (koyu kart): şubeler alt alta, ürün başına renkli nokta
function ozetResmi(parcalar) {
  const W = 520, K = 2, RENK = { atik: ['#dc2626', 'Atık'], bugun: ['#ea580c', 'Bugün son gün'], yarin: ['#d97706', 'Yarın son gün'] };
  const F = 'Inter, Arial, sans-serif'; const T = bugun().split('-').reverse().slice(0, 2).join('.');
  const bloklar = parcalar.map(p => { const sat = []; for (const k of ['atik', 'bugun', 'yarin']) for (const i of p.o?.[k] || []) sat.push({ k, ...i }); return { ad: p.ad, sat, yok: !p.o }; });
  const H = 64 + bloklar.reduce((a, b) => a + 12 + 42 + Math.max(1, b.sat.length) * 40, 0) + 14;
  const cv = document.createElement('canvas'); cv.width = W * K; cv.height = H * K; const c = cv.getContext('2d'); c.scale(K, K);
  c.fillStyle = '#0f172a'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#fff'; c.font = `800 24px ${F}`; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText('SKT Özeti', 22, 36);
  c.fillStyle = '#94a3b8'; c.font = `500 14px ${F}`; c.textAlign = 'right'; c.fillText(T, W - 22, 36);
  let y = 64;
  for (const b of bloklar) {
    y += 12; c.fillStyle = '#1e293b'; c.beginPath(); c.roundRect(16, y, W - 32, 42 + Math.max(1, b.sat.length) * 40, 14); c.fill();
    c.save(); c.clip(); c.fillStyle = '#0b3d73'; c.fillRect(16, y, W - 32, 42); c.restore();
    c.fillStyle = '#fff'; c.font = `800 19px ${F}`; c.textAlign = 'left'; c.fillText(b.ad, 32, y + 21);
    let ry = y + 42;
    if (!b.sat.length) { c.fillStyle = b.yok ? '#94a3b8' : '#4ade80'; c.font = `700 17px ${F}`; c.fillText(b.yok ? 'Özet henüz hazır değil' : '✓ Bugün SKT yok', 32, ry + 20); ry += 40; }
    for (const i of b.sat) {
      c.fillStyle = '#334155'; c.fillRect(32, ry, W - 64, 1);
      c.fillStyle = RENK[i.k][0]; c.beginPath(); c.arc(38, ry + 20, 6, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.font = `500 17px ${F}`; c.textAlign = 'left'; c.fillText(i.a, 54, ry + 20, 230);
      c.font = `800 17px ${F}`; c.textAlign = 'right'; c.fillText(i.q, W - 132, ry + 20);
      c.fillStyle = '#94a3b8'; c.font = `500 12px ${F}`; c.fillText(RENK[i.k][1], W - 30, ry + 20); ry += 40;
    }
    y = ry;
  }
  return new Promise(r => cv.toBlob(r, 'image/png'));
}
// SKT özetini resim olarak WhatsApp'ta paylaş: şube seçilir, resim hazırlanır, Paylaş ile telefonun paylaşım menüsü açılır
function ozetPaylas() {
  const ids = subeIds(); const sec = new Set([S.subeId]);
  openSheet(`<h2>SKT özetini paylaş</h2><p class="note">Şubeleri seçin; hepsi tek resimde olur. Sonra WhatsApp'ı seçip grubu seçersiniz.</p>
    <div class="card">${ids.map(id => `<label class="row" style="display:flex;gap:10px;align-items:center;padding:12px"><input type="checkbox" data-s="${id}" ${sec.has(id) ? 'checked' : ''}><b>${esc(S.subeler[id]?.ad || id)}</b></label>`).join('')}</div>
    <div id="opM" class="note"></div><div id="opR"></div><div class="btns"><button class="btn" id="opG">🖼 Resmi hazırla</button></div>`, el => {
    const m = el.querySelector('#opM'), r = el.querySelector('#opR'), g = el.querySelector('#opG'); let blob = null;
    el.querySelectorAll('[data-s]').forEach(x => x.onchange = () => { blob = null; r.innerHTML = ''; g.textContent = '🖼 Resmi hazırla'; });
    g.onclick = async () => {
      if (blob) { // paylaş (kullanıcı dokunuşuyla)
        const f = new File([blob], 'skt-ozeti.png', { type: 'image/png' });
        try { if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f] }); return; } } catch (e) { if (e.name === 'AbortError') return; }
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'skt-ozeti.png'; a.click(); m.textContent = 'Resim indirildi; WhatsApp\'tan galeriden ekleyin.'; return;
      }
      const secili = [...el.querySelectorAll('[data-s]:checked')].map(x => x.dataset.s);
      if (!secili.length) { m.textContent = 'En az bir şube seçin.'; return; }
      m.textContent = 'Hazırlanıyor…'; const parca = [];
      for (const id of secili) {
        const ad = S.subeler[id]?.ad || id;
        if (id === S.subeId) { parca.push({ ad, o: hesapKur(S).sktOzet() }); continue; }
        try { const d = await getDoc(doc(db, 'ozetler', id)); const v = d.exists() ? d.data() : null; parca.push({ ad, o: v && v.tarih === bugun() && v.o ? v.o : null }); } catch (e) { parca.push({ ad, o: null }); }
      }
      blob = await ozetResmi(parca); m.textContent = parca.some(p => !p.o) ? 'Bazı şubelerin özeti henüz hazır değil (sabah 10:30\'dan sonra oluşur).' : '';
      r.innerHTML = `<img src="${URL.createObjectURL(blob)}" style="width:100%;border-radius:12px;margin:8px 0">`; g.textContent = '💬 WhatsApp\'ta paylaş';
    };
  });
}
/* ================= Ekran kilidi (çift giriş) =================
   Sayım ve sipariş ekranına girince belgeye {kilit:{c: cihaz, kim, t}} yazılır, açıkken 15 sn'de bir tazelenir, çıkınca silinir.
   Başka bir cihaz o belgede taze kilit görürse ekranı salt okunur açar. Kilit 45 sn tazelenmezse (telefon kapandı vb.) düşmüş sayılır.
   "Taze" yerel saatlerden bağımsız: kilidin t değeri son 45 sn'de değişmediyse eski kabul edilir. */
const CIHAZ = (() => { try { let c = sessionStorage.getItem('env_cihaz'); if (!c) { c = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); sessionStorage.setItem('env_cihaz', c); } return c; } catch (e) { return Math.random().toString(36).slice(2, 10); } })();
const KILIT_SN = 45000, KILIT_NABIZ = 15000;
const KILIT = { k: null, sahip: false, al: false, kilitli: false, son: 0 }; const KILIT_GOR = {};
function kilitBelge(k) { if (!k) return null; const i = k.indexOf('/'); const kol = k.slice(0, i), id = k.slice(i + 1); return (kol === 'sayimlar' ? S.sayimlar : S.siparisler).find(x => x.id === id) || null; }
function kilitDurum(k, d) {
  const l = d && d.kilit; if (!l || !l.c || l.c === CIHAZ) { delete KILIT_GOR[k]; return null; }
  const simdi = Date.now(); let g = KILIT_GOR[k];
  if (!g || g.c !== l.c || g.t !== l.t) { if (!g && simdi - (l.t || 0) > 600000) return null; g = KILIT_GOR[k] = { c: l.c, t: l.t, yerel: simdi }; } // 10 dk'dan eski kilit ilk görüşte düşmüş sayılır
  return simdi - g.yerel < KILIT_SN ? l : null;
}
function kilitNesne() { return { c: CIHAZ, kim: benAd(), t: Date.now(), ...(KILIT.al ? { al: true } : {}) }; }
function kilitYaz() {
  const k = KILIT.k; if (!k) return; const i = k.indexOf('/'); const kol = k.slice(0, i), id = k.slice(i + 1); const l = kilitNesne(); KILIT.sahip = true; KILIT.son = Date.now();
  const d = kilitBelge(k); if (d) d.kilit = l; const r = doc(db, kol, id);
  if (kol === 'siparisler') setDoc(r, { sube: S.subeId, tarih: id.slice(S.subeId.length + 1), kilit: l }, { merge: true }).catch(() => { }); else updateDoc(r, { kilit: l }).catch(() => { });
}
function kilitBirak() {
  if (KILIT.k && KILIT.sahip) yedekYaz(KILIT.k, true);
  const k = KILIT.k; const sahip = KILIT.sahip; Object.assign(KILIT, { k: null, sahip: false, al: false, kilitli: false, son: 0 }); if (!k || !sahip) return;
  const i = k.indexOf('/'); const d = (k.startsWith('sayimlar') ? S.sayimlar : S.siparisler).find(x => x.id === k.slice(i + 1)); if (d && d.kilit && d.kilit.c === CIHAZ) delete d.kilit;
  updateDoc(doc(db, k.slice(0, i), k.slice(i + 1)), { kilit: deleteField() }).catch(() => { });
}
function kilitTik(cizebilir) {
  if (!KILIT.k) return; const d = kilitBelge(KILIT.k); const kd = kilitDurum(KILIT.k, d);
  if (kd) { if (KILIT.sahip) { KILIT.sahip = false; KILIT.al = false; try { commitBuf(); } catch (e) { } } }
  else if (!KILIT.sahip || Date.now() - KILIT.son > KILIT_NABIZ) kilitYaz();
  if (cizebilir && !!kd !== KILIT.kilitli) { KILIT.kilitli = !!kd; render(); }
}
function kilitSenkron() {
  const k = S.kilitIstek || null;
  if (k !== KILIT.k) { kilitBirak(); if (k) { KILIT.k = k; kilitTik(false); } return; }
  kilitTik(false);
}
const kilitKart = kd => `<div class="card p" style="background:var(--red-soft,#fdecec);border-color:transparent;margin:8px"><b style="color:var(--red)">🔒 Salt okunur</b><p class="note" style="margin:6px 0 8px">${kd.al ? `Kilidi <b>${esc(kd.kim || 'başka biri')}</b> kaldırdı, bu ekran artık salt okunur.` : `<b>${esc(kd.kim || 'Başka biri')}</b> bu ekranı başka bir cihazda şu an düzenliyor.`} Rakamları görebilirsiniz ama değiştiremezsiniz. O çıkınca ekran kendiliğinden açılır.</p><div class="btns" style="margin:0"><button class="btn alt sm" id="kilKal">Kilidi kaldır</button></div></div>`;
async function kilitKaldir() {
  if (!(await onayla('Bu ekranı şu an düzenleyen kişinin ekranı salt okunur olacak, düzenlemeyi siz devralacaksınız.', 'Kilidi kaldır'))) return;
  if (!KILIT.k) return; KILIT.al = true; delete KILIT_GOR[KILIT.k]; kilitYaz(); KILIT.kilitli = false; render();
}
setInterval(() => { kilitTik(true); if (KILIT.k && KILIT.sahip) yedekYaz(KILIT.k); eskiYedekleriSil(); }, 5000);
/* ================= Geçmiş (yedek) =================
   Sipariş ve sayım ekranı açıkken belgenin son hali en fazla 10 dakikada bir (ve ekrandan çıkarken) 'gecmis' koleksiyonuna kopyalanır.
   Boş belge yedeklenmez, böylece yanlışlıkla boşalan kayıt iyi yedeklerin yerine geçmez. Yedekler ayarlardaki gün sayısı kadar saklanır (varsayılan 7).
   Geri dönüşü sadece yönetici yapar. */
const YEDEK_SN = 600000; const yedekSon = {}; let yedekTemizlendi = false;
const yedekGun = () => Math.max(1, Math.min(60, parseInt(S.ayar && S.ayar.gecmisGun, 10) || 7));
const yedekSay = o => Object.keys(o || {}).length; const yedekSayIc = o => Object.values(o || {}).reduce((t, x) => t + yedekSay(x), 0);
const yedekBos = (kol, v) => kol === 'siparisler' ? !(yedekSay(v.ideal) + yedekSay(v.liste) + yedekSay(v.elde)) : !(yedekSayIc(v.v) + yedekSay(v.p) + yedekSayIc(v.d));
const yedekOzet = (kol, v) => kol === 'siparisler' ? `${yedekSay(v.ideal)} ideal · ${yedekSay(v.liste)} liste` : `${yedekSayIc(v.v) + yedekSay(v.p) + yedekSayIc(v.d)} sayım girişi`;
function yedekYaz(k, zorla) {
  try {
    if (!k || !S.subeId) return; const g = yedekSon[k] ||= { t: 0, h: '' }; if (!zorla && Date.now() - g.t < YEDEK_SN) return;
    const d = kilitBelge(k); if (!d) return; const i = k.indexOf('/'); const kol = k.slice(0, i), belge = k.slice(i + 1);
    const h = JSON.stringify(d, (a, v) => (a === 'kilit' || a === 'id') ? undefined : v); const v = JSON.parse(h);
    if (yedekBos(kol, v)) return; if (h === g.h) { g.t = Date.now(); return; }
    g.t = Date.now(); g.h = h;
    addDoc(collection(db, 'gecmis'), { sube: S.subeId, kol, belge, zaman: new Date().toISOString(), kim: benAd(), veri: v }).catch(() => { });
  } catch (e) { }
}
async function eskiYedekleriSil() {
  if (yedekTemizlendi || !S.ayarYuklendi || !S.subeId || !admin()) return; yedekTemizlendi = true;
  try { const kes = new Date(Date.now() - yedekGun() * 864e5).toISOString(); const s = await getDocs(query(collection(db, 'gecmis'), where('zaman', '<', kes), limit(400))); if (s.empty) return; const b = writeBatch(db); s.docs.forEach(x => b.delete(x.ref)); await b.commit(); } catch (e) { }
}
const yedekZamanYaz = iso => { const d = new Date(iso); return `${trTarih(d.toLocaleDateString('sv-SE')).split(' ').slice(0, 2).join(' ')} ${saat(iso)}`; };
function yedekPanel(k) {
  const i = k.indexOf('/'); const kol = k.slice(0, i), belge = k.slice(i + 1);
  openSheet(`<h2>Geçmiş</h2><p class="note">Bu kaydın son ${yedekGun()} günlük yedekleri (en fazla 10 dakikada bir alınır). Birine dönerseniz şu anki hali de önce yedeklenir.</p><div id="ygL"><p class="note">Yükleniyor…</p></div>`, async el => {
    try {
      const sn = await getDocs(query(collection(db, 'gecmis'), where('sube', '==', S.subeId), where('belge', '==', belge)));
      const l = sn.docs.map(x => ({ id: x.id, ...x.data() })).filter(x => x.kol === kol).sort((a, b) => b.zaman.localeCompare(a.zaman)).slice(0, 40);
      el.querySelector('#ygL').innerHTML = l.length ? `<div class="card">${l.map((x, j) => `<button class="row" data-j="${j}"><div class="m"><b>${esc(yedekZamanYaz(x.zaman))}</b><span>${esc(x.kim || '')} · ${yedekOzet(kol, x.veri || {})}</span></div><span class="ch">›</span></button>`).join('')}</div>` : '<p class="note">Henüz yedek yok. Ekranda çalışıldıkça oluşur.</p>';
      el.querySelectorAll('[data-j]').forEach(b => b.onclick = () => yedekGeriDon(k, l[+b.dataset.j]));
    } catch (e) { el.querySelector('#ygL').innerHTML = '<p class="note" style="color:var(--red)">Geçmiş okunamadı. Firestore kurallarına "gecmis" bölümü eklenmemiş olabilir.</p>'; }
  });
}
async function yedekGeriDon(k, e) {
  const i = k.indexOf('/'); const kol = k.slice(0, i), belge = k.slice(i + 1);
  if (!(await onayla(`<b>${esc(yedekZamanYaz(e.zaman))}</b> (${esc(e.kim || '')}) sürümüne dönülecek: ${yedekOzet(kol, e.veri || {})}. Şu anki hali önce yedeklenir.`, 'Bu sürüme dön'))) return;
  yedekYaz(k, true); yedekSon[k] = { t: Date.now(), h: JSON.stringify(e.veri) };
  try { await setDoc(doc(db, kol, belge), kol === 'siparisler' ? { ...e.veri, kim: benAd(), zaman: new Date().toISOString() } : { ...e.veri }); } catch (er) { hata(er); return; }
  S.spTaslak = null; closeSheet(); toast('Eski sürüme dönüldü.'); render();
}
function yedekAyarPanel() {
  openSheet(`<h2>Geçmiş (yedek) süresi</h2><p class="note">Sipariş ve sayım kayıtlarının yedekleri kaç gün saklansın? Eskiler yönetici uygulamayı açınca otomatik silinir. 1–60 arası.</p>
    <label class="field"><span>Gün sayısı</span><input id="ygN" inputmode="numeric" pattern="[0-9]*" value="${yedekGun()}"></label><div class="err" id="ygE"></div><div class="btns"><button class="btn" id="ygK">Kaydet</button></div>`, el => {
    el.querySelector('#ygK').onclick = async () => { const n = parseInt(el.querySelector('#ygN').value, 10); if (!n || n < 1 || n > 60) { el.querySelector('#ygE').textContent = '1 ile 60 arasında bir sayı yazın.'; return; }
      try { await setDoc(doc(db, 'genel', 'ayar'), { gecmisGun: n }, { merge: true }); S.ayar = { ...S.ayar, gecmisGun: n }; closeSheet(); toast(`Yedekler ${n} gün saklanacak.`); render(); } catch (er) { hata(er); } };
  });
}
window.addEventListener('pagehide', () => kilitBirak());
function render() { S.kilitIstek = null; try { render0(); } finally { kilitSenkron(); } }
function render0() {
  const app = $('#app');
  document.body.classList.toggle('editing', !!S.syId);
  if (!S.user) return girisEkrani();
  if (!S.meYuklendi) { app.innerHTML = `<div class="empty"><b>Yükleniyor…</b></div>`; $('#tabs').hidden = true; return; }
  if (!S.me) return hesapYok();
  if (S.me.aktif === false) { app.innerHTML = `<div class="login"><div class="card p"><h3>Hesap kapalı</h3><p class="note">Bu hesap devre dışı bırakılmış.</p><div class="btns"><button class="btn alt" id="cik">Çıkış</button></div></div></div>`; $('#cik').onclick = () => signOut(auth); $('#tabs').hidden = true; return; }
  if (S.gor && !S.git && S.me && S.urunYuklendi && S.subeId && (!S.gor.sube || S.subeler[S.gor.sube])) gorunumGeriYukle();
  if (!S.gor && !S.git && S.me && S.urunYuklendi && S.subeId) S.gorYuklendi = true;
  if (S.gorSy && syBul(S.gorSy)) { S.syId = S.gorSy; S.gorSy = null; }
  if (S.gorYuklendi) { try { sessionStorage.setItem('env_gor', JSON.stringify({ tab: S.tab, ar: S.ar === 'irs' ? null : S.ar, syId: S.syId, sonucId: S.sonucId, sube: S.subeId })); } catch (e) { } }
  if (S.git && S.me && S.urunYuklendi && subeIds().length && (!S.git.sube || S.subeler[S.git.sube])) gitUygula();
  if (!admin() && !S.subeSecildi && S.subelerYuklendi && subeIds().length > 1) return subeSecimEkrani();
  if (S.syId) return editor();
  sekmeler();
  if (S.tab === 'ayarlar') return ayarlar();
  if (!S.urunYuklendi) { app.innerHTML = ust('Envanter') + `<div class="empty"><b>Yükleniyor…</b></div>`; return; }
  if (!S.subeId) { app.innerHTML = ust('Envanter') + `<div class="empty"><b>Şube yok</b>${admin() ? 'Ayarlar → Şubeler bölümünden şube ekleyin.' : 'Hesabınıza şube atanmamış. Yöneticiye haber verin.'}</div>`; bagla(); return; }
  if (S.tab === 'sonuc') { S.tab = 'sayim'; S.ar = 'sonuc'; return sonucEkrani(); }
  if (S.tab === 'siparis') return siparisEkrani();
  if (S.tab === 'skt') return S.ar === 'irs' ? irsaliyeDuzen() : sktEkrani();
  return sayimListesi();
}
function sekmeler() {
  const t = [['sayim', '▦', 'Sayım'], ['skt', '⏱', 'SKT'], ['siparis', '🚚', 'Sipariş'], ['ayarlar', '⚙', S.tabHazir ? 'Tekrar dokun' : 'Ayarlar']];
  $('#tabs').hidden = false;
  $('#tabsIn').innerHTML = t.map(([k, i, a]) => `<button data-tab="${k}" class="${S.tab === k ? 'on' : ''}"><i>${i}</i>${a}</button>`).join('');
  $('#tabsIn').querySelectorAll('button').forEach(b => b.onclick = () => {
    // Şube hesabında yanlışlıkla ayara girilmesin: iki dokunuş
    if (b.dataset.tab === 'ayarlar' && !admin() && S.tab !== 'ayarlar' && !S.tabHazir) { S.tabHazir = true; sekmeler(); clearTimeout(S.tabT); S.tabT = setTimeout(() => { S.tabHazir = false; sekmeler(); }, 2500); return; }
    S.tabHazir = false; clearTimeout(S.tabT); setTab(b.dataset.tab); });
}
function ust(baslik, opt = {}) {
  const ids = subeIds(); const sb = sube();
  const sag = opt.sag ?? (opt.subeSecici !== false && ids.length > 1 && sb ? `<button id="subeBtn">${esc(sb.ad)} ▾</button>` : '') + `<button id="hesapBtn" title="Hesap">☺</button>`;
  return `<header class="top">${opt.geri ? `<button class="back" id="geriBtn">‹</button>` : ''}<h1>${esc(baslik)}${opt.alt ? `<div class="sub">${esc(opt.alt)}</div>` : ''}</h1>${sag}</header>${navigator.onLine === false ? '<div class="off">İnternet yok — yazdıklarınız telefonda tutuluyor, bağlantı gelince kaydedilecek.</div>' : ''}`;
}
function bagla() {
  const g = $('#geriBtn'); if (g) g.onclick = geri;
  const s = $('#subeBtn'); if (s) s.onclick = subeSecPaneli;
  const h = $('#hesapBtn'); if (h) h.onclick = hesapPaneli;
}
window.addEventListener('online', () => render()); window.addEventListener('offline', () => render());
function subeSecimEkrani() {
  $('#tabs').hidden = true;
  $('#app').innerHTML = `<div class="login orta"><div class="card p"><h3>Hangi şubede sayım yapmak istiyorsun?</h3><p class="note" style="margin:4px 0 10px">${esc(S.me?.ad || '')}, birden fazla şubeye bakıyorsun. Şubeyi seç, o şubenin menüsü açılsın.</p>
    <div class="card" style="margin-top:6px">${subeIds().map(id => `<button class="row" data-id="${id}"><div class="m"><b>${esc(S.subeler[id].ad)}</b></div><span class="ch">›</span></button>`).join('')}</div>
    <div class="btns"><button class="btn alt" id="cik">Çıkış</button></div></div></div>`;
  $('#app').querySelectorAll('[data-id]').forEach(b => b.onclick = () => { S.subeSecildi = true; S.tab = 'sayim'; S.ar = null; S.syId = null; subeSec(b.dataset.id); render(); });
  $('#cik').onclick = () => signOut(auth);
}
function subeSecPaneli() {
  openSheet(`<h2>Şube seç</h2><div class="card" style="margin-top:10px">${subeIds().map(id => `<button class="row" data-id="${id}"><div class="m"><b>${esc(S.subeler[id].ad)}</b></div>${id === S.subeId ? '<span class="tag b">Seçili</span>' : ''}</button>`).join('')}</div>`, el => {
    el.querySelectorAll('[data-id]').forEach(b => b.onclick = () => { closeSheet(); subeSec(b.dataset.id); render(); });
  });
}
// Anlık bildirim: bu cihazın FCM kodunu alıp cihazlar/{kod} belgesine yazar; gönderimi GitHub Actions yapar.
async function bildirimAc(msg, deneme) {
  const yaz = t => { msg.textContent = t; };
  try {
    if (!VAPID_KEY) { yaz('Bildirim anahtarı (VAPID) henüz tanımlı değil.'); return; }
    if (!('Notification' in window) || !('serviceWorker' in navigator)) { yaz('Bu tarayıcı bildirimi desteklemiyor. iPhone için uygulamayı ana ekrana ekleyin.'); return; }
    const izin = await Notification.requestPermission();
    if (izin !== 'granted') { yaz('Bildirim izni verilmedi. Telefon ayarlarından izin verip tekrar deneyin.'); return; }
    const { getMessaging, getToken, isSupported } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js");
    if (!(await isSupported())) { yaz('Bu cihaz anlık bildirimi desteklemiyor.'); return; }
    const reg = await navigator.serviceWorker.ready;
    const token = await getToken(getMessaging(fbApp), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (!token) { yaz('Bildirim kodu alınamadı.'); return; }
    await setDoc(doc(db, 'cihazlar', token), { token, uid: auth.currentUser.uid, ad: benAd(), subeler: admin() ? Object.keys(S.subeler) : (S.me.subeler || []), admin: admin(), test: deneme ? serverNow() : null, zaman: new Date().toISOString() });
    yaz(deneme ? 'Kaydedildi. Bir sonraki bildirim turunda deneme mesajı gelir.' : '✓ Bu telefonda bildirimler açıldı.');
  } catch (e) { yaz('Hata: ' + (e.message || e)); }
}
const serverNow = () => new Date().toISOString();
// Sürüm notu: her güncellemede bir artırılır (hesap penceresinin altında görünür), güncellemenin geldiğini görmek için.
const SURUM = 'v15';
function hesapPaneli() {
  openSheet(`<h2>${esc(benAd())}</h2><p class="note">Kullanıcı adı: ${esc(S.me.kullaniciAdi || '')} · ${admin() ? 'Yönetici' : 'Şube hesabı'}</p>
    <div class="sec">Şifre değiştir</div>
    <label class="field"><span>Mevcut şifre</span><input id="s0" type="password" autocomplete="current-password"></label>
    <label class="field"><span>Yeni şifre</span><input id="s1" type="password" autocomplete="new-password"></label>
    <div id="se" class="err"></div>
    <div class="btns"><button class="btn alt" id="sKay">Şifreyi değiştir</button></div>
    <div class="sec">Bildirimler</div>
    <p class="note">Sabah 10:30'da SKT özeti, akşam 22:00'de unutulan irsaliye hatırlatması. iPhone'da önce uygulamayı ana ekrana ekleyin.</p>
    <div id="bdM" class="note"></div>
    <div class="btns"><button class="btn alt" id="bdAc">🔔 Bu telefonda bildirimleri aç</button></div>
    <div class="btns"><button class="btn red" id="cik">Çıkış yap</button></div>
    <p class="note" style="text-align:center;margin:10px 0 0;font-size:12px">Sürüm ${SURUM}</p>`, el => {
    el.querySelector('#cik').onclick = () => { closeSheet(); signOut(auth); };
    el.querySelector('#bdAc').onclick = () => bildirimAc(el.querySelector('#bdM'));
    el.querySelector('#sKay').onclick = async () => {
      const a = el.querySelector('#s0').value, b = el.querySelector('#s1').value; const er = el.querySelector('#se');
      if (b.length < 6) { er.textContent = 'Yeni şifre en az 6 karakter olmalı.'; return; }
      try { await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, a)); await updatePassword(auth.currentUser, b); closeSheet(); toast('Şifre değişti.'); } catch (e) { er.textContent = hataMetni(e); }
    };
  });
}
function girisEkrani() {
  $('#tabs').hidden = true;
  $('#app').innerHTML = `<div class="login"><h1>Envanter</h1><p class="c">Sayım · SKT · Sipariş</p><form class="card p" id="gf">
    <label class="field"><span>Kullanıcı adı</span><input id="gk" autocomplete="username" autocapitalize="none" autocorrect="off" required></label>
    <label class="field"><span>Şifre</span><input id="gp" type="password" autocomplete="current-password" required></label>
    <div class="err" id="ge"></div><button class="btn" style="margin-top:12px">Giriş</button></form></div>`;
  $('#gf').onsubmit = async e => { e.preventDefault(); $('#ge').textContent = ''; try { await signInWithEmailAndPassword(auth, eposta($('#gk').value), $('#gp').value); } catch (err) { $('#ge').textContent = hataMetni(err); } };
}
function hesapYok() {
  $('#tabs').hidden = true;
  if (S.kurulumVar === false) {
    $('#app').innerHTML = `<div class="login"><div class="card p"><h3>İlk kurulum</h3><p class="note">Sistemde henüz yönetici yok. Bu hesap yönetici (admin) olarak ayarlanacak.</p>
      <label class="field"><span>Adınız</span><input id="ka"></label><button class="btn" id="kb">Yönetici olarak kur</button><div class="err" id="ke"></div></div></div>`;
    $('#kb').onclick = async () => {
      const uid = S.user.uid; const kadi = S.user.email.split('@')[0];
      try { const b = writeBatch(db); b.set(doc(db, 'kullanicilar', uid), { kullaniciAdi: kadi, ad: $('#ka').value.trim() || kadi, rol: 'admin', subeler: [], aktif: true, olusturma: new Date().toISOString() }); b.set(doc(db, 'sistem', 'kurulum'), { tarih: new Date().toISOString(), uid }); await b.commit(); } catch (e) { $('#ke').textContent = hataMetni(e); }
    };
    return;
  }
  $('#app').innerHTML = `<div class="login"><div class="card p"><h3>Hesap bulunamadı</h3><p class="note">Bu kullanıcı için kayıt yok. Yöneticiye haber verin.</p><div class="btns"><button class="btn alt" id="cik">Çıkış</button></div></div></div>`;
  $('#cik').onclick = () => signOut(auth);
}

/* ================= Sayım hesapları ================= */
const syBul = id => S.sayimlar.find(s => s.id === id);
const varsGun = x => !!x.gunluk, varsHaf = x => x.haftalik !== false;
function sayimdaMi(sb, u, tur) { const x = S.urunler[u]; if (!x) return false; const o = sb.isaret?.[u]?.[tur === 'gunluk' ? 'g' : 'h']; return o != null ? o : (tur === 'gunluk' ? varsGun(x) : varsHaf(x)); }
function kapsam(sb, tur) { // sayımda görünen konumlar ve satırlar
  return (sb.konumlar || []).map(k => ({ ...k, satirlar: grupSirala(k, (k.satirlar || []).filter(s => { const x = S.urunler[s.u]; return x && x.aktif !== false && (tur === 'gunluk' ? sayimdaMi(sb, s.u, 'gunluk') : true); })) })).filter(k => k.satirlar.length);
}
function grupSirala(k, sat) { return k.gruplu ? [...sat.filter(x => x.g !== 'i'), ...sat.filter(x => x.g === 'i')] : sat;
}
const deger = (sy, k, u) => (sy.v && sy.v[k] && sy.v[k][u]) || {};
const satirDara = s => s.d ?? S.urunler[s.u]?.dara ?? null;
const koliIci = (sid, u) => { const o = S.subeler[sid]?.koliIci?.[u]; return o != null ? o : (S.urunler[u]?.koliIci ?? null); }; // şubede farklıysa o, değilse genel
const subedeGorunur = (u, sid) => { const x = S.urunler[u]; return !!x && (!x.sube || x.sube === sid); }; // şubenin konum satırındaki dara (eski kayıtlarda üründeki)
function prm(sy, s, k) {
  const p = (sy.p && sy.p[s.u]) || null; const ur = S.urunler[s.u] || {};
  const dSy = sy.d && sy.d[k] && sy.d[k][s.u];
  return { c: (p && p.c != null ? p.c : koliIci(sy.sube, s.u)) ?? 1, d: (dSy != null ? dSy : (p && p.d != null ? p.d : satirDara(s))) ?? 0 };
}
const sayildi = v => v.m != null || v.x != null;
function satirToplam(sy, k, s) {
  const v = deger(sy, k, s.u); if (!sayildi(v)) return null;
  const { c, d } = prm(sy, s, k); const m = v.m ?? 0, x = v.x ?? 0;
  if (s.y === 'koli') return r6(m * (c || 1) + x);
  if (s.y === 'tarti') return r6((v.m == null || v.m === 0 ? 0 : m - d) + x);
  return r6(m + x);
}
function urunToplamlari(sy, sb) {
  const t = {}; for (const k of kapsam(sb, sy.tur)) for (const s of k.satirlar) { const v = satirToplam(sy, k.id, s); t[s.u] ||= { t: 0, n: 0, say: 0 }; t[s.u].n++; if (v != null) { t[s.u].t = r6(t[s.u].t + v); t[s.u].say++; } }
  return t;
}
function ilerleme(sy, sb) { let n = 0, say = 0; for (const k of kapsam(sb, sy.tur)) for (const s of k.satirlar) { n++; if (sayildi(deger(sy, k.id, s.u))) say++; } return { n, say }; }

/* ================= Sayım listesi ================= */
function sayimListesi() {
  if (S.ar === 'gecmis') return sayimGecmisi();
  if (S.ar === 'sonuc') return sonucEkrani();
  const sb = sube(); const bg = isGunu(); const hg = sb.haftalikGun ?? 6; const haftalikGunu = haftaGunu(bg) === hg;
  const bugunku = t => S.sayimlar.find(s => s.id === `${S.subeId}_${bg}_${t}`);
  const konumBos = !(sb.konumlar || []).some(k => (k.satirlar || []).length);
  const ana = haftalikGunu ? 'haftalik' : 'gunluk'; const diger = ana === 'haftalik' ? 'gunluk' : 'haftalik';
  const bos = t => !kapsam(sb, t).length;
  const dugme = (t, buyuk) => { const sy = bugunku(t); const ilr = sy ? ilerleme(sy, sb) : null; const dis = konumBos || bos(t);
    const yazi = !sy ? (buyuk && !haftalikGunu ? 'Sayıma başla' : `${TUR[t]} sayım başlat`) : sy.durum === 'bitti' ? `${TUR[t]} sayım bitti ✓ · görüntüle` : `${TUR[t]} sayıma devam et · ${ilr.say}/${ilr.n}`;
    return buyuk ? `<button class="btn ${sy && sy.durum === 'bitti' ? 'alt' : ''}" data-bas="${t}" ${dis ? 'disabled' : ''} style="padding:22px;font-size:19px;margin-top:8px">${yazi}</button><p class="note" style="text-align:center">${TUR[t]} sayım${t === 'haftalik' ? ' · bütün ürünler sayılır' : haftalikGunu ? ' · sadece günlük ürünler sayılır' : ''}</p>`
      : `<a href="#" data-bas="${t}" style="color:var(--blue);font-weight:700">${yazi}</a>`; };
  const digerSy = bugunku(diger);
  $('#app').innerHTML = ust(`${sb.ad} · Sayım`, { alt: trTarih(bg) }) + `<div class="pad">
    ${eksikIrsKutusu(sb)}
    ${haftalikGunu ? `<p class="note" style="text-align:center;margin-bottom:0">Bugün haftalık sayım günü: hangisini yapacağınızı seçin</p>` : ''}
    ${dugme(ana, true)}${haftalikGunu ? dugme('gunluk', true).replace('class="btn "', 'class="btn alt"') : ''}
    ${konumBos ? `<p class="note">Bu şubenin konumlarına henüz ürün eklenmemiş.${admin() ? ' Ayarlar → Şubeler bölümünden ekleyin.' : ''}</p>` : bos(ana) ? `<p class="note">${TUR[ana]} sayılacak ürün seçilmemiş.${admin() ? ' Ayarlar → Ürünler listesinde "Günlük" / "Haftalık" işaretlerini açın.' : ''}</p>` : ''}
    ${bg !== bugun() ? `<p class="note" style="text-align:center">Saat ${String(gunSaat()).padStart(2, '0')}:00'dan önce yapılan sayım ${trTarih(bg)} sayımı olarak kaydedilir.</p>` : ''}
    <div class="card" style="margin-top:20px">
      ${!konumBos && !haftalikGunu ? `<div class="row" style="cursor:default"><div class="m"><b>${digerSy ? '' : diger === 'haftalik' ? `Haftalık sayım günü: ${GUNU[hg]}` : 'Bugün sadece günlük ürünler mi sayılacak?'}</b><span>${dugme(diger, false)}</span></div></div>` : ''}
      <button class="row" id="gecmisBtn"><div class="m"><b>Son sayımlar</b><span>Son günlük ve son haftalık sayım, sonuçlarıyla</span></div><span class="ch">›</span></button></div></div>`;
  bagla(); if ($('#irEkleU')) $('#irEkleU').onclick = () => { S.tab = 'skt'; S.ar = null; render(); irsaliyeEkle(); };
  $('#app').querySelectorAll('[data-bas]').forEach(b => b.onclick = async e => { e.preventDefault(); const t = b.dataset.bas;
    if (t === 'haftalik' && !haftalikGunu && !bugunku('haftalik') && !(await onayla(`Bugün ${GUNU[haftaGunu(bg)]}; haftalık sayım günü ${GUNU[hg]}. Yine de bütün ürünlerin sayıldığı haftalık sayım başlatılsın mı?`, 'Başlat'))) return;
    sayimBaslat(t); });
  $('#gecmisBtn').onclick = () => go({ ar: 'gecmis' });
}
function sayimGecmisi() {
  const sb = sube();
  const liste = S.sayimlar.map(sy => { const i = ilerleme(sy, sb); return `<div class="row" data-sy="${sy.id}" style="cursor:pointer"><div class="m"><b>${TUR[sy.tur] || sy.tur} · ${trTarih(sy.tarih)}</b><span>${i.say}/${i.n} satır · ${esc(sy.kim || sy.baslatan || '')} ${saat(sy.son || sy.basla)}</span><div class="bar"><i style="width:${i.n ? Math.round(i.say / i.n * 100) : 0}%"></i></div><button class="chip on" data-so="${sy.id}" style="margin-top:8px;padding:6px 14px;font-size:13px">📊 Sonuç</button></div><span class="tag ${sy.durum === 'bitti' ? 'g' : 'a'}" style="display:inline-block">${sy.durum === 'bitti' ? 'Bitti' : 'Devam ediyor'}</span><span class="ch">›</span></div>`; }).join('');
  $('#app').innerHTML = ust(`${sb.ad} · Son sayımlar`, { geri: true, alt: 'Son günlük ve son haftalık sayım saklanır' }) + `<div class="pad"><div class="card">${liste || '<div class="empty" style="padding:20px">Henüz sayım yok.</div>'}</div></div>`;
  bagla();
  $('#app').querySelectorAll('[data-sy]').forEach(b => b.onclick = () => go({ syId: b.dataset.sy }));
  $('#app').querySelectorAll('[data-so]').forEach(b => b.onclick = e => { e.stopPropagation(); S.sonucId = b.dataset.so; go({ ar: 'sonuc' }); });
}
async function sayimBaslat(tur) {
  const id = `${S.subeId}_${isGunu()}_${tur}`;
  if (syBul(id)) return go({ syId: id });
  const p = {}; for (const u of Object.keys(S.urunler)) p[u] = { c: koliIci(S.subeId, u) };
  const d = {}; for (const k of sube().konumlar || []) for (const s of k.satirlar || []) if (s.y === 'tarti') (d[k.id] ||= {})[s.u] = satirDara(s);
  const data = { sube: S.subeId, tarih: isGunu(), tur, basla: new Date().toISOString(), baslatan: benAd(), kim: benAd(), v: {}, t: {}, p, d };
  S.sayimlar.unshift({ id, ...data });
  setDoc(doc(db, 'sayimlar', id), data).catch(hata);
  go({ syId: id });
}

/* ================= Sayım editörü (hızlı klavye) ================= */
function editor() {
  $('#tabs').hidden = true;
  const sy = syBul(S.syId); const sb = sube();
  if (!sy || !sb) { $('#app').innerHTML = ust('Sayım', { geri: true }) + `<div class="empty"><b>Sayım bulunamadı</b></div>`; bagla(); return; }
  const ks = kapsam(sb, sy.tur);
  if (!ks.length) { $('#app').innerHTML = ust('Sayım', { geri: true }) + `<div class="empty"><b>Sayılacak ürün yok</b></div>`; bagla(); return; }
  if (!S.ek || !ks.find(k => k.id === S.ek)) S.ek = ks[0].id;
  if (S.f && !ks.find(k => k.id === S.f.k)) S.f = null;
  const k = ks.find(x => x.id === S.ek);
  const kd = sy.durum === 'bitti' ? null : kilitDurum('sayimlar/' + sy.id, sy); if (sy.durum !== 'bitti') { S.kilitIstek = 'sayimlar/' + sy.id; KILIT.kilitli = !!kd; }
  if (!S.f) { const i = k.satirlar.findIndex(s => !sayildi(deger(sy, k.id, s.u))); S.f = { k: k.id, i: i < 0 ? 0 : i, a: 'm' }; }
  const eskiScroll = $('#edlist')?.scrollTop ?? 0;
  const tartiVar = k.satirlar.some(s => s.y === 'tarti');
  const ayarTus = true ? `<button class="kt ayar ${S.ayarHazir ? 'hazir' : ''}" id="kAyar">${S.ayarHazir ? '⚙ Tekrar dokun' : '⚙'}</button>` : '';
  const tabs = ks.map(x => { const n = x.satirlar.length, say = x.satirlar.filter(s => sayildi(deger(sy, x.id, s.u))).length; return `<button class="kt ${x.id === S.ek ? 'on' : ''} ${say === n ? 'ok' : ''}" data-k="${x.id}">${esc(x.ad)}<small>${say === n ? '✓' : say + '/' + n}</small></button>`; }).join('');
  S.kapali ||= {}; const gk = x => `${k.id}:${x}`;
  if (k.gruplu && k.satirlar[S.f.i]) { const gc = k.satirlar[S.f.i].g === 'i' ? 'i' : 'u'; if (S.kapali[gk(gc)] && S.f.k === k.id) delete S.kapali[gk(gc)]; } // odak kapalı gruba düşerse aç
  const grupSay = {}; k.satirlar.forEach(x => { const g = x.g === 'i' ? 'i' : 'u'; const o = grupSay[g] ||= { n: 0, say: 0 }; o.n++; if (sayildi(deger(sy, k.id, x.u))) o.say++; });
  const rows = k.satirlar.map((s, i) => {
    const gcur = k.gruplu ? (s.g === 'i' ? 'i' : 'u') : null; const gprev = k.gruplu && i > 0 ? (k.satirlar[i - 1].g === 'i' ? 'i' : 'u') : null;
    const gbas = gcur && (i === 0 || gcur !== gprev) ? `<tr class="gh" data-g="${gcur}"><td colspan="3">${S.kapali[gk(gcur)] ? '▸' : '▾'} ${gcur === 'i' ? 'İÇECEKLER' : 'ÜRÜNLER'}<span>${grupSay[gcur].say === grupSay[gcur].n ? '✓ ' : ''}${grupSay[gcur].say}/${grupSay[gcur].n}</span></td></tr>` : '';
    const gizli = gcur && S.kapali[gk(gcur)] ? ' hidden' : '';
    const u = S.urunler[s.u]; const v = deger(sy, k.id, s.u); const cur = S.f.k === k.id && S.f.i === i; const tot = satirToplam(sy, k.id, s);
    const cell = (a, val, cls = '') => { const f = cur && S.f.a === a; const txt = f && S.buf != null ? S.buf : (a === 'k' ? yaz(val ?? 1) : yaz(val)); return `<span class="cell ${cls} ${f ? 'f' + (S.buf != null ? ' ty' : '') : ''} ${!f && val == null && a !== 'k' ? 'e' : ''}" data-i="${i}" data-a="${a}">${txt || (f ? '' : '–')}</span>`; };
    const ek = v.x != null || (cur && S.f.a === 'x') ? `<span class="ekx">+ ekstra ${cell('x', v.x)} ${u.birim === 'adet' ? 'adet' : 'kg'}</span>` : '';
    const ipucu = s.y === 'koli' ? `×${yaz(prm(sy, s, k.id).c)}` : s.y === 'tarti' ? 'tartı' : '';
    return gbas + `<tr class="${cur ? 'cur' : ''} ${sayildi(v) ? 'done' : ''}" data-i="${i}"${gizli}><td class="n" data-i="${i}">${esc(u.ad)}<small>${ipucu}</small>${ek}</td>
      <td>${cell('m', v.m)}</td>
      <td class="tot ${tot == null ? 'e' : tot < 0 ? 'neg' : ''}">${tot == null ? '–' : fmt(tot, u.birim)}<small>${u.birim === 'adet' ? 'ad' : 'kg'}</small></td></tr>`;
  }).join('');
  const cs = k.satirlar[S.f.i]; const cu = S.urunler[cs.u]; const pr = prm(sy, cs, k.id);
  let sol = `<b>${esc(cu.ad)}</b> · `;
  if (S.f.a === 'x') sol += `ekstra (${cu.birim === 'adet' ? 'adet' : 'kg'}) eklenir`;
  else if (cs.y === 'koli') sol += `koli = ${yaz(pr.c)} ${cu.birim === 'adet' ? 'adet' : 'kg'}`;
  else if (cs.y === 'tarti') { const v = deger(sy, k.id, cs.u); sol += `dara ${yaz(pr.d)} kg` + (v.m != null ? ` · ${yaz(v.m)} − ${yaz(pr.d)} = <b>${fmt(satirToplam(sy, k.id, cs) - (v.x ?? 0))}</b>` : ''); }
  else sol += 'adet sayılır';
  const guncel = S.urunler[cs.u] || {}; const yeniD = satirDara(cs);
  const yeniC = koliIci(sy.sube, cs.u); const fark = (cs.y === 'koli' && sy.p && sy.p[cs.u] && yeniC !== (sy.p[cs.u].c ?? null)) || (cs.y === 'tarti' && (yeniD ?? 0) !== pr.d);
  if (fark) sol += ` · <a id="pGun">ayarlarda ${yaz(cs.y === 'koli' ? yeniC : yeniD)}, güncelle</a>`;
  const sonraki = k.satirlar[S.f.i + 1] ? urunAd(k.satirlar[S.f.i + 1].u) : (ks[ks.findIndex(x => x.id === k.id) + 1] ? '→ ' + ks[ks.findIndex(x => x.id === k.id) + 1].ad : 'bitti');
  const ilr = ilerleme(sy, sb);
  $('#app').innerHTML = `<div class="ed">${ust(`${sb.ad} · ${TUR[sy.tur]} sayım`, { geri: true, alt: `${trTarih(sy.tarih)} · ${ilr.say}/${ilr.n} satır`, sag: (sy.durum === 'bitti' || kd ? '' : `<button id="bitirBtn" style="background:#fff;color:var(--blue)">Bitir</button>`) + `<button id="sonucBtn">Sonuç</button>` })}
    <div class="ktabs">${tabs}${ayarTus}</div>
    <div class="edlist" id="edlist"><table class="et"><tr><th>Ürün</th><th>${k.satirlar.some(s => s.y === 'koli') ? 'Koli' : ''}${tartiVar ? (k.satirlar.some(s => s.y === 'koli') ? ' / ' : '') + 'Tartı' : ''}${!tartiVar && !k.satirlar.some(s => s.y === 'koli') ? 'Adet' : ''}</th><th>Toplam</th></tr>${rows}</table><div style="height:30px"></div></div>
    <div class="hint"><span>${sol}</span><span style="white-space:nowrap">Sonraki: <b>${esc(sonraki)}</b></span></div>
    ${kd ? kilitKart(kd) : sy.durum === 'bitti' ? `<div class="hint" style="flex-direction:column;align-items:stretch;gap:8px;padding:12px"><span><b style="color:var(--green)">✓ Sayım bitirildi</b> · ${esc(sy.bitiren || '')} ${saat(sy.bitis)} · ${ilr.say}/${ilr.n} satır sayıldı. Değiştirmek için tekrar açın.</span><button class="btn alt" id="acBtn">Sayımı tekrar aç</button></div>` : `<div class="kp">${['1', '2', '3', 'del', '4', '5', '6', 'ekstra', '7', '8', '9', 'geri', ',', '0', 'ileri'].map(x => `<button class="k ${x === 'del' || x === 'geri' ? 's' : ''} ${x === 'ekstra' ? 's ac' : ''} ${x === 'ileri' ? 'go' : ''}" data-key="${x}">${{ del: '⌫', ekstra: S.f.a === 'x' ? '✓ Ekstra' : '+ Ekstra', geri: '‹ Geri', ileri: 'İleri ›' }[x] || x}</button>`).join('')}`}</div></div>`;
  const el = $('#edlist'); el.scrollTop = eskiScroll;
  const bb = $('#bitirBtn'); if (bb) bb.onclick = () => sayimBitir(sy);
  const ac = $('#acBtn'); if (ac) ac.onclick = () => { sy.durum = 'acik'; updateDoc(doc(db, 'sayimlar', sy.id), { durum: 'acik' }).catch(hata); editor(); };
  bagla(); $('#sonucBtn').onclick = () => go({ syId: null, tab: 'sayim', ar: 'sonuc', sonucId: sy.id });
  sekmeSurukle();
  $('#app').querySelectorAll('.kt').forEach(b => b.onclick = () => { commitBuf(); S.ek = b.dataset.k; S.f = null; S.buf = null; editor(); $('#edlist').scrollTop = 0; gorunur(); });
  const kk = $('#kilKal'); if (kk) kk.onclick = kilitKaldir;
  if (sy.durum === 'bitti' || kd) return; // kilitli ya da bitmiş: hücre ve klavye çalışmaz
  $('#app').querySelectorAll('.cell').forEach(c => c.onclick = e => { e.stopPropagation(); commitBuf(); S.f = { k: S.ek, i: +c.dataset.i, a: c.dataset.a }; S.buf = null; editor(); });
  $('#app').querySelectorAll('tr.gh').forEach(h => h.onclick = () => { commitBuf(); const ky = `${S.ek}:${h.dataset.g}`; S.kapali[ky] = !S.kapali[ky]; const t = $('#edlist').scrollTop; editor(); $('#edlist').scrollTop = t; });
  $('#app').querySelectorAll('td.n').forEach(c => c.onclick = () => { commitBuf(); S.f = { k: S.ek, i: +c.dataset.i, a: 'm' }; S.buf = null; editor(); });
  $('#app').querySelectorAll('.k').forEach(b => { b.addEventListener('pointerdown', e => { e.preventDefault(); tus(b.dataset.key); }); });
  const ka = $('#kAyar'); if (ka) ka.onclick = () => {
    if (!S.ayarHazir) { S.ayarHazir = true; editor(); $('#kAyar').scrollIntoView({ inline: 'end', block: 'nearest' }); clearTimeout(S.ayarT); S.ayarT = setTimeout(() => { S.ayarHazir = false; if (S.syId) editor(); }, 2500); return; }
    clearTimeout(S.ayarT); S.ayarHazir = false; editor(); konumMenusu();
  };
  const pg = $('#pGun'); if (pg) pg.onclick = () => {
    if (cs.y === 'koli') { sy.p[cs.u] = { c: yeniC }; updateDoc(doc(db, 'sayimlar', sy.id), { ['p.' + cs.u]: sy.p[cs.u] }).catch(hata); }
    else { sy.d ||= {}; (sy.d[k.id] ||= {})[cs.u] = yeniD; updateDoc(doc(db, 'sayimlar', sy.id), { [`d.${k.id}.${cs.u}`]: yeniD }).catch(hata); }
    editor(); };
}
function konumMenusu() {
  commitBuf(); const h = aktifHucre(); const sid = S.subeId; const k = (sube().konumlar || []).find(x => x.id === S.ek); if (!k) return; const sy = syBul(S.syId);
  const cu = h && h.k.id === k.id ? h.s.u : null;
  openSheet(`<h2>${esc(k.ad)}</h2><p class="note">Sayım kaldığı yerden devam eder.</p><div class="card" style="margin-top:12px">
    <button class="row" id="mEkle"><div class="m"><b style="color:var(--blue)">+ ${esc(k.ad)}'e ürün ekle</b><span>Listeden seç, sona eklenir</span></div></button>
    ${cu ? `<button class="row" id="mCik"><div class="m"><b>${esc(urunAd(cu))} ürününü ${esc(k.ad)}'den çıkar</b><span>Şu an üzerinde durduğun ürün</span></div></button>` : ''}
    <button class="row" id="mDuz"><div class="m"><b>${esc(k.ad)} sırasını ve sayım şeklini düzenle</b><span>Sürükle-bırak, Koli / Tartı / Adet</span></div><span class="ch">›</span></button>
    <button class="row" id="mSifT"><div class="m"><b style="color:var(--red)">Sayımı sıfırla</b><span>Bu sayımda şu ana kadar yazılan her rakam silinir</span></div></button>
    <button class="row" id="mYer"><div class="m"><b>Ürün yerleri tablosu</b><span>Bütün ürünler × bütün konumlar</span></div><span class="ch">›</span></button></div>
    <button class="btn alt" id="mKap" style="margin-top:6px">Kapat</button>`, el => {
    el.querySelector('#mKap').onclick = closeSheet;
    const sifirla = async () => { if (!sy) return; closeSheet();
      if (!(await onayla(`Bu sayımda şu ana kadar yazılan <b>her rakam silinecek</b>, sayım baştan başlayacak.`, 'Sıfırla'))) return;
      sy.v = {};
      sy.son = new Date().toISOString(); sy.kim = benAd();
      updateDoc(doc(db, 'sayimlar', sy.id), { v: deleteField(), son: sy.son, kim: sy.kim }).catch(hata);
      const ks = kapsam(sube(), sy.tur); const k0 = ks[0]; S.ek = k0.id; S.f = { k: k0.id, i: 0, a: 'm' }; S.buf = null; toast('Sayım sıfırlandı.'); editor(); };
    el.querySelector('#mSifT').onclick = sifirla;
    el.querySelector('#mDuz').onclick = () => { closeSheet(); go({ tab: 'ayarlar', syId: null, ar: `konum:${sid}:${k.id}` }); };
    el.querySelector('#mYer').onclick = () => { closeSheet(); go({ tab: 'ayarlar', syId: null, ar: `yerler:${sid}`, yerAra: '', yerFiltre: 'hepsi' }); };
    el.querySelector('#mEkle').onclick = () => urunSecici((k.satirlar || []).map(x => x.u), sec => {
      konumaEkle(sid, k.id, sec);
      toast(`${sec.length} ürün ${k.ad}'e eklendi.`); editor();
    }, sid);
    const mc = el.querySelector('#mCik'); if (mc) mc.onclick = async () => {
      if (!(await onayla(`<b>${esc(urunAd(cu))}</b> bundan sonra ${esc(k.ad)}'de sayılmayacak.`, 'Çıkar'))) return;
      konumdanCikar(sid, k.id, cu); const n = (S.subeler[sid].konumlar.find(x => x.id === k.id)?.satirlar || []).length;
      if (S.f && S.f.i >= n) S.f.i = Math.max(0, n - 1); toast(`${urunAd(cu)} ${k.ad}'den çıkarıldı.`); editor();
    };
  });
}
function sayimBitir(sy) {
  commitBuf(); const sb = sube(); const ks = kapsam(sb, sy.tur); const ilr = ilerleme(sy, sb);
  const eksik = ks.map(k => ({ ad: k.ad, n: k.satirlar.filter(s => !sayildi(deger(sy, k.id, s.u))).length })).filter(x => x.n);
  openSheet(`<h2>Sayımı bitir</h2><p class="note" style="font-size:14px">${ilr.say} / ${ilr.n} satır sayıldı.${eksik.length ? ` Sayılmayan satırlar sonuçta <b>"sayılmadı"</b> olarak kalır, 0 sayılmaz.` : ' Bütün satırlar sayıldı.'}</p>
    ${eksik.length ? `<div class="card" style="margin-top:10px">${eksik.map(x => `<div class="row" style="cursor:default"><div class="m"><b>${esc(x.ad)}</b></div><span class="tag a">${x.n} sayılmadı</span></div>`).join('')}</div>` : ''}
    <p class="note">Bitirilen sayım kilitlenir; gerekirse "Sayımı tekrar aç" ile açılır.</p>
    <div class="btns"><button class="btn alt" id="bV">Vazgeç</button><button class="btn" id="bB">Bitir</button></div>`, el => {
    el.querySelector('#bV').onclick = closeSheet;
    el.querySelector('#bB').onclick = () => { closeSheet(); Object.assign(sy, { durum: 'bitti', bitis: new Date().toISOString(), bitiren: benAd() }); updateDoc(doc(db, 'sayimlar', sy.id), { durum: 'bitti', bitis: sy.bitis, bitiren: sy.bitiren }).catch(hata); sayimlariDuzenle(true); go({ syId: null, tab: 'sayim', ar: 'sonuc', sonucId: sy.id }); toast('Sayım bitirildi.'); };
  });
}
function gorunur() { const el = $('#edlist'); const r = el && el.querySelector('tr.cur'); if (!r) return; const top = r.offsetTop, h = r.offsetHeight; if (top - 30 < el.scrollTop || top + h > el.scrollTop + el.clientHeight - 10) el.scrollTop = Math.max(0, top - el.clientHeight / 3); }
function aktifHucre() { const sy = syBul(S.syId); const sb = sube(); if (!sy || !sb || !S.f) return null; const k = kapsam(sb, sy.tur).find(x => x.id === S.f.k); const s = k && k.satirlar[S.f.i]; return s ? { sy, k, s } : null; }
function hucreBoya() { const c = $('.cell.f'); if (!c) return; c.textContent = S.buf ?? ''; c.classList.add('ty'); }
function tus(key) {
  const h = aktifHucre(); if (!h || h.sy.durum === 'bitti') return;
  if (/^[0-9]$/.test(key) || key === ',') {
    let b = S.buf ?? ''; if (key === ',') { if (b.includes(',')) return; if (!b) b = '0'; }
    if (S.f.a === 'k' && key === ',') return;
    if (b.replace(',', '').length >= 8) return; S.buf = b + key; return hucreBoya();
  }
  if (key === 'del') { const v = deger(h.sy, h.k.id, h.s.u)[S.f.a]; let b = S.buf ?? yaz(v); S.buf = b.slice(0, -1); return hucreBoya(); }
  if (key === 'ekstra') { commitBuf(); S.f = { ...S.f, a: S.f.a === 'x' ? 'm' : 'x' }; S.buf = null; return editor(); }
  if (key === 'ileri' || key === 'geri') { if (key === 'ileri' && S.buf == null && S.f.a === 'm' && !sayildi(deger(h.sy, h.k.id, h.s.u))) degerYaz(h.sy, h.k.id, h.s.u, 'm', 0); commitBuf(); return ilerle(key === 'ileri' ? 1 : -1); }
}
function commitBuf() {
  if (S.buf == null || !S.f) { S.buf = null; return; }
  const h = aktifHucre(); const b = S.buf; S.buf = null; if (!h) return;
  let n = sayiOku(b); if (S.f.a === 'k' && n != null) n = Math.max(1, Math.round(n));
  degerYaz(h.sy, h.k.id, h.s.u, S.f.a, n);
}
function degerYaz(sy, k, u, a, n) {
  sy.v ||= {}; sy.v[k] ||= {}; const o = { ...(sy.v[k][u] || {}) };
  if (n == null || (a === 'k' && n === 1)) delete o[a]; else o[a] = n;
  const bos = o.m == null && o.x == null;
  if (bos) delete sy.v[k][u]; else sy.v[k][u] = o;
  sy.son = new Date().toISOString(); sy.kim = benAd();
  updateDoc(doc(db, 'sayimlar', sy.id), { [`v.${k}.${u}`]: bos ? deleteField() : o, son: sy.son, kim: sy.kim }).catch(hata);
}
function ilerle(dir) {
  const sy = syBul(S.syId); const ks = kapsam(sube(), sy.tur); const L = []; ks.forEach(k => k.satirlar.forEach((s, i) => L.push({ k: k.id, i })));
  const idx = L.findIndex(p => p.k === S.f.k && p.i === S.f.i); const n = idx + dir;
  if (n < 0) return editor();
  if (n >= L.length) { toast('Listenin sonu ✓ Sayım tamamsa sağ üstten Bitir\'e basın.'); return editor(); }
  const p = L[n]; if (p.k !== S.f.k) { const a = ks.find(x => x.id === S.f.k), b = ks.find(x => x.id === p.k); if (dir > 0) toast(`${a.ad} bitti → ${b.ad}`); }
  const kd = p.k !== S.ek; S.ek = p.k; S.f = { k: p.k, i: p.i, a: 'm' }; editor(); if (kd) $('#edlist').scrollTop = 0; gorunur();
}
document.addEventListener('keydown', e => {
  if (!S.syId || $('#sheetRoot').children.length) return; if (e.target.closest && e.target.closest('input,select,textarea')) return;
  const k = e.key; let key = null;
  if (/^[0-9]$/.test(k)) key = k; else if (k === ',' || k === '.') key = ','; else if (k === 'Backspace') key = 'del';
  else if (k === 'Enter' || k === 'ArrowDown' || (k === 'Tab' && !e.shiftKey)) key = 'ileri'; else if (k === 'ArrowUp' || (k === 'Tab' && e.shiftKey)) key = 'geri'; else if (k === '+' || k === 'e') key = 'ekstra';
  if (key) { e.preventDefault(); tus(key); }
});

/* ================= Sonuç ================= */
// Sonuç tablosunda seçerek kopyalama: ürün adı sütunundan başlayan seçim sadece adları, rakam sütunundan başlayan sadece rakamları alır
let sonucKopya = null;
document.addEventListener('pointerdown', e => { const td = e.target.closest && e.target.closest('.st td'); const t = td && td.closest('table'); if (!t) return; t.classList.toggle('selAd', td.cellIndex === 1); t.classList.toggle('selSay', td.cellIndex === 2); });
document.addEventListener('copy', e => {
  const t = document.querySelector('table.st'); const sel = window.getSelection(); if (!t || !sonucKopya || !sel.rangeCount || sel.isCollapsed || !t.contains(sel.anchorNode)) return;
  const sat = [...t.querySelectorAll('tr[data-u]')].filter(r => sel.containsNode(r, true)); if (!sat.length) return;
  const ad = r => pulseMi(r.dataset.u) ? satirAd(sube(), r.dataset.u) : (S.urunler[r.dataset.u]?.ad || ''), say = r => { if (pulseMi(r.dataset.u)) return '0'; const x = sonucKopya[r.dataset.u]; return x && x.say ? String(Math.round(x.t * 100) / 100).replace('.', ',') : ''; };
  const m = t.classList.contains('selAd') ? 'ad' : t.classList.contains('selSay') ? 'say' : 'ikisi';
  e.clipboardData.setData('text/plain', sat.map(r => m === 'ad' ? ad(r) : m === 'say' ? say(r) : ad(r) + '\t' + say(r)).join('\n')); e.preventDefault();
});
function sonucEkrani() {
  const sb = sube();
  const liste = S.sayimlar; if (!S.sonucId || !syBul(S.sonucId)) S.sonucId = liste[0]?.id || null; const secim = '';
  const sy = syBul(S.sonucId);
  if (!sy) { $('#app').innerHTML = ust(`${sb.ad} · Sonuç`, { geri: true, subeSecici: false }) + `<div class="empty"><b>Sayım yok</b>Önce Sayım sekmesinden bir sayım başlatın.</div>`; bagla(); return; }
  const tp = urunToplamlari(sy, sb); const tumu = sonucSatirlari(sb).filter(u => grupMi(u) || pulseMi(u) || tp[u]);
  const sira = tumu.filter((u, i) => !grupMi(u) || (i + 1 < tumu.length && !grupMi(tumu[i + 1]))); // altında satır olmayan başlık gizlenir
  const urunSira = sira.filter(u => !grupMi(u)); sonucKopya = tp; let no = 0;
  const disarida = [];

  const satir = (u, no) => { if (grupMi(u)) return `<tr class="dv"><td colspan="3">${esc(GRUP_AD[u])}</td></tr>`; if (pulseMi(u)) return `<tr data-u="${u}" class="pls"><td class="no">${no}</td><td>${esc(satirAd(sb, u))}<span class="uns">Pulse'a 0 gir</span></td><td class="v">0</td></tr>`; const x = tp[u]; const ur = S.urunler[u]; 
    return `<tr data-u="${u}"><td class="no">${no}</td><td>${esc(ur.ad)}${!x || !x.say ? `<span class="uns">sayılmadı</span>` : ''}${sktEtiket(u, sy)}</td><td class="v">${fmt(x ? x.t : 0, ur.birim)}<small>${ur.birim === 'adet' ? 'ad' : 'kg'}</small></td></tr>`; };
  const ilr = ilerleme(sy, sb);
  $('#app').innerHTML = ust(`${sb.ad} · Sonuç`, { geri: true, subeSecici: false, alt: `${TUR[sy.tur]} sayım · ${trTarih(sy.tarih)} · ${ilr.say}/${ilr.n} satır · ${sy.durum === 'bitti' ? 'bitti ✓' : 'devam ediyor'}` }) + `<div class="pad">
    <div class="card">
    <table class="st">${sira.map(u => satir(u, grupMi(u) ? (no = 0, '') : ++no)).join('')}
    ${disarida.length ? `<tr class="dv"><td colspan="4">Sonuç listesinde olmayanlar</td></tr>` + disarida.map(u => satir(u, '·')).join('') : ''}</table></div>
    <div class="btns"><button class="btn alt" id="kpAd">Ürün adlarını kopyala</button><button class="btn alt" id="kpSay">Rakamları kopyala</button></div>
    <div class="btns"><button class="btn alt" id="paylas">Resim olarak paylaş</button></div>
    <div class="btns">${admin() ? '<button class="btn alt" id="syG">Geçmiş</button><button class="btn red" id="sySil">Sayımı sil</button>' : ''}</div></div>`;
  bagla();
  $('#paylas').onclick = () => sonucResmi(sy, sb, sira, disarida, tp);
  // Excel'e yapıştırmak için: her satır bir ürün; sayılar virgüllü (Excel Türkçe), sayılmayan ürün boş satır
  const kopya = async (satirlar, ad) => { const t = satirlar.join('\n'); try { await navigator.clipboard.writeText(t); } catch (e) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); } toast(`${ad} kopyalandı (${satirlar.length} satır). Excel'de yapıştırın.`); };
  $('#kpAd').onclick = () => kopya(urunSira.map(u => satirAd(sb, u)), 'Ürün adları');
  $('#kpSay').onclick = () => kopya(urunSira.map(u => { if (pulseMi(u)) return '0'; const x = tp[u]; return x && x.say ? String(Math.round(x.t * 100) / 100).replace('.', ',') : ''; }), 'Rakamlar');
  const syG = $('#syG'); if (syG) syG.onclick = () => yedekPanel('sayimlar/' + sy.id); const sl = $('#sySil'); if (sl) sl.onclick = async () => { if (!(await onayla(`${TUR[sy.tur]} sayım (${trTarih(sy.tarih)}) tamamen silinecek.`, 'Sil'))) return; deleteDoc(doc(db, 'sayimlar', sy.id)).catch(hata); S.sonucId = null; S.ar = null; gecmis.length = 0; S.sayimlar = S.sayimlar.filter(x => x.id !== sy.id); render(); };
}
async function sonucResmi(sy, sb, sira, disarida, tp) {
  const rows = [...sira, ...disarida]; let sn = 0; const W = 900, RH = 40, H = 150 + rows.length * RH + 40; const sc = 2;
  const c = document.createElement('canvas'); c.width = W * sc; c.height = H * sc; const x = c.getContext('2d'); x.scale(sc, sc);
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.fillStyle = '#0b5394'; x.fillRect(0, 0, W, 96);
  x.fillStyle = '#fff'; x.font = '700 30px Inter, sans-serif'; x.fillText(`${sb.ad} · Sayım sonucu`, 32, 48); x.font = '500 18px Inter, sans-serif'; x.fillText(`${TUR[sy.tur]} sayım · ${trTarih(sy.tarih)} · ${benAd()}`, 32, 78);
  x.font = '700 14px Inter, sans-serif'; x.fillStyle = '#6b7280'; x.fillText('ÜRÜN', 80, 130); x.textAlign = 'right'; x.fillText('SAYIM', W - 32, 130); x.textAlign = 'left';
  rows.forEach((u, i) => { const y = 150 + i * RH; if (i % 2) { x.fillStyle = '#f3f6fa'; x.fillRect(16, y, W - 32, RH); } if (grupMi(u)) { x.fillStyle = '#e5eaf1'; x.fillRect(16, y, W - 32, RH); x.fillStyle = '#6b7280'; x.font = '800 14px Inter, sans-serif'; x.fillText(GRUP_AD[u], 32, y + 26); sn = 0; return; } const pls = pulseMi(u); const ur = pls ? { ad: satirAd(sb, u), birim: 'adet' } : S.urunler[u]; const t = tp[u];
    x.fillStyle = '#9ca3af'; x.font = '600 15px Inter, sans-serif'; x.textAlign = 'right'; x.fillText(i < sira.length ? ++sn : '·', 60, y + 26); x.textAlign = 'left';
    x.fillStyle = pls ? '#9ca3af' : '#111827'; x.font = '600 18px Inter, sans-serif'; x.fillText(ur.ad, 80, y + 26);
    x.textAlign = 'right'; x.font = '800 19px Inter, sans-serif'; x.fillStyle = pls ? '#9ca3af' : '#0b5394'; x.fillText(pls ? '0' : `${fmt(t ? t.t : 0, ur.birim)} ${ur.birim === 'adet' ? 'ad' : 'kg'}`, W - 32, y + 26); x.textAlign = 'left'; });
  const blob = await new Promise(r => c.toBlob(r, 'image/png')); const ad = `sayim-${sb.ad}-${sy.tarih}.png`;
  const file = new File([blob], ad, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: ad }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = ad; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ================= İrsaliye ve SKT ================= */
const gunEkle = (t, n) => { const d = new Date(t + 'T12:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const refTarih = () => new Date().getHours() >= 22 ? gunEkle(bugun(), 1) : bugun(); // 22:00'den sonra yarına göre
const kisaT = t => { const [y, m, d] = t.split('-'); return `${+d} ${AYK[+m - 1]}`; };
const sonZaman = sy => sy.son || sy.basla || '';
// Her şubede sadece son N irsaliye (sevk tarihine göre) saklanır (Ayarlar'dan değişir, varsayılan 5); yenisi kaydedilince en eskisi silinir
const irsSakla = () => Math.max(1, Math.min(30, parseInt(S.ayar && S.ayar.irsSakla, 10) || 5));
function eskiIrsaliyeleriSil() {
  if (!S.ayarYuklendi || S.irsaliyeler.length <= irsSakla()) return; // ayar gelmeden silinmez; S.irsaliyeler yeniden eskiye sıralı
  const eski = S.irsaliyeler.slice(irsSakla());
  const b = writeBatch(db); eski.forEach(x => b.delete(doc(db, 'irsaliyeler', x.id))); b.commit().catch(() => { });
}
const _tpMemo = new Map();
function toplamlar(sy) { const k = sy.id + '|' + sonZaman(sy) + '|' + S.subeId; if (!_tpMemo.has(k)) { if (_tpMemo.size > 50) _tpMemo.clear(); _tpMemo.set(k, urunToplamlari(sy, sube())); } return _tpMemo.get(k); }
function stokBul(u, sy) { // verilen sayım ya da ürünü sayan en son sayım
  const l = sy ? [sy] : [...S.sayimlar].sort((a, b) => sonZaman(b).localeCompare(sonZaman(a)));
  for (const c of l) { const t = toplamlar(c)[u]; if (t && t.say) return { sy: c, t: t.t }; } return null;
}
// Sevkiyat takvimi: sipariş günü + 1 = sevk (irsaliye) günü
const sevkGunleri = sb => new Set((sb?.takvim || []).map(t => (t.gun + 1) % 7));
function oncekiSevk(sb, tarih) { const g = sevkGunleri(sb); if (!g.size) return null; for (let i = 1; i <= 14; i++) { const d = gunEkle(tarih, -i); if (g.has(haftaGunu(d))) return d; } return null; }
function eksikIrsaliyeler(sb) { // girilmesi gereken ama girilmemiş sevkiyatlar
  if (!sb?.takvim?.length || !S.irsaliyeler.length) return [];
  const ilk = S.irsaliyeler[S.irsaliyeler.length - 1].tarih; const bg = isGunuAt(6); const saat = new Date().getHours(); const out = [];
  for (let i = 0; i <= 8; i++) { const od = gunEkle(bg, -i); if (!sb.takvim.some(t => t.gun === haftaGunu(od))) continue; // od = sipariş günü
    const sevk = gunEkle(od, 1), son = gunEkle(od, 2); if (sevk <= ilk) continue;
    const zamaniGeldi = bg > son || (bg === son && saat >= 12); if (!zamaniGeldi || bg > gunEkle(sevk, 7)) continue;
    if (S.irsaliyeler.some(ir => ir.tarih > od)) continue; // sipariş gününden sonra herhangi bir irsaliye girilmişse uyarma
    out.push({ sevk, son }); }
  return out;
}
const eksikIrsKutusu = sb => { const l = eksikIrsaliyeler(sb); return l.length ? `<div class="card p" style="background:var(--amber-soft);border-color:transparent"><b style="color:var(--amber)">${l.map(o => trTarih(o.sevk)).join(', ')} sevkiyatının irsaliyesi girilmedi</b><p class="note">İrsaliye girilmeyince SKT ve atık hesabı eksik kalır.</p><div class="btns"><button class="btn sm" id="irEkleU">İrsaliye ekle</button></div></div>` : ''; };
function sktDurum(u, sy) {
  const x = S.urunler[u]; if (!x || !x.sktGun) return null;
  const R = refTarih(); const st = stokBul(u, sy); if (!st) return { sayimYok: true };
  const partiler = []; for (const ir of S.irsaliyeler) for (const k of ir.kalemler || []) if (k.u === u && k.miktar > 0) partiler.push({ t: ir.tarih, q: k.miktar, son: gunEkle(ir.tarih, x.sktGun), coz: x.cozulmeGun ? gunEkle(ir.tarih, x.cozulmeGun) : null });
  const sonra = partiler.filter(p => p.t > st.sy.tarih).reduce((a, p) => a + p.q, 0); // sayımdan sonra gelen
  const stok = r6(st.t + sonra); partiler.sort((a, b) => b.t.localeCompare(a.t)); // önce yeni parti
  let kalan = stok; const gecerli = [];
  for (const p of partiler) { if (p.son < R) continue; const a = r6(Math.min(p.q, Math.max(0, kalan))); kalan = r6(kalan - a); gecerli.push({ ...p, a }); }
  const ilk = S.irsaliyeler.length ? S.irsaliyeler[S.irsaliyeler.length - 1].tarih : null;
  const tamEski = !!ilk && ilk <= gunEkle(R, -x.sktGun); // SKT süresi kadar geriye irsaliye kaydı var mı
  const onc = ilk ? oncekiSevk(sube(), ilk) : null; // takvime göre en eski irsaliyeden önceki sevkiyat: onun SKT'si de bittiyse, irsaliyesiz stok kesin atık
  const tam = tamEski || (!!onc && gunEkle(onc, x.sktGun) < R);
  return { stok, atik: tam ? r6(Math.max(0, kalan)) : null, eksik: !tam, eskiParti: tam && !tamEski && kalan > 0, gecerli, sy: st.sy, R };
}
function atikYeri(sy, u, miktar) {
  const ps = []; for (const k of kapsam(sube(), sy.tur)) for (const s of k.satirlar) if (s.u === u) { const v = satirToplam(sy, k.id, s); if (v > 0) ps.push({ ad: k.ad, v, mk: ascii(k.ad).includes('make') ? 1 : 0 }); }
  ps.sort((a, b) => b.mk - a.mk); let kal = miktar; const out = []; const b = S.urunler[u]?.birim;
  for (const p of ps) { if (kal <= 0) break; const a = r6(Math.min(p.v, kal)); out.push(`${p.ad} ${fmt(a, b)}`); kal = r6(kal - a); } return out.join(' + ');
}
const birimK = u => S.urunler[u]?.birim === 'adet' ? 'adet' : 'kg';
function sktEtiket(u, sy) {
  const d = sktDurum(u, sy); if (!d || d.sayimYok) return '';
  if (d.atik > 0) return `<span class="tag r" style="display:inline-block;margin-top:3px">${fmt(d.atik, S.urunler[u].birim)} atık</span>`;
  const yarin = gunEkle(bugun(), 1); const yak = d.gecerli.filter(p => p.a > 0 && p.son <= yarin).reduce((a, p) => a + p.a, 0);
  const yarinEt = yak > 0 ? `<span class="tag a" style="display:inline-block;margin-top:3px">${fmt(yak, S.urunler[u].birim)} ${d.gecerli.find(p => p.a > 0 && p.son <= yarin).son === bugun() ? 'bugün' : 'yarın'} SKT</span>` : '';
  if (d.eksik) return yarinEt || `<span class="tag" style="display:inline-block;margin-top:3px" title="Atık hesabı için irsaliye geçmişi henüz yeterli değil">yakın SKT yok</span>`;
  return `<span class="tag g" style="display:inline-block;margin-top:3px">SKT yok</span>${yarinEt ? ' ' + yarinEt : ''}`;
}
function sktEkrani() {
  const sb = sube(); const R = refTarih(); const bg = bugun(); const yarin = gunEkle(bg, 1);
  const urs = [...subedekiUrunler(sb)].filter(u => S.urunler[u]?.sktGun && S.urunler[u].aktif !== false);
  const atik = [], bugunL = [], yarinL = [], yakin = [], coz = [], eksik = [], yok = [];
  for (const u of urs) {
    const d = sktDurum(u); if (!d) continue; if (d.sayimYok) { yok.push(u); continue; } if (d.eksik) eksik.push(u);
    if (d.atik > 0) atik.push({ u, q: d.atik, yer: atikYeri(d.sy, u, d.atik), sy: d.sy, eski: d.eskiParti });
    const grp = {}; for (const p of d.gecerli) { if (p.a <= 0) continue; if (p.coz && p.coz > bg) coz.push({ u, q: p.a, t: p.t, coz: p.coz }); else (grp[p.son] ||= []).push(p); }
    for (const [son, ps] of Object.entries(grp)) { const q = r6(ps.reduce((a, p) => a + p.a, 0)); const o = { u, q, son, t: ps.map(p => kisaT(p.t)).join(', ') };
      if (son <= bg) bugunL.push(o); else if (son === yarin) yarinL.push(o); else if (son <= gunEkle(bg, 3)) yakin.push(o); }
  }
  const kart = (renk, ic, u, alt, q) => `<div class="card" style="display:flex;gap:10px;padding:12px;align-items:center"><div style="width:34px;height:34px;border-radius:50%;background:${renk};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;flex:none">${ic}</div><div style="flex:1;min-width:0"><b>${esc(urunAd(u))}</b><div class="note" style="margin:2px 0 0">${alt}</div></div><div style="text-align:right"><b style="font-size:18px;color:${renk}">${fmt(q, S.urunler[u].birim)}</b><div class="note" style="margin:0">${birimK(u)}</div></div></div>`;
  const sec = (bas, l, f) => l.length ? `<div class="sec">${bas}</div>` + l.map(f).join('') : '';
  const son = [...S.sayimlar].sort((a, b) => sonZaman(b).localeCompare(sonZaman(a)))[0];
  const irs = S.irsaliyeler.slice(0, irsSakla()).map(ir => `<button class="row" data-ir="${ir.id}"><div class="m"><b>${trTarih(ir.tarih)}</b><span>${esc(ir.no || 'numarasız')} · ${(ir.kalemler || []).length} kalem · ${esc(ir.ekleyen || '')}</span></div><span class="ch">›</span></button>`).join('');
  const hicbir = !atik.length && !bugunL.length && !yarinL.length && !yakin.length && !coz.length;
  $('#app').innerHTML = ust(`${sb.ad} · SKT`, { alt: `${kisaT(R)}${R !== bg ? ' (yarın)' : ''}'e göre · ${son ? 'son sayım ' + kisaT(son.tarih) + ' ' + saat(sonZaman(son)) : 'sayım yok'}` }) + `<div class="pad">
    ${eksikIrsKutusu(sb)}
    <div class="btns" style="margin:0 0 6px"><button class="btn" id="irEkle">+ İrsaliye ekle</button><button class="btn alt" id="opBtn">💬 Paylaş</button></div>
    ${!S.irsaliyeler.length ? `<div class="card p" style="background:var(--amber-soft);border-color:transparent"><b style="color:var(--amber)">Henüz irsaliye yok</b><p class="note">SKT hesabı için gelen her irsaliyeyi ekleyin. Atık hesabı, ürünün SKT süresi kadar geriye irsaliye kaydı birikince başlar.</p></div>` : ''}
    ${sec('Atık yapılacak (SKT geçmiş)', atik, o => kart('var(--red)', '!', o.u, `${o.yer ? 'Muhtemelen <b>' + esc(o.yer) + '</b>' : 'Geçerli irsaliyelerden fazla'}${o.eski ? ' · irsaliyesi olmayan eski parti' : ''}`, o.q))}
    ${sec('Bugün son gün', bugunL, o => kart('#dc2626', '0', o.u, `${o.t} irsaliyesinden kalan · bugün 23:59'da biter`, o.q))}
    ${sec('Yarın son gün', yarinL, o => kart('var(--amber)', '1', o.u, `${o.t} irsaliyesinden kalan · önce bunu kullanın`, o.q))}
    ${sec('Yaklaşan', yakin, o => kart('#d97706', '⏱', o.u, `${o.t} irsaliyesinden kalan · ${trTarih(o.son)} son gün`, o.q))}
    ${sec('Çözülüyor · henüz kullanmayın', coz, o => kart('#64748b', '❄', o.u, `${kisaT(o.t)} irsaliyesi · ${trTarih(o.coz)} sabahı kullanılabilir`, o.q))}
    ${hicbir && S.irsaliyeler.length && son ? `<div class="card p" style="background:var(--green-soft);border-color:transparent"><b style="color:var(--green)">SKT'si yaklaşan ürün yok.</b></div>` : ''}
    ${eksik.length && S.irsaliyeler.length ? `<p class="note">İrsaliye geçmişi henüz eksik olduğu için atık hesaplanmayan ürünler: ${eksik.map(urunAd).map(esc).join(', ')}</p>` : ''}
    ${yok.length ? `<p class="note">Sayımı olmayan SKT'li ürünler: ${yok.map(urunAd).map(esc).join(', ')}</p>` : ''}
    <div class="sec">İrsaliyeler (son ${irsSakla()})</div><div class="card">${irs || '<div class="empty" style="padding:20px">İrsaliye yok.</div>'}</div></div>`;
  bagla();
  $('#opBtn').onclick = ozetPaylas; $('#irEkle').onclick = irsaliyeEkle; if ($('#irEkleU')) $('#irEkleU').onclick = irsaliyeEkle;
  $('#app').querySelectorAll('[data-ir]').forEach(b => b.onclick = () => { const ir = S.irsaliyeler.find(x => x.id === b.dataset.ir); if (!ir) return; S.irsTaslak = { id: ir.id, tarih: ir.tarih, no: ir.no || '', kaynak: ir.kaynak, kalemler: (ir.kalemler || []).map(k => ({ ...k, gida: true })), digerleri: [] }; go({ ar: 'irs' }); });
}
// İrsaliyeden sadece SKT'si takip edilen ürünler (hamurlar, donuklar) okunur.
const sktUrunleri = () => urunlerSirali().filter(u => u.aktif !== false && u.sktGun && subedeGorunur(u.id, S.subeId));
function irsaliyeEkle() {
  const anahtar = !!(S.ai.geminiKey || '').trim();
  openSheet(`<h2>İrsaliye ekle</h2><p class="note">Kağıt irsaliyenin fotoğrafı ya da 3SC "Siparişiniz teslim edildi" mailinin ekran görüntüsü. Sadece SKT'si takip edilen ürünler (${sktUrunleri().length}: hamurlar, tabanlar, donuklar) okunur. Birden fazla sayfa seçebilirsiniz.</p>
    ${anahtar ? `<label class="btn" style="margin-top:12px">📷 Kamera ile çek<input type="file" accept="image/*" capture="environment" id="irK" hidden></label><label class="btn alt" style="margin-top:8px">🖼 Galeriden seç<input type="file" accept="image/*" multiple id="irF" hidden></label>` : `<p class="note" style="color:var(--amber)">Fotoğraf okuma için yönetici Ayarlar → Fotoğraf okuma (Gemini) bölümüne anahtar girmeli.</p>`}
    <div class="btns"><button class="btn alt" id="irE">Elle gir</button></div>`, el => {
    el.querySelector('#irE').onclick = () => { closeSheet(); S.irsTaslak = { tarih: bugun(), no: '', kaynak: 'elle', kalemler: [], digerleri: [] }; go({ ar: 'irs' }); };
    for (const f of [el.querySelector('#irF'), el.querySelector('#irK')]) if (f) f.onchange = () => { const fs = [...f.files]; if (fs.length) irsaliyeOku(fs); };
  });
}
async function kucult(blob) { try { const bmp = await createImageBitmap(blob); const sc = Math.min(1, 1280 / Math.max(bmp.width, bmp.height)); if (sc >= 1 && blob.size < 400e3 && /jpeg|webp/.test(blob.type)) return blob; const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); return await new Promise(r => c.toBlob(r, 'image/jpeg', .72)); } catch (e) { return blob; } }
const b64 = blob => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = no; r.readAsDataURL(blob); });
function aiHata(code, msg) { const e = new Error(msg || code); e.code = code; return e; }
// Hız için "düşünme" kapatılır; model desteklemiyorsa bir sonraki ayarla tekrar denenir.
const DUSUNME = [{ thinkingLevel: 'minimal' }, { thinkingBudget: 0 }, { thinkingLevel: 'low' }, null]; let dusunmeI = 0;
try { dusunmeI = +localStorage.getItem('env_dusunme2') || 0; } catch (e) { }
async function geminiCagir(model, key, parts) {
  for (;;) {
    const gc = { temperature: 0, responseMimeType: 'application/json' }; const th = DUSUNME[dusunmeI]; if (th) gc.thinkingConfig = th;
    const ctl = new AbortController(); const zt = setTimeout(() => ctl.abort('zaman'), 30000); if (S.okumaIptal) S.okumaIptal.onabort = () => ctl.abort('iptal');
    let res; try { res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: gc }) });
    } catch (e) { clearTimeout(zt); if (ctl.signal.reason === 'iptal') throw aiHata('iptal'); if (ctl.signal.aborted) throw aiHata('zaman'); throw aiHata('ag', e.message); }
    let j = null; try { j = await res.json(); } catch (e) { } clearTimeout(zt);
    if (!res.ok && res.status === 400 && th && !/api key/i.test((j && j.error && j.error.message) || '')) { dusunmeI++; try { localStorage.setItem('env_dusunme2', dusunmeI); } catch (e) { } continue; }
    return geminiSonuc(res, j);
  }
}
function geminiSonuc(res, j) {
  if (!res.ok) { const m = (j && j.error && j.error.message) || ''; if (res.status === 429) throw aiHata('rate', m); if (res.status === 404) throw aiHata('model', m); if (res.status >= 500) throw aiHata('yogun', m); if (res.status === 403 || (res.status === 400 && /api key/i.test(m))) throw aiHata('key', m); throw aiHata('http', m || ('HTTP ' + res.status)); }
  const t = ((j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p => p.text || '').join('').trim(); if (!t) throw aiHata('bos'); return t;
}
// Model seçimi: Google eski modelleri yeni anahtarlara kapatabiliyor; büyük "flash" modelleri ücretsiz planda çok yavaş
// kalabiliyor. Bu yüzden listeden en yeni hızlı "flash-lite" model seçilir ve telefonda hatırlanır.
async function modelListesi(key) { const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } }); const j = await r.json().catch(() => ({})); return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace(/^models\//, '')).filter(n => /gemini/.test(n) && !/image|tts|live|audio|embed|exp|preview|thinking/.test(n)); }
const surumNo = n => { const m = n.match(/gemini-(\d+(?:\.\d+)?)/); return m ? +m[1] : 0; };
async function modelAdaylari(key, haric = []) {
  const ms = (await modelListesi(key)).filter(n => !haric.includes(n));
  const lite = ms.filter(n => /flash-lite/.test(n)).sort((a, b) => surumNo(b) - surumNo(a) || a.length - b.length);
  const flash = ms.filter(n => /flash/.test(n) && !/lite/.test(n)).sort((a, b) => surumNo(b) - surumNo(a) || a.length - b.length);
  return [...lite, ...flash];
}
async function gemini(parts) {
  const key = (S.ai.geminiKey || '').trim(); const elle = (S.ai.model || '').trim();
  let model = elle || (() => { try { return localStorage.getItem('env_model'); } catch (e) { return null; } })() || 'gemini-3.5-flash-lite';
  const denenen = [];
  for (let i = 0; i < 3; i++) {
    try { const t = await geminiCagir(model, key, parts); if (!elle) { try { localStorage.setItem('env_model', model); } catch (e) { } }
      try { return JSON.parse(t.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch (e) { throw aiHata('json'); } }
    catch (e) {
      if (!['model', 'zaman', 'yogun'].includes(e.code)) throw e;
      denenen.push(model); try { localStorage.removeItem('env_model'); } catch (x) { }
      const alt = (await modelAdaylari(key, denenen).catch(() => []))[0]; if (!alt) throw e; model = alt; dusunmeI = 0;
    }
  }
  throw aiHata('zaman');
}
const AI_MESAJ = { zaman: 'Gemini 30 saniyede cevap vermedi (başka modelle de denendi). İnternet bağlantısını kontrol edip tekrar deneyin ya da irsaliyeyi elle girin.', yogun: 'Gemini şu an yoğun. Biraz sonra tekrar deneyin ya da elle girin.', ag: 'Gemini\'ye bağlanılamadı. İnternet bağlantısını kontrol edin.', iptal: 'Okuma iptal edildi.', rate: 'Gemini ücretsiz kullanım sınırına ulaşıldı. Bir dakika sonra tekrar deneyin.', key: 'Gemini anahtarı geçersiz. Yönetici Ayarlar → Fotoğraf okuma bölümünden kontrol etsin.', model: 'Gemini modeli bulunamadı. Ayarlarda model alanını boş bırakın.', json: 'Fotoğraf okunamadı. Daha net bir fotoğraf deneyin.', bos: 'Fotoğraf okunamadı. Daha net bir fotoğraf deneyin.' };
const eslKey = ad => ascii(ad).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
function eslesmeBul(ad) { const k = eslKey(ad); const u = S.eslesme[k]; return u && S.urunler[u] && S.urunler[u].aktif !== false ? u : null; }
async function irsaliyeOku(dosyalar) {
  const t0 = Date.now(); openSheet(`<h2>Okunuyor… <span id="okS" class="num" style="color:var(--mut);font-size:15px"></span></h2><p class="note" id="okA">Fotoğraf hazırlanıyor…</p><div class="bar"><i id="okB" style="width:5%;transition:width .9s linear"></i></div><div class="btns"><button class="btn alt" id="okV">Vazgeç</button></div>`);
  S.okumaIptal = { onabort: null }; const ip = S.okumaIptal; $('#okV').onclick = () => { ip.iptal = true; if (ip.onabort) ip.onabort(); };
  const zam = setInterval(() => { const sn = Math.round((Date.now() - t0) / 1000); const s1 = $('#okS'), b1 = $('#okB'); if (s1) s1.textContent = sn + ' sn'; if (b1) b1.style.width = Math.min(95, 5 + sn * 4) + '%'; }, 1000);
  try {
    const urunAdlari = sktUrunleri().map(u => u.ad);
    const prompt = `Bu görüntü(ler) Domino's Pizza şubesine gelen bir sevkiyatın belgesidir: ya kağıt e-İrsaliye ya da 3SC "siparişiniz teslim edildi" e-postasının ekran görüntüsü.
Sadece aşağıdaki ürün listemizde karşılığı olan kalemleri oku (hamurlar, tabanlar ve son kullanma tarihi takip edilen donuk ürünler). Listede karşılığı olmayan bütün kalemleri (içecekler, soslar, kutular, kağıtlar, temizlik, kıyafet, nakliye vb.) tamamen atla, yazma.
Sadece şu JSON'u döndür:
{"tur":"irsaliye" ya da "mail","sube":"belgedeki şube adı (ör. SERİK)","tarih":"YYYY-AA-GG","no":"irsaliye no ya da sipariş no","kalemler":[{"ad":"belgede yazdığı gibi ürün adı","miktar":sayı,"urun":"listemizdeki ürün adı"}]}
Kurallar:
- tarih: kağıt irsaliyede "Sevk Tarihi", e-postada "Sevkiyat Tarihi".
- miktar: kağıt irsaliyede "TÖB Miktarı" sütunu (ondalık virgülü noktaya çevir, 7,68 → 7.68); e-postada "Sevk Edilen" sütunundaki sayı (yoksa "Onaylanan").
- urun eşleştirme örnekleri: "HAMUR 7" → "7 HAMUR", "PIZZA TABANI 10 (24LU) - T" → "10 TABAN", "GURME PATATES" → "PATATES", "CITIR TAVUK FINGER" → "FİNGERS", "SADE CUBUK MOZARELLA 250G" → "ÇUBUK MOZZARELLA", "HAMBURGER PILIC KOFTE 550 GR" → "KÖFTE", "RENDE ERITME PEYNIRI 1 KG" → "ERİTME PEYNİRİ", "CIKOLATALI SUFLE" → "SUFLE", "TAVUK PARCALARI (KICKERS)" → "TAVUK PARÇALARI".
Ürün listemiz: ${urunAdlari.join(' | ')}`;
    const parts = [{ text: prompt }]; let boyut = 0, ham = 0;
    for (const f of dosyalar) { ham += f.size; const k = await kucult(f); boyut += k.size; parts.push({ inline_data: { mime_type: k.type || 'image/jpeg', data: await b64(k) } }); }
    const kb = n => n > 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' MB' : Math.round(n / 1e3) + ' KB';
    const okA = $('#okA'); if (okA) okA.innerHTML = `Gemini'ye gönderildi (${kb(boyut)}${ham > boyut * 1.2 ? `, fotoğraf ${kb(ham)} idi` : ''}), okunuyor… Genelde birkaç saniye.`;
    const j = await gemini(parts); if (S.okumaIptal && S.okumaIptal.iptal) return;
    const adId = {}; Object.entries(S.urunler).forEach(([id, x]) => { if (x.aktif !== false && subedeGorunur(id, S.subeId)) adId[ascii(x.ad)] = id; });
    const kal = (j.kalemler || []).map(k => { const miktar = typeof k.miktar === 'number' ? k.miktar : sayiOku(k.miktar); let u = eslesmeBul(k.ad || '') || (k.urun ? adId[ascii(k.urun)] || null : null); if (u && !S.urunler[u].sktGun) u = null;
      const baskaUrun = !u && k.urun && adId[ascii(k.urun)]; // listede var ama SKT takibi yok → atla
      return { ad: String(k.ad || '').trim(), miktar, u, aiU: u, gida: !baskaUrun }; }).filter(k => k.gida);
    S.irsTaslak = { tarih: /^\d{4}-\d{2}-\d{2}$/.test(j.tarih || '') ? j.tarih : bugun(), no: String(j.no || ''), okunanSube: j.sube || '', kaynak: j.tur === 'mail' ? 'mail' : 'kagit', kalemler: kal, digerleri: [] };
    clearInterval(zam); console.info('irsaliye okuma', Math.round((Date.now() - t0) / 1000), 'sn'); closeSheet(); go({ ar: 'irs' });
  } catch (e) { clearInterval(zam); console.error(e); if (e.code === 'iptal') { closeSheet(); return; } openSheet(`<h2>Okunamadı</h2><p class="note">${esc(AI_MESAJ[e.code] || hataMetni(e))}</p><div class="btns"><button class="btn alt" id="kp">Kapat</button></div>`, el => el.querySelector('#kp').onclick = closeSheet); }
}
function irsaliyeDuzen() {
  const T = S.irsTaslak; const sb = sube(); if (!T || !sb) { S.ar = null; return sktEkrani(); }
  const urs = sktUrunleri();
  const secenek = sel => `<option value="">— eşleşmedi —</option>` + urs.map(u => `<option value="${u.id}" ${u.id === sel ? 'selected' : ''}>${esc(u.ad)}</option>`).join('');
  const subeFarkli = T.okunanSube && !ascii(T.okunanSube).includes(ascii(sb.ad).split(' ')[0]) && !ascii(sb.ad).includes(ascii(T.okunanSube).split(' ')[0]);
  const ayni = T.no && S.irsaliyeler.find(x => x.no === T.no && x.id !== T.id);
  const uyar = []; // irsaliyedeki koli (sevk kolisi) sayımdaki koli/paketle aynı olmadığı için koli içi karşılaştırılmıyor
  const eslesmeyen = T.kalemler.filter(k => !k.u).length;
  $('#app').innerHTML = ust(T.id ? 'İrsaliye' : 'İrsaliye kontrol', { geri: true, subeSecici: false, alt: `${sb.ad} · ${T.kaynak === 'mail' ? 'mail' : T.kaynak === 'elle' ? 'elle giriş' : 'kağıt irsaliye'}` }) + `<div class="pad">
    ${subeFarkli ? `<div class="card p" style="background:var(--red-soft);border-color:transparent"><b style="color:var(--red)">Belgede şube "${esc(T.okunanSube)}" yazıyor, seçili şube ${esc(sb.ad)}.</b><p class="note">Yanlış şubeye kaydetmemek için üstten şubeyi değiştirin ya da emin olun.</p></div>` : ''}
    ${ayni ? `<div class="card p" style="background:var(--amber-soft);border-color:transparent"><b style="color:var(--amber)">Bu irsaliye (${esc(T.no)}) ${kisaT(ayni.tarih)} tarihinde zaten eklenmiş.</b></div>` : ''}
    <div class="card p"><div class="grid2"><label class="field"><span>Sevk tarihi (SKT buradan başlar)</span><input type="date" id="irT" value="${T.tarih}"></label><label class="field"><span>İrsaliye / sipariş no</span><input id="irN" value="${esc(T.no)}"></label></div></div>
    ${uyar.map(w => `<div class="card p" style="background:var(--amber-soft);border-color:transparent"><b style="color:var(--amber)">Koli içi değişmiş olabilir: ${esc(urunAd(w.u))}</b><p class="note">İrsaliyede koli başı ${yaz(w.oran)}, ayarlarda ${yaz(w.ki)}.</p>${admin() ? `<div class="btns"><button class="btn sm alt" data-kg="${w.u}" data-v="${w.oran}">Ürünler'de ${yaz(w.oran)} yap</button></div>` : ''}</div>`).join('')}
    <div class="sec">Ürünler (${T.kalemler.length})${eslesmeyen ? ` · <span style="color:var(--red)">${eslesmeyen} eşleşmedi</span>` : ''}</div>
    <div class="card">${T.kalemler.map((k, i) => `<div style="padding:10px 12px;border-bottom:1px solid var(--line);${k.u ? '' : 'background:var(--red-soft)'}">
      ${k.ad ? `<div class="note" style="margin:0 0 4px">${esc(k.ad)}${k.koli ? ` · ${yaz(k.koli)} koli` : ''}</div>` : ''}
      <div style="display:flex;gap:8px;align-items:center"><select data-i="${i}" class="irU" style="flex:1;min-width:0;font:inherit;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink)">${secenek(k.u)}</select>
      <input data-i="${i}" class="irM" inputmode="decimal" value="${yaz(k.miktar)}" style="width:76px;font:inherit;font-size:16px;padding:8px;border:1px solid var(--line);border-radius:8px;text-align:right;background:var(--surface);color:var(--ink)"><span class="note" style="width:28px;margin:0">${k.u ? birimK(k.u) : ''}</span><button class="x" data-sil="${i}">✕</button></div>
      ${k.u && S.urunler[k.u].sktGun ? `<div class="note" style="margin:4px 0 0">SKT son gün: <b>${trTarih(gunEkle(T.tarih, S.urunler[k.u].sktGun))}</b>${S.urunler[k.u].cozulmeGun ? ` · ${trTarih(gunEkle(T.tarih, S.urunler[k.u].cozulmeGun))} sabahına kadar çözülür` : ''}</div>` : ''}</div>`).join('') || '<div class="empty" style="padding:20px">Kalem yok</div>'}</div>
    <div class="btns" style="margin-top:0"><button class="btn alt" id="irS">+ Satır ekle</button></div>
    ${T.digerleri.length ? `<details class="card" style="margin-top:10px"><summary class="row" style="list-style:none"><div class="m"><b>Gıda dışı ${T.digerleri.length} kalem atlandı</b><span>${esc(T.digerleri.map(k => k.ad).join(', '))}</span></div></summary></details>` : ''}
    <p class="note">Sadece SKT'si takip edilen ürünler listelenir. Eşleşmeyen satırlar kaydedilmez. Elle eşleştirdiğiniz adlar bir sonraki irsaliyede kendiliğinden tanınır.</p>
    <div class="btns"><button class="btn" id="irK">${T.id ? 'Değişiklikleri kaydet' : 'Onayla ve kaydet'}</button></div>
    ${T.id ? '<div class="btns"><button class="btn red" id="irD">İrsaliyeyi sil</button></div>' : ''}</div>`;
  bagla();
  $('#irT').onchange = e => { T.tarih = e.target.value || T.tarih; render(); };
  $('#irN').oninput = e => { T.no = e.target.value.trim(); };
  $('#app').querySelectorAll('.irU').forEach(x => x.onchange = () => { T.kalemler[+x.dataset.i].u = x.value || null; render(); });
  $('#app').querySelectorAll('.irM').forEach(x => x.onchange = () => { T.kalemler[+x.dataset.i].miktar = sayiOku(x.value); });
  $('#app').querySelectorAll('[data-sil]').forEach(x => x.onclick = () => { T.kalemler.splice(+x.dataset.sil, 1); render(); });
  $('#app').querySelectorAll('[data-kg]').forEach(x => x.onclick = () => { updateDoc(doc(db, 'genel', 'urunler'), { [`u.${x.dataset.kg}.koliIci`]: +x.dataset.v }).then(() => toast('Koli içi güncellendi.')).catch(hata); });
  $('#irS').onclick = () => { T.kalemler.push({ ad: '', miktar: null, u: null, gida: true }); render(); window.scrollTo(0, document.body.scrollHeight); };
  const d = $('#irD'); if (d) d.onclick = async () => { if (!(await onayla('Bu irsaliye silinecek; SKT hesabından çıkar.', 'Sil'))) return; deleteDoc(doc(db, 'irsaliyeler', T.id)).catch(hata); S.irsTaslak = null; geri(); };
  $('#irK').onclick = async () => {
    const kalem = T.kalemler.filter(k => k.u && k.miktar > 0).map(k => ({ u: k.u, miktar: r6(k.miktar), ad: k.ad || '', koli: k.koli || null }));
    if (!kalem.length) return toast('Kaydedilecek ürün yok.', true);
    const id = T.id || yeniId('i'); const data = { sube: S.subeId, tarih: T.tarih, no: T.no || '', kaynak: T.kaynak || 'elle', kalemler: kalem, ekleyen: benAd(), zaman: new Date().toISOString() };
    const yeniEsl = {}; for (const k of T.kalemler) if (k.ad && k.u && k.u !== k.aiU) { const kk = eslKey(k.ad); if (kk) yeniEsl[`m.${kk}`] = k.u; }
    try { await setDoc(doc(db, 'irsaliyeler', id), data); if (Object.keys(yeniEsl).length) { const r = doc(db, 'genel', 'eslesme'); await updateDoc(r, yeniEsl).catch(() => setDoc(r, { m: Object.fromEntries(Object.entries(yeniEsl).map(([k, v]) => [k.slice(2), v])) }, { merge: true })); }
      toast('İrsaliye kaydedildi.'); S.irsTaslak = null; geri(); } catch (e) { hata(e); }
  };
}
// Ana malzeme ek buffı: Ayarlar → Sistem ayarları → Ana malzeme buffı (genel/ayar: anaBuff gün, anaUrunler ürün id'leri)
const anaMiktar = () => { const n = parseFloat(S.ayar && S.ayar.anaBuff); return isFinite(n) && n > 0 ? n : 0; };
const anaMi = u => !!(S.ayar && Array.isArray(S.ayar.anaUrunler) && S.ayar.anaUrunler.includes(u));
function anaMalzemeAyar() {
  const l = Object.entries(S.urunler).filter(([id, x]) => x.siparis && x.aktif !== false).sort((a, b) => (a[1].sira ?? 999) - (b[1].sira ?? 999));
  const sec = new Set((S.ayar.anaUrunler || []).filter(id => S.urunler[id])); const eskiY = window.scrollY;
  $('#app').innerHTML = ust('Ana malzeme buffı', { geri: true, subeSecici: false, alt: `${sec.size} ana malzeme · ek ${yaz(anaMiktar()) || 0} gün` }) + `<div class="pad">
    <p class="note" style="margin:0 0 8px">İşaretli ürünlerde sipariş hedefi, seçtiğiniz buffa <b>ek olarak</b> bu kadar gün fazla hesaplanır (ör. buff 0,5 + ek 0,25 = 0,75 gün). Sipariş ekranında ayrı bir etiket çıkmaz. SKT'si kısa ürünlerde küçük tutun; 0 yazarsanız kapanır.</p>
    <label class="field"><span>Ek buff (gün)</span><input id="abM" inputmode="decimal" value="${yaz(anaMiktar())}" placeholder="0"></label><div class="err" id="abH"></div>
    <div class="card">${l.map(([id, x]) => `<button class="row" data-ab="${id}"><div class="m"><b>${esc(x.ad)}</b></div><span class="ch" style="color:var(--blue);font-weight:800;font-size:18px">${sec.has(id) ? '✓' : ''}</span></button>`).join('') || '<div class="empty" style="padding:20px">Sipariş listesinde ürün yok.</div>'}</div></div>`;
  bagla(); window.scrollTo(0, eskiY);
  $('#abM').onchange = async e => { const v = sayiOku(e.target.value) ?? 0; const h = $('#abH'); if (v < 0 || v > 5) { h.textContent = '0 ile 5 gün arasında bir değer yazın.'; return; } h.textContent = '';
    S.ayar = { ...S.ayar, anaBuff: v }; try { await setDoc(doc(db, 'genel', 'ayar'), { anaBuff: v }, { merge: true }); toast(v ? `Ek buff ${yaz(v)} gün.` : 'Ek buff kapatıldı.'); render(); } catch (er) { hata(er); } };
  $('#app').querySelectorAll('[data-ab]').forEach(b => b.onclick = async () => { const id = b.dataset.ab; if (sec.has(id)) sec.delete(id); else sec.add(id); const arr = [...sec];
    S.ayar = { ...S.ayar, anaUrunler: arr }; render(); try { await setDoc(doc(db, 'genel', 'ayar'), { anaUrunler: arr }, { merge: true }); } catch (er) { hata(er); } });
}
function gunSaatPanel() {
  openSheet(`<h2>Gün değişim saati</h2><p class="note">Bu saate kadar yapılan sayım bir önceki günün sayımı olarak kaydedilir, sipariş ekranında da bir önceki günün siparişi bu saate kadar görünür. Gece yarısından sonra çalışan şubeler için. 0–23 arası (0 = gece yarısı).</p>
    <label class="field"><span>Saat</span><input id="gsN" inputmode="numeric" pattern="[0-9]*" value="${gunSaat()}"></label><div class="err" id="gsE"></div>
    <p class="note">Dikkat: sabah bu saatten önce yapılan sayım dünün sayımı sayılır. Haftalık sayım gününü de bu saate göre değerlendirir.</p><div class="btns"><button class="btn" id="gsK">Kaydet</button></div>`, el => {
    el.querySelector('#gsK').onclick = async () => { const raw = el.querySelector('#gsN').value.trim(); const n = parseInt(raw, 10); if (raw === '' || !(n >= 0 && n <= 23)) { el.querySelector('#gsE').textContent = '0 ile 23 arasında bir sayı yazın.'; return; }
      S.ayar = { ...S.ayar, gunSaat: n }; try { await setDoc(doc(db, 'genel', 'ayar'), { gunSaat: n }, { merge: true }); closeSheet(); toast(`Gün değişim saati ${String(n).padStart(2, '0')}:00.`); render(); } catch (e) { hata(e); } };
  });
}
function buffPanel() {
  const sec = new Set(buffListe()); const aday = new Set([...BUFFLAR, ...sec]);
  openSheet(`<h2>Buff seçenekleri</h2><p class="note">Sipariş ekranındaki buff listesinde hangi değerler (gün) çıksın? Dokunarak ekleyin ya da çıkarın. Listede olmayan bir değer isterseniz aşağıdan yazıp ekleyin.</p>
    <div class="chips" id="bfC" style="flex-wrap:wrap"></div>
    <label class="field"><span>Yeni değer (gün)</span><div style="display:flex;gap:8px"><input id="bfN" inputmode="decimal" placeholder="örn. 0,1 ya da 4" style="flex:1"><button class="btn alt" id="bfE" type="button" style="flex:0 0 auto">Ekle</button></div></label>
    <div class="err" id="bfH"></div><div class="btns"><button class="btn" id="bfK">Kaydet</button></div>`, el => {
    const ciz = () => { el.querySelector('#bfC').innerHTML = [...aday].sort((a, b) => a - b).map(b => `<button class="chip ${sec.has(b) ? 'on' : ''}" data-v="${b}">${yaz(b)}</button>`).join(''); el.querySelectorAll('#bfC [data-v]').forEach(c => c.onclick = () => { const v = +c.dataset.v; if (sec.has(v)) sec.delete(v); else sec.add(v); ciz(); }); }; ciz();
    el.querySelector('#bfE').onclick = () => { const v = parseFloat(String(el.querySelector('#bfN').value).replace(',', '.')); if (!isFinite(v) || v < 0 || v > 20) { el.querySelector('#bfH').textContent = '0 ile 20 arasında bir sayı yazın.'; return; } el.querySelector('#bfH').textContent = ''; const r = Math.round(v * 100) / 100; aday.add(r); sec.add(r); el.querySelector('#bfN').value = ''; ciz(); };
    el.querySelector('#bfK').onclick = async () => { if (!sec.size) { el.querySelector('#bfH').textContent = 'En az bir değer seçili olmalı.'; return; }
      try { await setDoc(doc(db, 'genel', 'ayar'), { buff: [...sec].sort((a, b) => a - b) }, { merge: true }); closeSheet(); toast('Buff seçenekleri kaydedildi.'); render(); } catch (e) { hata(e); } };
  });
}
function irsSaklaPanel() {
  openSheet(`<h2>Saklanacak irsaliye</h2><p class="note">Her şubede son kaç irsaliye saklansın? Yenisi kaydedilince en eskisi silinir. SKT ve atık hesabı sadece saklanan irsaliyelere bakar; haftada 2 sevkiyatta 5 irsaliye yaklaşık 2,5 haftayı kapsar (en uzun SKT 10 gün). 1–30 arası.</p>
    <label class="field"><span>İrsaliye sayısı</span><input id="isN" inputmode="numeric" pattern="[0-9]*" value="${irsSakla()}"></label><div class="err" id="isE"></div>
    <p class="note">Sayıyı düşürürseniz fazla irsaliyeler her şubede ilk açılışta silinir, geri alınamaz.</p><div class="btns"><button class="btn" id="isK">Kaydet</button></div>`, el => {
    el.querySelector('#isK').onclick = async () => { const n = parseInt(el.querySelector('#isN').value, 10); if (!n || n < 1 || n > 30) { el.querySelector('#isE').textContent = '1 ile 30 arasında bir sayı yazın.'; return; }
      try { await setDoc(doc(db, 'genel', 'ayar'), { irsSakla: n }, { merge: true }); closeSheet(); toast(`Her şubede son ${n} irsaliye saklanacak.`); } catch (e) { hata(e); } };
  });
}
function aiPanel() {
  openSheet(`<h2>Fotoğraf okuma (Gemini)</h2><p class="note">İrsaliye fotoğraflarını okumak için ücretsiz Gemini API anahtarı. <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> adresinden alıp yapıştırın. Şube hesapları da bu anahtarla irsaliye okutur.</p>
    <label class="field"><span>Gemini API anahtarı</span><input id="aK" type="password" autocomplete="off" value="${esc(S.ai.geminiKey || '')}" placeholder="AIza…"></label>
    <label class="field"><span>Model (boş bırakabilirsiniz)</span><input id="aM" autocomplete="off" value="${esc(S.ai.model || '')}" placeholder="otomatik (önerilen)"></label>
    <div class="err" id="aE"></div><div class="btns"><button class="btn alt" id="aT">Dene</button><button class="btn" id="aS">Kaydet</button></div>`, el => {
    el.querySelector('#aS').onclick = async () => { try { await setDoc(doc(db, 'genel', 'ai'), { geminiKey: el.querySelector('#aK').value.trim(), model: el.querySelector('#aM').value.trim() }, { merge: true }); closeSheet(); toast('Kaydedildi.'); } catch (e) { hata(e); } };
    el.querySelector('#aT').onclick = async () => { const er = el.querySelector('#aE'); er.style.color = 'var(--mut)'; er.textContent = 'Deneniyor…'; const eski = S.ai; S.ai = { geminiKey: el.querySelector('#aK').value.trim(), model: el.querySelector('#aM').value.trim() };
      try { await gemini([{ text: 'Sadece şu JSON\'u döndür: {"ok":true}' }]); er.style.color = 'var(--green)'; er.textContent = 'Çalışıyor ✓ Kaydet\'e basın.'; } catch (e) { er.style.color = 'var(--red)'; er.textContent = AI_MESAJ[e.code] || hataMetni(e); } finally { S.ai = eski; } };
  });
}
async function subeSil(id) {
  const s = S.subeler[id]; if (!s) return;
  if (!(await onayla(`<b>${esc(s.ad)}</b> şubesi, ayarları, sayımları ve irsaliyeleri kalıcı olarak silinecek. Geri alınamaz.`, 'Sil'))) return;
  try {
    const b = writeBatch(db); b.delete(doc(db, 'subeler', id));
    for (const c of ['sayimlar', 'irsaliyeler']) (await getDocs(query(collection(db, c), where('sube', '==', id)))).forEach(d => b.delete(d.ref));
    for (const u of S.kullanicilar) if ((u.subeler || []).includes(id)) b.update(doc(db, 'kullanicilar', u.uid), { subeler: u.subeler.filter(x => x !== id) });
    await b.commit(); toast(`${s.ad} silindi.`); geri();
  } catch (e) { hata(e); }
}

/* ================= Sipariş ================= */
const BUFFLAR = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
// Sipariş ekranındaki buff listesi Ayarlar → Sistem ayarları → Buff seçenekleri'nden seçilir (genel/ayar.buff); boşsa varsayılan liste
const buffListe = () => { const l = S.ayar && Array.isArray(S.ayar.buff) ? S.ayar.buff.map(Number).filter(n => isFinite(n) && n >= 0 && n <= 20) : []; return [...new Set(l.length ? l : BUFFLAR)].sort((a, b) => a - b); };
// Takvimdeki bir sonraki sipariş günleri (bugün dahil)
function siparisGunleri(sb) {
  const t = sb.takvim || []; const bg = isGunu(); const out = []; // iş günü: sabah 06:00'a kadar bir önceki gün sayılır (gece verilen sipariş sabaha kadar görünür)
  for (let i = 0; i < 8; i++) { const d = gunEkle(bg, i); const k = t.find(x => x.gun === haftaGunu(d)); if (k) out.push({ tarih: d, sure: k.sure }); }
  return out;
}
const idealAralik = (tarih, sure) => ({ bas: gunEkle(tarih, -6), son: gunEkle(tarih, -6 + sure - 1) }); // ör. Pzt 19 → 13–17, Per 22 → 16–21
function eldeBul(u) { const st = stokBul(u); if (!st) return null; let t = st.t; for (const ir of S.irsaliyeler) if (ir.tarih > st.sy.tarih) for (const k of ir.kalemler || []) if (k.u === u) t += k.miktar; return { t: r6(t), sy: st.sy }; }
function siparisEkrani() {
  const sb = sube(); const gunler = siparisGunleri(sb);
  if (!(sb.takvim || []).length) { $('#app').innerHTML = ust(`${sb.ad} · Sipariş`) + `<div class="empty"><b>Sevkiyat takvimi girilmemiş</b>${admin() ? 'Ayarlar → Şube → Sevkiyat takvimi bölümünden sipariş günlerini girin.' : 'Yöneticiye haber verin.'}</div>`; return bagla(); }
  if (!S.spTarih || !gunler.find(g => g.tarih === S.spTarih)) S.spTarih = gunler[0].tarih;
  const g = gunler.find(x => x.tarih === S.spTarih); const D = g.sure; const ar = idealAralik(g.tarih, D);
  const id = `${S.subeId}_${g.tarih}`; const kayit = S.siparisler.find(x => x.id === id) || {}; const taslakKur = () => ({ id, z: kayit.zaman || '', kirli: false, ideal: { ...(kayit.ideal || {}) }, liste: { ...(kayit.liste || {}) }, elde: { ...(kayit.elde || {}) }, buff: kayit.buff ?? 0.5, not: kayit.not || '' });
  if (!(S.spTaslak && S.spTaslak.id === id && S.spTaslak.elde)) S.spTaslak = taslakKur();
  else if (S.spTaslak.kirli && S.spTaslak.sonYaz && kayit.zaman === S.spTaslak.sonYaz) { S.spTaslak.kirli = false; S.spTaslak.z = kayit.zaman; } // kendi yazdığımız geri geldi
  else if (!S.spTaslak.kirli && S.spTaslak.z !== (kayit.zaman || '')) S.spTaslak = taslakKur(); // kimse elle değiştirmediyse sunucudaki güncel veriyi al (geç gelen / başkasının yazdığı)
  const T = S.spTaslak; const buff = T.buff;
  S.kilitIstek = 'siparisler/' + id; const kd = kilitDurum(S.kilitIstek, S.siparisler.find(x => x.id === id)); KILIT.kilitli = !!kd;
  const urs = siparisListesi(sb);
  const satir = u => { const x = S.urunler[u]; const ideal = T.ideal[u]; const sonEl = eldeBul(u); const elElle = !sayimdaMi(sb, u, 'gunluk'); const ov = elElle ? T.elde[u] : null; const el = ov != null ? { t: ov } : sonEl; const kBos = !(x.sKoli > 0); const k = kBos ? null : x.sKoli;
    const hedef = ideal != null ? r6(ideal / D * (D + buff + (anaMi(u) ? anaMiktar() : 0))) : null; const koli = hedef != null && el && k ? r6((hedef - el.t) / k) : null; const oneri = koli != null ? Math.max(0, Math.ceil(koli)) : '';
    const n = v => v == null ? '–' : fmt(v, x.birim === 'adet' ? 'adet' : 'kg');
    return `<tr><td style="text-align:left;font-weight:600;font-size:12.5px">${esc(x.ad)}<div class="note" style="margin:0;font-size:10.5px">${kBos ? '<b style="color:var(--amber)">koli boş!</b>' : 'koli ' + yaz(k)}</div></td>
      <td><input class="spI" data-u="${u}" inputmode="decimal" enterkeyhint="next" value="${yaz(ideal)}" style="width:62px"></td>
      <td>${n(hedef)}</td><td>${elElle ? `<input class="spE" data-u="${u}" inputmode="decimal" enterkeyhint="next" value="${yaz(ov)}" placeholder="${sonEl ? yaz(sonEl.t) : 'yaz'}" title="Elle yazın; boşsa son sayım kullanılır" style="width:58px;border-color:var(--amber)">` : el ? n(el.t) : '<span style="color:var(--amber)">yok</span>'}</td>
      <td class="${koli != null && koli <= 0 ? 'neg' : 'b'}">${kBos ? '<span style="color:var(--amber);font-size:11px">koli?</span>' : koli == null ? '–' : koli <= 0 ? 'yeter' : yaz(Math.round(koli * 10) / 10)}</td>
      <td><input class="spL" data-u="${u}" inputmode="numeric" enterkeyhint="next" value="${T.liste[u] ?? ''}" placeholder="${oneri}" style="width:50px;font-weight:800"></td></tr>`; };
  const son = [...S.sayimlar].sort((a, b) => sonZaman(b).localeCompare(sonZaman(a)))[0];
  const eskiSayim = !son || son.tarih < gunEkle(isGunu(), 0);
  $('#app').innerHTML = ust(`${sb.ad} · Sipariş`, { alt: `${trTarih(g.tarih)} siparişi · gün sayısı ${D}` }) + `<div class="pad sp">
    <div style="display:flex;gap:8px;align-items:center">${gunler.length > 1 ? `<div class="chips" style="flex:1;min-width:0">${gunler.slice(0, 4).map(x => `<button class="chip ${x.tarih === g.tarih ? 'on' : ''}" data-t="${x.tarih}">${trTarih(x.tarih).split(' ').slice(0, 3).join(' ')}</button>`).join('')}</div>` : '<div style="flex:1"></div>'}
      <select id="spB" title="Buff (gün): hedef = ideal ÷ gün × (gün + buff)" style="flex:0 0 auto;padding:8px 10px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:inherit;font-weight:700;font:inherit">${[...new Set([...buffListe(), buff])].sort((a, b) => a - b).map(b => `<option value="${b}" ${b === buff ? 'selected' : ''}>Buff ${yaz(b)}</option>`).join('')}</select></div>
    <div class="card p" style="background:var(--blue-soft);border-color:transparent">Domino's'tan ideali <b style="color:var(--blue)">${trTarih(ar.bas)} – ${trTarih(ar.son)}</b> aralığıyla alın (${D} gün).</div>
    ${kd ? kilitKart(kd) : ''}
    ${(() => { const bos = urs.filter(u => !(S.urunler[u].sKoli > 0)); return bos.length ? `<div class="card p" style="background:var(--amber-soft);border-color:transparent"><b style="color:var(--amber)">${bos.length} üründe sipariş kolisi boş</b><p class="note">${bos.map(u => esc(urunAd(u))).join(', ')}. Bu ürünlerde koli önerisi hesaplanmaz, yanlış sipariş vermemek için ${admin() ? 'Ayarlar → Ürünler\'den "Sipariş kolisi"ni doldurun.' : 'yöneticiye haber verin.'}</p></div>` : ''; })()}
    ${eskiSayim ? `<div class="card p" style="background:var(--amber-soft);border-color:transparent"><b style="color:var(--amber)">${son ? `Son sayım ${trTarih(son.tarih)}.` : 'Sayım yok.'}</b><p class="note">Siparişten önce bugünün günlük sayımını yapın; "Elde" sütunu son sayımdan gelir.</p></div>` : ''}
    <div class="card" style="overflow-x:auto"><table class="st spT"><tr style="font-size:10px;color:var(--mut);text-transform:uppercase;font-weight:800"><td style="text-align:left">Ürün <button id="spSira" title="Sipariş sırasını düzenle" style="border:0;background:none;font-size:14px;padding:0 4px;color:var(--blue)">✎</button></td><td>İdeal <button id="spYap" title="Excel'den toplu yapıştır" style="border:0;background:none;font-size:13px;padding:0 3px">📋</button><button id="spSif" title="Sıfırla" style="border:0;background:none;font-size:14px;padding:0 3px;color:var(--red)">↺</button></td><td>Hedef</td><td>Elde</td><td>Koli</td><td>Liste</td></tr>${urs.length ? (() => { const el = urs.filter(u => !sayimdaMi(sb, u, 'gunluk')); const son = el[el.length - 1]; return urs.map(u => satir(u) + (u === son ? `<tr><td colspan="6" style="text-align:left;font-size:11px;color:var(--amber);line-height:1.35;padding:6px 8px">☝ Bu ürünler günlük sayımda sayılmaz. <b>Elde</b> miktarını elle yazın; boş bırakırsanız son sayımdaki${(() => { const e = eldeBul(u); return e ? ` (${trTarih(e.sy.tarih)})` : ''; })()} miktar kullanılır.</td></tr>` : '')).join(''); })() : '<tr><td colspan="6"><div class="empty" style="padding:16px">Sipariş listesinde ürün yok. Ayarlar → Ürünler listesinde "Sipariş" işaretleyin.</div></td></tr>'}</table></div>
    <p class="note">Koli = (ideal ÷ ${D} × (${D} + buff${anaMiktar() ? ' + ana malzemelerde ek buff' : ''}) − elde) ÷ sipariş kolisi. Liste'yi siz yazarsınız; boş bırakılan satırda soluk rakam öneridir. Günlük sayımda sayılmayan ürünlerde (örn. pizza kutuları) <b>Elde</b>'yi elle yazabilirsiniz; boş bırakırsanız son sayım kullanılır.</p>
    <label class="field"><span>Not (alacak / borç vb.)</span><input id="spN" value="${esc(T.not)}"></label>
    <div class="btns"><button class="btn" id="spP">Listeyi paylaş</button>${admin() ? '<button class="btn alt" id="spG">Geçmiş</button>' : ''}</div>
    <p class="note" style="text-align:center">${kayit.zaman ? `Kaydedildi · ${esc(kayit.kim || '')} ${saat(kayit.zaman)}` : 'Yazdıkça kaydedilir.'}</p></div>`;
  bagla();
  const kkS = $('#kilKal'); if (kkS) kkS.onclick = kilitKaldir; const spG = $('#spG'); if (spG) spG.onclick = () => yedekPanel('siparisler/' + id);
  if (kd) { $('#app').querySelectorAll('.sp input, .sp select, .sp textarea').forEach(e => { e.disabled = true; }); ['spYap', 'spSif', 'spSira'].forEach(i => { const b = $('#' + i); if (b) b.hidden = true; }); }
  S.spT ||= {}; const kaydet = () => { if (KILIT.kilitli) return; const sv = S.siparisler.find(x => x.id === id); if (!T.sifir && !yedekSay(T.ideal) && sv && yedekSay(sv.ideal)) { toast('Tüm idealler boşaltılamaz. Silmek için ↺ İdealleri sıfırla\'yı kullanın.'); return; } T.kirli = true; clearTimeout(S.spT[id]); S.spT[id] = setTimeout(() => { const zaman = new Date().toISOString(); T.sonYaz = zaman; return setDoc(doc(db, 'siparisler', id), { sube: S.subeId, tarih: g.tarih, sure: D, buff: T.buff, ideal: T.ideal, liste: T.liste, elde: T.elde, not: T.not, kim: benAd(), zaman, ...(KILIT.sahip && KILIT.k === 'siparisler/' + id ? { kilit: kilitNesne() } : {}) }).catch(hata); }, 600); };
  $('#app').querySelectorAll('[data-t]').forEach(b => b.onclick = () => { S.spTarih = b.dataset.t; S.spTaslak = null; render(); });
  $('#spSira').onclick = () => go({ tab: 'ayarlar', syId: null, ar: 'siparissira:' + S.subeId });
  $('#spB').onchange = e => { T.buff = +e.target.value; kaydet(); render(); };
  const girdiler = [...$('#app').querySelectorAll('.spI')];
  // Excel'den (Pulse) kopyalanan ideal sütununu yapıştır: alt alta satırlar, sipariş listesindeki sırayla
  const sayiTr = h => { h = String(h ?? '').trim().replace(/\s/g, ''); if (!h || !/^-?[\d.,]+$/.test(h)) return null; if (/^-?\d{1,3}(\.\d{3})+$/.test(h)) h = h.replace(/\./g, ''); return sayiOku(h); };
  const idealYapistir = (metin, basla) => {
    const satirlar = metin.replace(/\r/g, '').split('\n').filter((x, i, a) => !(i === a.length - 1 && x === '')).map(l => l.split('\t'));
    const adli = satirlar.map(c => { const ad = c.find(h => h.trim() && sayiTr(h) == null); return ad ? ascii(ad).replace(/[^a-z0-9]/g, '') : null; });
    const anahtar = urs.map(u => ascii(S.urunler[u].ad).replace(/[^a-z0-9]/g, ''));
    const adEslesen = adli.filter(a => a && anahtar.includes(a)).length; let n = 0;
    if (adEslesen >= Math.max(2, satirlar.length / 2)) { // ad sütunu da yapıştırıldıysa ada göre eşle
      satirlar.forEach((c, i) => { const k = anahtar.indexOf(adli[i]); if (k < 0) return; const v = [...c].reverse().map(sayiTr).find(x => x != null); if (v != null) { T.ideal[urs[k]] = v; n++; } });
    } else satirlar.forEach((c, i) => { const u = urs[basla + i]; if (!u) return; const v = [...c].reverse().map(sayiTr).find(x => x != null); if (v != null) { T.ideal[u] = v; n++; } });
    if (n) { kaydet(); const y = window.scrollY; render(); window.scrollTo(0, y); toast(`${n} ideal yapıştırıldı.`); } else toast('Yapıştırılacak sayı bulunamadı.');
    return n;
  };
  $('#app').querySelectorAll('.spI').forEach(inp => inp.addEventListener('paste', e => { const m = (e.clipboardData || window.clipboardData).getData('text'); if (!/[\n\t]/.test(m.trim())) return; e.preventDefault(); idealYapistir(m, urs.indexOf(inp.dataset.u)); }));
  $('#spSif').onclick = () => openSheet(`<h2>Sıfırla</h2><p class="note">${trTarih(g.tarih)} siparişi için. Diğer sipariş günleri etkilenmez.</p><div class="card" style="margin-top:10px">
      <button class="row" data-s="ideal"><div class="m"><b style="color:var(--red)">İdealleri sıfırla</b><span>${Object.keys(T.ideal).length} ürünün ideali silinir</span></div></button>
      <button class="row" data-s="liste"><div class="m"><b style="color:var(--red)">Listeyi sıfırla</b><span>${Object.keys(T.liste).length} ürünün yazılan kolisi silinir</span></div></button>
      <button class="row" data-s="hepsi"><div class="m"><b style="color:var(--red)">Hepsini sıfırla</b><span>İdeal, liste ve elle yazılan elde miktarları</span></div></button></div><button class="btn alt" id="sK" style="margin-top:6px">Vazgeç</button>`, el => {
    el.querySelector('#sK').onclick = closeSheet;
    el.querySelectorAll('[data-s]').forEach(b => b.onclick = async () => { const t = b.dataset.s; closeSheet();
      if (!(await onayla(t === 'ideal' ? 'Bu siparişin <b>idealleri</b> silinecek.' : t === 'liste' ? 'Bu siparişin <b>liste</b> kolileri silinecek.' : 'Bu siparişin <b>ideal, liste ve elle yazılan elde</b> miktarları silinecek.', 'Sıfırla'))) return;
      if (t === 'ideal' || t === 'hepsi') { T.ideal = {}; T.sifir = true; } if (t === 'liste' || t === 'hepsi') T.liste = {}; if (t === 'hepsi') T.elde = {};
      kaydet(); const y = window.scrollY; render(); window.scrollTo(0, y); toast('Sıfırlandı.'); }); });
  $('#spYap').onclick = () => openSheet(`<h2>İdealleri yapıştır</h2><p class="note">Pulse'tan kopyaladığınız ideal sütununu buraya yapıştırın. Sipariş listesindeki ürün sırasıyla (ya da ürün adı da kopyalandıysa ada göre) doldurulur.</p><textarea id="yt" rows="9" style="width:100%;font-size:14px;padding:10px;border:1px solid var(--line);border-radius:10px" placeholder="1589&#10;300&#10;..."></textarea><div class="btns"><button class="btn" id="yk">Uygula</button></div>`, el => { el.querySelector('#yt').focus(); el.querySelector('#yk').onclick = () => { const m = el.querySelector('#yt').value; closeSheet(); idealYapistir(m, 0); }; });
  $('#app').querySelectorAll('.spI,.spL,.spE').forEach(inp => {
    inp.onchange = () => { const u = inp.dataset.u; const v = sayiOku(inp.value); const hedef = inp.classList.contains('spI') ? T.ideal : inp.classList.contains('spE') ? T.elde : T.liste; if (v == null) delete hedef[u]; else hedef[u] = v; kaydet(); const y = window.scrollY; const odak = document.activeElement && document.activeElement.classList.contains('spI') ? document.activeElement.dataset.u : null; render(); window.scrollTo(0, y); if (odak) { const e = $(`.spI[data-u="${odak}"]`); if (e) e.focus(); } };
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const kl = inp.classList.contains('spI') ? '.spI' : inp.classList.contains('spE') ? '.spE' : '.spL'; const l = [...$('#app').querySelectorAll(kl)]; const i = l.indexOf(inp); inp.blur(); const nx = l[i + 1]; if (nx) nx.focus(); } };
  });
  $('#spN').onchange = e => { T.not = e.target.value; kaydet(); };
  $('#spP').onclick = async () => {
    const satirlar = urs.map(u => { const v = T.liste[u]; return v ? `${S.urunler[u].ad}: ${yaz(v)} koli` : null; }).filter(Boolean);
    if (!satirlar.length) return toast('Liste boş. Liste sütununa koli sayılarını yazın.', true);
    const metin = `${sb.ad} · ${trTarih(g.tarih)} siparişi\n\n${satirlar.join('\n')}${T.not ? `\n\nNot: ${T.not}` : ''}`;
    if (navigator.share) { try { await navigator.share({ text: metin }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(metin); toast('Liste kopyalandı.'); } catch (e) { openSheet(`<h2>Liste</h2><textarea style="width:100%;height:50vh;font:inherit">${esc(metin)}</textarea>`); }
  };
}
function takvimPanel(sid) {
  const s = S.subeler[sid]; let t = JSON.parse(JSON.stringify(s.takvim || []));
  const ciz = el => { el.querySelector('#tl').innerHTML = t.map((x, i) => `<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><select data-i="${i}" class="tG" style="flex:1;font:inherit;padding:9px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink)">${GUNU.map((g, j) => `<option value="${j}" ${j === x.gun ? 'selected' : ''}>${g}</option>`).join('')}</select><input data-i="${i}" class="tS" inputmode="numeric" value="${x.sure}" style="width:60px;font:inherit;font-size:16px;padding:9px;border:1px solid var(--line);border-radius:9px;text-align:center;background:var(--surface);color:var(--ink)"><span class="note" style="margin:0">gün</span><button class="x" data-sil="${i}">✕</button></div>`).join('') || '<p class="note">Sipariş günü yok.</p>';
    el.querySelectorAll('.tG').forEach(x => x.onchange = () => { t[+x.dataset.i].gun = +x.value; });
    el.querySelectorAll('.tS').forEach(x => x.onchange = () => { t[+x.dataset.i].sure = Math.max(1, Math.round(sayiOku(x.value) || 1)); });
    el.querySelectorAll('[data-sil]').forEach(x => x.onclick = () => { t.splice(+x.dataset.sil, 1); ciz(el); }); };
  openSheet(`<h2>Sevkiyat takvimi</h2><p class="note">${esc(s.ad)}: sipariş verilen günler ve her siparişin kaç günü karşılaması gerektiği (bir sonraki malın kesin kullanılabileceği güne kadar). İdeal aralığı sipariş gününden 6 gün önce başlar, gün sayısı kadar sürer.</p>
    <div id="tl" style="margin-top:12px"></div><button class="btn alt sm" id="tE">+ Sipariş günü ekle</button>
    <div class="btns"><button class="btn" id="tK">Kaydet</button></div>`, el => {
    ciz(el); el.querySelector('#tE').onclick = () => { t.push({ gun: 0, sure: 5 }); ciz(el); };
    el.querySelector('#tK').onclick = () => { t.sort((a, b) => a.gun - b.gun); s.takvim = t; subeKaydet(sid, { takvim: t }); closeSheet(); render(); };
  });
}

/* ================= Ayarlar (sadece yönetici) ================= */
function ayarlar() {
  const r = S.ar || ''; const [sayfa, a1, a2] = r.split(':');
  if (!admin()) { // şube hesabı: sadece kendi şubesinin konum ve listeleri
    const izin = id => (S.me.subeler || []).includes(id);
    if (sayfa === 'konum' && izin(a1)) return konumAyar(a1, a2);
    if (sayfa === 'sonucsira' && izin(a1)) return sonucSiraAyar(a1);
    if (sayfa === 'siparissira' && izin(a1)) return siparisSiraAyar(a1);
    if (sayfa === 'yerler' && izin(a1)) return yerlerAyar(a1);
    if (!S.subeId) { $('#app').innerHTML = ust('Ayarlar') + '<div class="empty"><b>Şube yok</b></div>'; return bagla(); }
    return subeAyar(S.subeId, true);
  }
  if (sayfa === 'sube') return subeAyar(a1);
  if (sayfa === 'konum') return konumAyar(a1, a2);
  if (sayfa === 'sonucsira') return sonucSiraAyar(a1);
  if (sayfa === 'siparissira') return siparisSiraAyar(a1);
  if (sayfa === 'yerler') return yerlerAyar(a1);
  if (sayfa === 'urunler') return urunlerAyar();
  if (sayfa === 'kullanicilar') return kullanicilarAyar();
  if (sayfa === 'subeler') return subelerAyar();
  if (sayfa === 'sistem') return sistemAyar();
  if (sayfa === 'anamalzeme') return anaMalzemeAyar();
  const ids = Object.keys(S.subeler).sort((a, b) => S.subeler[a].ad.localeCompare(S.subeler[b].ad, 'tr'));
  const urunSay = Object.keys(S.urunler).length;
  const adlar = ids.slice(0, 3).map(id => S.subeler[id].ad).join(', ') + (ids.length > 3 ? '…' : '');
  $('#app').innerHTML = ust('Ayarlar', { subeSecici: false }) + `<div class="pad">
    ${!urunSay ? `<div class="card p"><h3>Başlangıç verisi</h3><p class="note">Serik Excel'indeki 105 ürün, Serik şubesinin 6 konumu ve sonuç sırası yüklenir. Sonra her şeyi buradan düzenleyebilirsiniz.</p><div class="btns"><button class="btn" id="seed">Serik Excel verisini yükle</button></div></div>` : ''}
    <div class="card">
      <button class="row" id="gSub"><div class="m"><b>Şubeler</b><span>${ids.length} şube${adlar ? ' · ' + esc(adlar) : ''}</span></div><span class="ch">›</span></button>
      <button class="row" id="gKul"><div class="m"><b>Kullanıcılar</b><span>${S.kullanicilar.length} hesap</span></div><span class="ch">›</span></button>
      <button class="row" id="gUrun"><div class="m"><b>Ürünler</b><span>${urunSay} ürün · koli içi, SKT ve çözülme günleri</span></div><span class="ch">›</span></button>
      <button class="row" id="gSis"><div class="m"><b>Sistem ayarları</b><span>Fotoğraf okuma, saklanacak irsaliye, ürün yükleme</span></div><span class="ch">›</span></button></div></div>`;
  bagla();
  const sd = $('#seed'); if (sd) sd.onclick = seedYukle;
  $('#gSub').onclick = () => go({ ar: 'subeler' }); $('#gKul').onclick = () => go({ ar: 'kullanicilar' }); $('#gSis').onclick = () => go({ ar: 'sistem' });
  $('#gUrun').onclick = () => { S.urunAra = ''; S.urunFg = S.urunFs = 'hepsi'; go({ ar: 'urunler' }); };
}
function subelerAyar() {
  const ids = Object.keys(S.subeler).sort((a, b) => S.subeler[a].ad.localeCompare(S.subeler[b].ad, 'tr'));
  $('#app').innerHTML = ust('Şubeler', { geri: true, subeSecici: false, alt: `${ids.length} şube` }) + `<div class="pad"><div class="card">${ids.map(id => { const s = S.subeler[id]; const n = (s.konumlar || []).reduce((t, k) => t + (k.satirlar || []).length, 0); return `<button class="row" data-sb="${id}"><div class="m"><b>${esc(s.ad)}${s.aktif === false ? ' <span class="tag">Kapalı</span>' : ''}</b><span>${(s.konumlar || []).length} konum · ${n} satır · haftalık sayım ${GUNU[s.haftalikGun ?? 6]}</span></div><span class="ch">›</span></button>`; }).join('')}
    <button class="row" id="yeniSube"><div class="m"><b style="color:var(--blue)">+ Yeni şube</b></div></button></div></div>`;
  bagla();
  $('#app').querySelectorAll('[data-sb]').forEach(b => b.onclick = () => go({ ar: 'sube:' + b.dataset.sb })); $('#yeniSube').onclick = yeniSube;
}
function sistemAyar() {
  $('#app').innerHTML = ust('Sistem ayarları', { geri: true, subeSecici: false }) + `<div class="pad"><div class="card">
      <button class="row" id="gAi"><div class="m"><b>Fotoğraf okuma (Gemini)</b><span>${S.ai.geminiKey ? 'Anahtar girildi · irsaliye fotoğrafları okunur' : 'Anahtar girilmedi · irsaliye sadece elle girilir'}</span></div><span class="ch">›</span></button>
      <button class="row" id="gIrs"><div class="m"><b>Saklanacak irsaliye</b><span>Her şubede son ${irsSakla()} irsaliye saklanır · SKT hesabı bunlara bakar</span></div><span class="ch">›</span></button>
      <button class="row" id="gGecmis"><div class="m"><b>Geçmiş (yedek) süresi</b><span>Sipariş ve sayım yedekleri ${yedekGun()} gün saklanır · Sipariş ve Sonuç ekranındaki "Geçmiş"ten geri dönülür</span></div><span class="ch">›</span></button>
      <button class="row" id="gBuff"><div class="m"><b>Buff seçenekleri</b><span>${buffListe().map(yaz).join(' · ')}</span></div><span class="ch">›</span></button>
      <button class="row" id="gGun"><div class="m"><b>Gün değişim saati</b><span>Saat ${String(gunSaat()).padStart(2, '0')}:00'a kadar bir önceki gün sayılır · sayım tarihi ve sipariş günleri</span></div><span class="ch">›</span></button>
      <button class="row" id="gAna"><div class="m"><b>Ana malzeme buffı</b><span>${(() => { const n = (S.ayar.anaUrunler || []).filter(id => S.urunler[id]).length; return n && anaMiktar() ? `${n} ürün · buffa ek ${yaz(anaMiktar())} gün` : 'Kapalı · hamur, mozzarella gibi ürünlere ek pay'; })()}</span></div><span class="ch">›</span></button>
      <button class="row" id="seed2"><div class="m"><b>Excel'den ürün yükle</b><span>Serik Excel'indeki ürünler · olanlara dokunulmaz, eksikler eklenir</span></div><span class="ch">›</span></button></div></div>`;
  bagla();
  $('#gAi').onclick = aiPanel; $('#gIrs').onclick = irsSaklaPanel; $('#gGecmis').onclick = yedekAyarPanel; $('#gBuff').onclick = buffPanel; $('#gGun').onclick = gunSaatPanel; $('#gAna').onclick = () => go({ ar: 'anamalzeme' }); $('#seed2').onclick = seedYukle;
}
async function seedYukle() {
  const { SEED } = await import('./seed.js?v=11');
  const adId = {}; Object.entries(S.urunler).forEach(([id, x]) => adId[x.ad] = id);
  const yeni = Object.values(SEED.urunler).filter(x => !adId[x.ad]).length;
  const geri = Object.values(SEED.urunler).filter(x => adId[x.ad] && S.urunler[adId[x.ad]].aktif === false).length;
  const serikBos = !S.subeler.serik || !(S.subeler.serik.konumlar || []).some(k => (k.satirlar || []).length);
  if (!(await onayla(`Serik Excel'inden <b>${yeni}</b> yeni ürün eklenecek${geri ? `, kaldırılmış <b>${geri}</b> ürün geri alınacak` : ''}. Listede zaten olan ürünlere dokunulmaz.${serikBos ? '<br><br>Serik şubesinin 6 konumu, hangi ürünün nerede sayıldığı ve sonuç sırası da Excel\'deki gibi kurulacak.' : ''}`, 'Yükle'))) return;
  const eslem = {}; const ekle = {}; const sira0 = Math.max(0, ...Object.values(S.urunler).map(x => x.sira ?? 0)) + 1;
  Object.entries(SEED.urunler).forEach(([sid, x], i) => {
    const var_ = adId[x.ad];
    if (var_) { eslem[sid] = var_; if (S.urunler[var_].aktif === false) { const e = S.urunler[var_]; const dolu = Object.fromEntries(Object.entries(e).filter(([, v]) => v != null && v !== '')); ekle[var_] = { ...x, ...dolu, aktif: true, kaldirma: null }; } return; }
    let id = sid; if (S.urunler[id]) id = yeniId('u'); eslem[sid] = id; ekle[id] = { ...x, sira: Object.keys(S.urunler).length ? sira0 + i : x.sira };
  });
  const b = writeBatch(db); b.set(doc(db, 'genel', 'urunler'), { u: ekle }, { merge: true });
  if (serikBos) { const m = u => eslem[u] || u; b.set(doc(db, 'subeler', 'serik'), { ad: S.subeler.serik?.ad || 'Serik', aktif: true, haftalikGun: S.subeler.serik?.haftalikGun ?? SEED.sube.haftalikGun, gunluk: S.subeler.serik?.gunluk || [], konumlar: SEED.sube.konumlar.map(k => ({ ...k, satirlar: k.satirlar.map(x => ({ ...x, u: m(x.u) })) })), sonuc: SEED.sube.sonuc.map(m) }, { merge: true }); }
  try { await b.commit(); toast(`Excel'den ${yeni} ürün yüklendi.`); } catch (e) { hata(e); }
}
function yeniSube() {
  openSheet(`<h2>Yeni şube</h2><label class="field"><span>Şube adı</span><input id="sa" placeholder="Örn. Belek"></label>
    <label class="field"><span>Ayarları kopyala (isteğe bağlı)</span><select id="sk"><option value="">Boş başla</option>${Object.keys(S.subeler).map(id => `<option value="${id}">${esc(S.subeler[id].ad)}</option>`).join('')}</select></label>
    <p class="note">Kopyalanırsa konumlar, konumlardaki ürünler, sonuç sırası ve günlük liste aynen gelir; sonra düzenlersiniz.</p><div class="err" id="se"></div><div class="btns"><button class="btn" id="sy">Ekle</button></div>`, el => {
    el.querySelector('#sy').onclick = async () => {
      const ad = el.querySelector('#sa').value.trim(); if (!ad) return el.querySelector('#se').textContent = 'Şube adı yazın.';
      let id = slug(ad); while (S.subeler[id]) id += '2';
      const kaynak = S.subeler[el.querySelector('#sk').value];
      const data = { ad, aktif: true, haftalikGun: kaynak?.haftalikGun ?? 6, konumlar: kaynak ? JSON.parse(JSON.stringify(kaynak.konumlar || [])) : [{ id: 'makeline', ad: 'Makeline', satirlar: [] }, { id: 'walkin', ad: 'Walk-in', satirlar: [] }, { id: 'dolap', ad: 'Dolap', satirlar: [] }, { id: 'kurudepo', ad: 'Kuru Depo', satirlar: [] }, { id: 'depo', ad: 'Depo', satirlar: [] }], sonuc: kaynak ? [...(kaynak.sonuc || [])] : [], gunluk: kaynak ? [...(kaynak.gunluk || [])] : [], isaret: kaynak ? JSON.parse(JSON.stringify(kaynak.isaret || {})) : {} };
      try { await setDoc(doc(db, 'subeler', id), data); closeSheet(); go({ ar: 'sube:' + id }); } catch (e) { hata(e); }
    };
  });
}
const isaretKaydet = (id, o) => updateDoc(doc(db, 'subeler', id), { isaret: o }).catch(hata); // merge haritaları birleştirir; silinen kayıt kalmasın diye alan komple değiştirilir
const subeKaydet = (id, patch) => setDoc(doc(db, 'subeler', id), patch, { merge: true }).catch(hata);
function subeAyar(id, kok) {
  const s = S.subeler[id]; if (!s) { $('#app').innerHTML = ust('Şube', { geri: true }) + '<div class="empty"><b>Şube yok</b></div>'; return bagla(); }
  const ks = s.konumlar || []; const yon = admin();
  $('#app').innerHTML = ust(kok ? `${s.ad} · Ayarlar` : s.ad, { geri: !kok, subeSecici: !!kok, alt: kok ? `Haftalık sayım günü: ${GUNU[s.haftalikGun ?? 6]}` : 'Şube ayarları' }) + `<div class="pad">
    ${kok ? `<p class="note" style="margin:0 0 8px">Bu ayarlar sadece ${esc(s.ad)} şubesini etkiler. Ürün listesine yeni ürünü yönetici ekler.</p>` : ''}
    <div class="card p" ${yon ? '' : 'hidden'}><div class="grid2"><label class="field"><span>Şube adı</span><input id="sAd" value="${esc(s.ad)}"></label>
    <label class="field"><span>Haftalık sayım günü</span><select id="sHg">${GUNU.map((g, i) => `<option value="${i}" ${i === (s.haftalikGun ?? 6) ? 'selected' : ''}>${g}</option>`).join('')}</select></label></div>
    <label class="chk" style="padding:6px 0;border:0"><input type="checkbox" id="sAk" ${s.aktif !== false ? 'checked' : ''}> Şube açık</label></div>
    <div class="sec">Konumlar · sürükleyip sıralayın</div><div class="card sl" id="kl">${ks.map(k => `<div class="si"><span class="drag">≡</span><button class="row" style="padding:4px 0;border:0" data-k="${k.id}"><div class="m"><b>${esc(k.ad)}</b><span>${(k.satirlar || []).length} ürün</span></div><span class="ch">›</span></button></div>`).join('')}
      <div class="si"><button class="row" style="padding:4px 0;border:0" id="kEkle"><div class="m"><b style="color:var(--blue)">+ Konum ekle</b></div></button></div></div>
    <div class="sec">Listeler</div><div class="card">
      <button class="row" id="sYer"><div class="m"><b>Ürün yerleri</b><span>Hangi ürün hangi konumda sayılır · tek ekranda</span></div><span class="ch">›</span></button>
      <button class="row" id="sTak" ${yon ? '' : 'hidden'}><div class="m"><b>Sevkiyat takvimi</b><span>${(s.takvim || []).length ? (s.takvim || []).map(t => `${GUNU[t.gun]} (${t.sure} gün)`).join(' · ') : 'girilmemiş'}</span></div><span class="ch">›</span></button>
      <button class="row" id="sSon"><div class="m"><b>Sonuç sırası</b><span>${sonucListesi(s).length} ürün · Domino's sistemindeki sıra</span></div><span class="ch">›</span></button></div>
    <div class="sec" ${yon ? '' : 'hidden'}>Diğer</div><div class="card" ${yon ? '' : 'hidden'}><button class="row" id="sSil"><div class="m"><b style="color:var(--red)">Şubeyi sil</b><span>Şube, ayarları, sayımları ve irsaliyeleri silinir</span></div></button><button class="row" id="sKop"><div class="m"><b>Başka şubeden kopyala</b><span>Konumlar, sonuç sırası ve günlük liste değiştirilir</span></div><span class="ch">›</span></button></div></div>`;
  bagla();
  if (!yon) { $('#sAd').disabled = $('#sHg').disabled = $('#sAk').disabled = true; }
  if (yon) $('#sSil').onclick = () => subeSil(id);
  $('#sAd').onchange = e => { const v = e.target.value.trim(); if (v) subeKaydet(id, { ad: v }); };
  $('#sHg').onchange = e => subeKaydet(id, { haftalikGun: +e.target.value });
  $('#sAk').onchange = e => subeKaydet(id, { aktif: e.target.checked });
  $('#app').querySelectorAll('[data-k]').forEach(b => b.onclick = () => go({ ar: `konum:${id}:${b.dataset.k}` }));
  suruklenebilir($('#kl'), (a, b) => { const yeni = [...ks]; yeni.splice(b, 0, yeni.splice(a, 1)[0]); s.konumlar = yeni; subeKaydet(id, { konumlar: yeni }); render(); });
  $('#kEkle').onclick = () => openSheet(`<h2>Konum ekle</h2><label class="field"><span>Konum adı</span><input id="ka" placeholder="Örn. Soğuk Hava Deposu"></label><div class="btns"><button class="btn" id="kk">Ekle</button></div>`, el => {
    el.querySelector('#kk').onclick = () => { const ad = el.querySelector('#ka').value.trim(); if (!ad) return; let kid = slug(ad); while (ks.find(k => k.id === kid)) kid += '2'; const yeni = [...ks, { id: kid, ad, satirlar: [] }]; subeKaydet(id, { konumlar: yeni }); closeSheet(); go({ ar: `konum:${id}:${kid}` }); };
  });
  $('#sYer').onclick = () => go({ ar: 'yerler:' + id, yerAra: '', yerFiltre: 'hepsi' }); $('#sSon').onclick = () => go({ ar: 'sonucsira:' + id }); if (yon) $('#sTak').onclick = () => takvimPanel(id);
  $('#sKop').onclick = () => openSheet(`<h2>Başka şubeden kopyala</h2><p class="note">${esc(s.ad)} şubesinin konumları, sonuç sırası ve günlük listesi seçtiğiniz şubeninkiyle değiştirilecek.</p><label class="field"><span>Kaynak şube</span><select id="kq">${Object.keys(S.subeler).filter(x => x !== id).map(x => `<option value="${x}">${esc(S.subeler[x].ad)}</option>`).join('')}</select></label><div class="btns"><button class="btn" id="kz">Kopyala</button></div>`, el => {
    el.querySelector('#kz').onclick = () => { const k = S.subeler[el.querySelector('#kq').value]; if (!k) return; subeKaydet(id, { konumlar: JSON.parse(JSON.stringify(k.konumlar || [])), sonuc: [...(k.sonuc || [])], pulse: JSON.parse(JSON.stringify(k.pulse || [])), gunluk: [...(k.gunluk || [])], isaret: JSON.parse(JSON.stringify(k.isaret || {})) }); closeSheet(); toast('Kopyalandı.'); };
  });
}
function konumAyar(sid, kid) {
  const s = S.subeler[sid]; const ks = s?.konumlar || []; const k = ks.find(x => x.id === kid);
  if (!k) { $('#app').innerHTML = ust('Konum', { geri: true }) + '<div class="empty"><b>Konum yok</b></div>'; return bagla(); }
  const kaydet = sat => { const yeni = ks.map(x => x.id === kid ? { ...x, satirlar: sat } : x); s.konumlar = yeni; subeKaydet(sid, { konumlar: yeni }); };
  const sat = grupSirala(k, k.satirlar || []); const nU = k.gruplu ? sat.filter(x => x.g !== 'i').length : sat.length;
  $('#app').innerHTML = ust(k.ad, { geri: true, subeSecici: false, alt: `${s.ad} · ${sat.length} ürün` }) + `<div class="pad">
    <p class="note" style="margin:0 0 8px">Sayımdaki sırayı raf sırasına göre sürükleyerek dizin. <b>Koli</b>: koli × koli içi · <b>Tartı</b>: brüt kg − kap darası (bu şubeye özel, dokunup düzeltin; iki kap kullanılıyorsa toplam darayı yazın) · <b>Adet</b>: tek tek sayılır.</p>
    <div class="card sl" id="ul">${sat.map((x, i) => { const u = S.urunler[x.u]; return (k.gruplu && i === nU ? '<div class="si sep"><span class="drag" style="display:none"></span><b>İÇECEKLER</b><small>ürünü buraya sürükle / buradan çıkar</small></div>' : '') + `<div class="si"><span class="drag">≡</span><div class="nm">${esc(u?.ad || '(silinmiş ürün)')}<small>${x.y === 'koli' ? `<a class="dl" data-koli="${x.u}">koli içi ${yaz(koliIci(sid, x.u) ?? 1)}${s.koliIci?.[x.u] != null ? ' · bu şubeye özel' : ''} ✎</a>` : x.y === 'tarti' ? (satirDara(x) != null ? `<a class="dl" data-dara="${i}">kap darası ${yaz(satirDara(x))} kg ✎</a>` : `<a class="dl" data-dara="${i}" style="color:var(--red)">kap darası girilmemiş ✎</a>`) : 'adet'}</small></div>
      <span class="seg">${['koli', 'tarti', 'adet'].map(y => `<button data-i="${i}" data-y="${y}" class="${x.y === y ? 'on' : ''}">${YON[y]}</button>`).join('')}</span><button class="x" data-sil="${i}">✕</button></div>`; }).join('') + (k.gruplu && nU === sat.length ? '<div class="si sep"><span class="drag" style="display:none"></span><b>İÇECEKLER</b><small>ürünü buraya sürükle</small></div>' : '') || '<div class="empty" style="padding:20px">Ürün yok</div>'}</div>
    <div class="card"><button class="row" id="kGrup"><div class="m"><b>İçecek bölümü</b><span>${k.gruplu ? 'Açık · sayımda ürünler ve içecekler ayrı başlıkta' : 'Kapalı · tek liste'}</span></div><span class="tag ${k.gruplu ? 'g' : ''}">${k.gruplu ? 'Açık' : 'Kapalı'}</span></button></div>
    <div class="btns"><button class="btn" id="uEkle">+ Ürün ekle</button></div>
    ${admin() ? `<div class="btns"><button class="btn alt" id="kAd">Adını değiştir</button><button class="btn red" id="kSil">Konumu sil</button></div>` : ''}</div>`;
  bagla();
  $('#app').querySelectorAll('[data-y]').forEach(b => b.onclick = () => { const n = sat.map((x, i) => i === +b.dataset.i ? { ...x, y: b.dataset.y } : x); kaydet(n); render(); });
  $('#app').querySelectorAll('[data-sil]').forEach(b => b.onclick = () => { const n = sat.filter((x, i) => i !== +b.dataset.sil); kaydet(n); render(); });
  $('#app').querySelectorAll('[data-koli]').forEach(a => a.onclick = () => koliIciPanel(sid, a.dataset.koli));
  $('#app').querySelectorAll('[data-dara]').forEach(a => a.onclick = () => { const i = +a.dataset.dara; const x = sat[i];
    openSheet(`<h2>${esc(urunAd(x.u))}</h2><p class="note">${esc(s.ad)} · ${esc(k.ad)} kabının darası. Her şubenin kabı farklı olabilir; sadece bu şubeyi etkiler.</p><label class="field"><span>Kap darası (kg)</span><input id="dd" inputmode="decimal" value="${yaz(satirDara(x))}" placeholder="örn. 0,356"></label><div class="btns"><button class="btn" id="dk">Kaydet</button></div>`, el => {
      el.querySelector('#dd').focus(); el.querySelector('#dk').onclick = () => { const v = sayiOku(el.querySelector('#dd').value); kaydet(sat.map((y, j) => j === i ? { ...y, d: v } : y)); closeSheet(); render(); }; }); });
  suruklenebilir($('#ul'), (a, b) => {
    if (!k.gruplu) { const n = [...sat]; n.splice(b, 0, n.splice(a, 1)[0]); kaydet(n); render(); return; }
    const tam = [...sat.slice(0, nU), 'SEP', ...sat.slice(nU)]; tam.splice(b, 0, tam.splice(a, 1)[0]); const si = tam.indexOf('SEP');
    const n = tam.map((x, j) => x === 'SEP' ? null : j > si ? { ...x, g: 'i' } : (({ g, ...y }) => y)(x)).filter(Boolean); kaydet(n); render(); });
  $('#kGrup').onclick = () => { const yeni = ks.map(x => x.id !== kid ? x : k.gruplu ? { ...x, gruplu: false } : icecekAyir(x)); s.konumlar = yeni; subeKaydet(sid, { konumlar: yeni }); render(); };
  $('#uEkle').onclick = () => urunSecici(sat.map(x => x.u), sec => { const n = [...sat, ...sec.map(u => ({ u, y: varsayilanYon(k, u) }))]; kaydet(n); render(); }, sid);
  if (admin()) $('#kAd').onclick = () => openSheet(`<h2>Konum adı</h2><label class="field"><span>Ad</span><input id="ka" value="${esc(k.ad)}"></label><div class="btns"><button class="btn" id="kk">Kaydet</button></div>`, el => { el.querySelector('#kk').onclick = () => { const ad = el.querySelector('#ka').value.trim(); if (!ad) return; subeKaydet(sid, { konumlar: ks.map(x => x.id === kid ? { ...x, ad } : x) }); closeSheet(); }; });
  if (admin()) $('#kSil').onclick = async () => { if (!(await onayla(`"${k.ad}" konumu ve içindeki ${sat.length} ürün satırı silinecek. Geçmiş sayımlar etkilenmez.`, 'Sil'))) return; subeKaydet(sid, { konumlar: ks.filter(x => x.id !== kid) }); geri(); };
}
function koliIciPanel(sid, u) {
  const s = S.subeler[sid]; const genel = S.urunler[u]?.koliIci; const oz = s.koliIci?.[u];
  openSheet(`<h2>${esc(urunAd(u))}</h2><p class="note">Genel koli içi: <b>${genel != null ? yaz(genel) : 'yok'}</b> (Ürünler'den değişir). Bu bölgeye farklı gramajda geliyorsa sadece <b>${esc(s.ad)}</b> için ayrı değer yazın.</p>
    <label class="field"><span>${esc(s.ad)} için koli içi</span><input id="ki" inputmode="decimal" value="${yaz(oz ?? genel)}"></label>
    <div class="btns">${oz != null ? '<button class="btn alt" id="kg">Genel değere dön</button>' : ''}<button class="btn" id="kk">Kaydet</button></div>`, el => {
    const yazK = v => { const k = { ...(s.koliIci || {}) }; if (v == null || v === genel) delete k[u]; else k[u] = v; s.koliIci = k; subeKaydet(sid, { koliIci: k }); closeSheet(); render(); };
    el.querySelector('#kk').onclick = () => yazK(sayiOku(el.querySelector('#ki').value));
    const g = el.querySelector('#kg'); if (g) g.onclick = () => yazK(null);
  });
}
function urunSecici(haric, bitti, sid) {
  const hs = new Set(haric); const liste = urunlerSirali().filter(u => !hs.has(u.id) && u.aktif !== false && (!sid || subedeGorunur(u.id, sid))); const sec = new Set();
  openSheet(`<h2>Ürün ekle</h2><input class="search" id="ua" placeholder="Ara…"><div class="card" id="ul" style="max-height:55vh;overflow:auto">${liste.map(u => `<label class="chk" data-ad="${esc(ascii(u.ad))}"><input type="checkbox" value="${u.id}"><span>${esc(u.ad)}</span></label>`).join('') || '<div class="empty" style="padding:20px">Eklenecek ürün kalmadı.</div>'}</div>${sid && admin() ? `<button class="btn alt sm" id="uOzel" style="margin-top:8px;width:100%">+ Listede yok: sadece ${esc(S.subeler[sid].ad)}'e özel yeni ürün</button>` : ''}<div class="btns"><button class="btn" id="ue">Ekle</button></div>`, el => {
    el.querySelector('#ua').oninput = e => { const q = ascii(e.target.value); el.querySelectorAll('[data-ad]').forEach(l => l.hidden = q && !l.dataset.ad.includes(q)); };
    el.querySelectorAll('input[type=checkbox]').forEach(c => c.onchange = () => { c.checked ? sec.add(c.value) : sec.delete(c.value); el.querySelector('#ue').textContent = sec.size ? `Ekle (${sec.size})` : 'Ekle'; });
    el.querySelector('#ue').onclick = () => { closeSheet(); if (sec.size) bitti(liste.map(u => u.id).filter(id => sec.has(id))); };
    const oz = el.querySelector('#uOzel'); if (oz) oz.onclick = () => urunPanel(null, { sube: sid, bitti: yid => bitti([yid]) });
  });
}
function varsayilanYon(k, u) { const x = S.urunler[u] || {}; if (ascii(k.ad).includes('make')) return x.birim === 'kg' ? 'tarti' : 'adet'; return x.koliIci != null ? 'koli' : 'adet'; }
function konumaEkle(sid, kid, urunler) {
  const s = S.subeler[sid]; const yeni = (s.konumlar || []).map(k => k.id !== kid ? k : { ...k, satirlar: [...(k.satirlar || []), ...urunler.filter(u => !(k.satirlar || []).some(x => x.u === u)).map(u => ({ u, y: varsayilanYon(k, u) }))] });
  s.konumlar = yeni; return subeKaydet(sid, { konumlar: yeni });
}
function konumdanCikar(sid, kid, u) {
  const s = S.subeler[sid]; const yeni = (s.konumlar || []).map(k => k.id !== kid ? k : { ...k, satirlar: (k.satirlar || []).filter(x => x.u !== u) });
  s.konumlar = yeni; return subeKaydet(sid, { konumlar: yeni });
}
// Sonuç listesi: şubenin konumlarındaki ürünler; sonuç sırasındakiler o sırayla, yeni gelenler sona.
function sonucListesi(s) { const var_ = subedekiUrunler(s); const l = (s.sonuc || []).filter(u => var_.has(u) && S.urunler[u] && S.urunler[u].aktif !== false); for (const u of [...var_].sort((a, b) => (S.urunler[a]?.sira ?? 999) - (S.urunler[b]?.sira ?? 999))) if (!l.includes(u) && S.urunler[u] && S.urunler[u].aktif !== false) l.push(u); return l; }
// Pulse'ta olup bizde sayılmayan ürünler (ör. EKMEK): sonuçta "Pulse'a 0 gir" satırı olarak sıra korunur. s.pulse = [{id, ad}], s.sonuc içinde 'p:'+id olarak yer alır.
const pulseMi = u => typeof u === 'string' && u.startsWith('p:');
// Sonuç grupları: sabit üç başlık satırı ('g:1' Ürünler, 'g:2' İçecekler, 'g:3' Tanımsızlar); s.sonuc içinde ürünlerle birlikte sürüklenerek dizilir.
const GRUP_AD = { 'g:1': '1 · ÜRÜNLER', 'g:2': '2 · İÇECEKLER', 'g:3': '3 · TANIMSIZLAR' };
const grupMi = u => u === 'g:1' || u === 'g:2' || u === 'g:3';
function sonucSatirlari(s) {
  const pl = new Set((s.pulse || []).map(p => 'p:' + p.id)); const base = sonucListesi(s); const bs = new Set(base); const out = [], gor = new Set();
  for (const u of (s.sonuc || [])) if ((pl.has(u) || bs.has(u) || grupMi(u)) && !gor.has(u)) { out.push(u); gor.add(u); }
  for (const u of base) if (!gor.has(u)) { out.push(u); gor.add(u); }
  for (const u of pl) if (!gor.has(u)) out.push(u);
  if (!out.some(grupMi)) return ['g:1', ...out, 'g:2', 'g:3']; // başlık kaydedilmemiş şubede hepsi Ürünler altında başlar
  if (!out.includes('g:1')) out.unshift('g:1');
  if (!out.includes('g:2')) { const i = out.indexOf('g:3'); if (i >= 0) out.splice(i, 0, 'g:2'); else out.push('g:2'); }
  if (!out.includes('g:3')) out.push('g:3');
  return out;
}
const satirAd = (s, u) => grupMi(u) ? GRUP_AD[u] : pulseMi(u) ? ((s.pulse || []).find(p => 'p:' + p.id === u)?.ad || '') : urunAd(u);
function subedekiUrunler(s) { const set = new Set(); (s.konumlar || []).forEach(k => (k.satirlar || []).forEach(x => set.add(x.u))); return set; }
function siparisListesi(s) { const var_ = sonucListesi(s).filter(u => S.urunler[u]?.siparis); const sr = (s.siparisSira || []).filter(u => var_.includes(u)); return [...sr, ...var_.filter(u => !sr.includes(u))]; }
function siparisSiraAyar(sid) {
  const s = S.subeler[sid]; if (!s) return; const l = siparisListesi(s); const kaydet = n => { s.siparisSira = n; subeKaydet(sid, { siparisSira: n }); };
  $('#app').innerHTML = ust('Sipariş sırası', { geri: true, subeSecici: false, alt: `${s.ad} · ${l.length} ürün` }) + `<div class="pad">
    <p class="note" style="margin:0 0 8px">Sipariş listesindeki ürün sırası. Sürükleyerek ya da sıra numarasına dokunup yeni numara yazarak değiştirin. Sadece bu şubeyi etkiler.</p>
    <div class="card sl" id="ul">${l.map(u => `<div class="si"><span class="drag">≡</span><div class="nm">${esc(urunAd(u))}</div></div>`).join('') || '<div class="empty" style="padding:20px">Siparişte ürün yok.</div>'}</div>
    ${(s.siparisSira || []).length ? '<div class="btns"><button class="btn alt" id="spSifir">Domino\'s sonuç sırasına döndür</button></div>' : ''}</div>`;
  bagla();
  suruklenebilir($('#ul'), (a, b) => { const n = [...l]; n.splice(b, 0, n.splice(a, 1)[0]); kaydet(n); render(); });
  if ($('#spSifir')) $('#spSifir').onclick = () => { s.siparisSira = []; subeKaydet(sid, { siparisSira: [] }); render(); };
}
function sonucSiraAyar(sid) {
  const s = S.subeler[sid]; if (!s) return; const l = sonucSatirlari(s); const kaydet = n => { s.sonuc = n; subeKaydet(sid, { sonuc: n }); };
  const eksik = []; const nPulse = (s.pulse || []).length;
  $('#app').innerHTML = ust('Sonuç sırası', { geri: true, subeSecici: false, alt: `${s.ad} · ${l.filter(u => !pulseMi(u) && !grupMi(u)).length} ürün${nPulse ? ` · ${nPulse} Pulse satırı` : ''}` }) + `<div class="pad">
    <p class="note" style="margin:0 0 8px">Domino's sistemine giriş sırası. Sürükleyerek dizin. Liste sayım listesinden otomatik oluşur: konumlara eklenen ürün sona gelir, konumlardan çıkan ürün buradan da çıkar. Pulse'ta olup bizde sayılmayan ürünler (ör. ekmek) için <b>Pulse satırı</b> ekleyin; sonuçta "0 gir" olarak sırayı korur.</p>
    ${eksik.length ? `<div class="card p" style="background:var(--amber-soft);border-color:transparent"><b style="color:var(--amber)">${eksik.length} ürün sayılıyor ama bu listede yok</b><p class="note">${eksik.map(urunAd).map(esc).join(', ')}</p><div class="btns"><button class="btn sm alt" id="eksikEkle">Sona ekle</button></div></div>` : ''}
    <div class="card sl" id="ul">${l.map((u, i) => grupMi(u)
      ? `<div class="si sep"><span class="drag">≡</span><b>${GRUP_AD[u]}</b>${u === 'g:3' ? '<small>yeni gelen ürünler en sona düşer</small>' : ''}</div>`
      : pulseMi(u)
      ? `<div class="si pls"><span class="drag">≡</span><div class="nm">${esc(satirAd(s, u))}<small>Pulse satırı · sonuçta "0 gir"</small></div>${admin() ? `<button class="chip" style="padding:4px 9px;font-size:11.5px;color:var(--red);border-color:var(--red)" data-pdel="${esc(u)}">Kaldır</button>` : ''}</div>`
      : `<div class="si"><span class="drag">≡</span><div class="nm">${esc(urunAd(u))}</div></div>`).join('') || '<div class="empty" style="padding:20px">Konumlarda ürün yok.</div>'}</div>
    ${admin() ? '<div class="btns"><button class="btn alt" id="pEkle">+ Pulse satırı ekle</button></div>' : ''}</div>`;
  bagla();
  suruklenebilir($('#ul'), (a, b) => { const n = [...l]; n.splice(b, 0, n.splice(a, 1)[0]); kaydet(n); render(); });
  $('#app').querySelectorAll('[data-pdel]').forEach(b => b.onclick = async () => {
    const u = b.dataset.pdel; if (!(await onayla(`<b>${esc(satirAd(s, u))}</b> Pulse satırı ${esc(s.ad)} şubesinin sonuç listesinden kalkacak.`, 'Kaldır'))) return;
    const pulse = (s.pulse || []).filter(p => 'p:' + p.id !== u), sonuc = (s.sonuc || []).filter(x => x !== u); Object.assign(s, { pulse, sonuc }); subeKaydet(sid, { pulse, sonuc }); render(); });
  if ($('#pEkle')) $('#pEkle').onclick = () => openSheet(`<h2>Pulse satırı ekle</h2><p class="note">Pulse'ta bulunan ama bizde sayılmayan ürün. Sonuçta gri bir satır olarak çıkar, rakam olarak <b>0</b> kopyalanır.</p>
    <label class="field"><span>Pulse'taki ürün adı</span><input id="pAd" placeholder="Ör. EKMEK (L)"></label>
    <label class="field"><span>Hangi ürünün altına gelsin?</span><select id="pOnce"><option value="">Listenin başına</option>${l.filter(u => !pulseMi(u) && !grupMi(u)).map(u => `<option value="${esc(u)}">${esc(urunAd(u))}</option>`).join('')}</select></label>
    <div class="err" id="pe"></div><div class="btns"><button class="btn" id="pHep">Bütün şubelere ekle</button><button class="btn alt" id="pBu">Sadece ${esc(s.ad)}</button></div>`, el => {
    const ekle = hepsi => {
      const ad = el.querySelector('#pAd').value.trim(); const once = el.querySelector('#pOnce').value; if (!ad) { el.querySelector('#pe').textContent = 'Ürün adı yazın.'; return; }
      const id = 'x' + Date.now().toString(36); const hedefler = hepsi ? Object.keys(S.subeler) : [sid];
      for (const h of hedefler) { const b = S.subeler[h]; if (!b) continue; const pulse = [...(b.pulse || []), { id, ad }]; const sira = sonucSatirlari(b); const i = once ? sira.indexOf(once) : -1;
        const sonuc = [...sira]; sonuc.splice(once ? (i >= 0 ? i + 1 : sonuc.length) : sonuc.indexOf('g:1') + 1, 0, 'p:' + id); Object.assign(b, { pulse, sonuc }); subeKaydet(h, { pulse, sonuc }); }
      closeSheet(); toast(`${ad} eklendi${hepsi ? ' (bütün şubeler)' : ''}.`); render();
    };
    if (el.querySelector('#pHep')) el.querySelector('#pHep').onclick = () => ekle(true); el.querySelector('#pBu').onclick = () => ekle(false);
  });
}
function yerlerAyar(sid) {
  const s = S.subeler[sid]; if (!s) return; const ks = s.konumlar || [];
  const yer = {}; ks.forEach(k => (k.satirlar || []).forEach(x => (yer[x.u] ||= new Set()).add(k.id)));
  const l = urunlerSirali().filter(u => u.aktif !== false && subedeGorunur(u.id, sid)); const yok = l.filter(u => !yer[u.id]).length;
  const f = S.yerFiltre || 'hepsi'; const q = S.yerAra || '';
  const gor = u => (f !== 'yok' || !yer[u.id]) && (!q || ascii(u.ad).includes(ascii(q)));
  const eskiY = window.scrollY;
  $('#app').innerHTML = ust('Ürün yerleri', { geri: true, subeSecici: false, alt: `${s.ad} · ${l.length} ürün · ${ks.length} konum` }) + `<div class="pad">
    <p class="note" style="margin:0 0 8px">Konuma dokununca ürün o konumun sonuna eklenir, tekrar dokununca çıkar. <b>Günlük</b> işaretli ürünler günlük sayımda da sayılır (haftalıkta zaten hepsi sayılır); turuncu çerçeve genel ayardan farklı olduğunu gösterir. Sırayı konum sayfasından sürükleyerek değiştirin.</p>
    <div class="btns" style="margin:0 0 10px" ${admin() ? '' : 'hidden'}><button class="btn alt" id="yOzel">+ Sadece ${esc(s.ad)}'e özel yeni ürün</button></div>
    <input class="search" id="ya" placeholder="Ara…" value="${esc(q)}">
    <div class="chips"><button class="chip ${f === 'hepsi' ? 'on' : ''}" data-f="hepsi">Hepsi</button><button class="chip ${f === 'yok' ? 'on' : ''}" data-f="yok">Bu şubede olmayanlar (${yok})</button></div>
    <div class="card">${l.map(u => `<div class="yr" data-ad="${esc(ascii(u.ad))}" ${gor(u) ? '' : 'hidden'} style="padding:10px 12px;border-bottom:1px solid var(--line)"><div style="display:flex;align-items:center;gap:6px"><div style="flex:1"><b style="font-size:14px">${esc(u.ad)}</b>${u.sube ? ' <span class="tag b">sadece bu şube</span>' : ''}${yer[u.id] ? '' : ' <span class="tag a">bu şubede yok</span>'}</div>${yer[u.id] || (s.sonuc || []).includes(u.id) ? `<button class="chip" style="padding:4px 9px;font-size:11.5px;color:var(--red);border-color:var(--red)" data-cik="${u.id}">Şubeden çıkar</button>` : ''}</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:7px">${ks.map(k => { const on = yer[u.id]?.has(k.id); return `<button class="chip ${on ? 'on' : ''}" style="padding:5px 9px;font-size:12px" data-u="${u.id}" data-k="${k.id}">${on ? '✓ ' : ''}${esc(k.ad)}</button>`; }).join('')}${yer[u.id] ? (() => { const g = sayimdaMi(s, u.id, 'gunluk'), o = s.isaret?.[u.id]?.g; return `<button class="chip ${g ? 'on' : ''}" style="padding:5px 9px;font-size:12px;margin-left:auto${o != null ? ';outline:2px solid var(--amber)' : ''}" data-gun="${u.id}">${g ? '✓ ' : ''}Günlük</button>`; })() : ''}</div></div>`).join('') || '<div class="empty" style="padding:20px">Ürün yok</div>'}</div></div>`;
  bagla(); window.scrollTo(0, eskiY);
  $('#app').querySelectorAll('[data-gun]').forEach(b => b.onclick = () => { const u = b.dataset.gun, x = S.urunler[u]; const o = { ...(s.isaret || {}) }; const e = { ...(o[u] || {}) }; const yeni = !sayimdaMi(s, u, 'gunluk');
    if (yeni === varsGun(x)) delete e.g; else e.g = yeni; delete e.h; if (Object.keys(e).length) o[u] = e; else delete o[u]; s.isaret = o; isaretKaydet(sid, o); render(); });
  $('#ya').oninput = e => { S.yerAra = e.target.value; const qq = ascii(e.target.value); $('#app').querySelectorAll('.yr').forEach(r => { const u = l.find(x => ascii(x.ad) === r.dataset.ad); r.hidden = !((f !== 'yok' || !yer[u?.id]) && (!qq || r.dataset.ad.includes(qq))); }); };
  $('#app').querySelectorAll('[data-f]').forEach(b => b.onclick = () => { S.yerFiltre = b.dataset.f; render(); });
  $('#yOzel').onclick = () => urunPanel(null, { sube: sid });
  $('#app').querySelectorAll('[data-cik]').forEach(b => b.onclick = async () => { const u = b.dataset.cik;
    if (!(await onayla(`<b>${esc(urunAd(u))}</b> ${esc(s.ad)} şubesinin bütün konumlarından, sonuç sırasından ve günlük listesinden çıkacak. Diğer şubeler etkilenmez.`, 'Çıkar'))) return;
    const kon = (s.konumlar || []).map(k => ({ ...k, satirlar: (k.satirlar || []).filter(x => x.u !== u) })); const son = (s.sonuc || []).filter(x => x !== u); const gun = (s.gunluk || []).filter(x => x !== u);
    Object.assign(s, { konumlar: kon, sonuc: son, gunluk: gun }); subeKaydet(sid, { konumlar: kon, sonuc: son, gunluk: gun }); toast(`${urunAd(u)} ${s.ad}'den çıkarıldı.`); render(); });
  $('#app').querySelectorAll('.yr [data-u]').forEach(b => b.onclick = () => { const u = b.dataset.u, k = b.dataset.k; if (yer[u]?.has(k)) konumdanCikar(sid, k, u); else konumaEkle(sid, k, [u]); render(); });
}
function urunlerAyar() {
  const tum = urunlerSirali(); const l = tum.filter(u => u.aktif !== false); const kalk = tum.filter(u => u.aktif === false); const kullanim = {}; Object.values(S.subeler).forEach(s => subedekiUrunler(s).forEach(u => kullanim[u] = (kullanim[u] || 0) + 1));
  $('#app').innerHTML = ust('Ürünler', { geri: true, subeSecici: false, alt: `${l.length} ürün · bütün şubeler için ortak` }) + `<div class="pad">
    <div class="btns" style="margin:0 0 10px"><button class="btn" id="uYeni">+ Yeni ürün</button><button class="btn alt" id="uExcel">Excel'den yükle</button></div>
    <input class="search" id="ua" placeholder="Ara…" value="${esc(S.urunAra || '')}">
<p class="note" style="margin:0 0 8px"><b>Günlük</b>: günlük sayımda sayılsın (haftalıkta zaten hepsi sayılır). <b>Sipariş</b>: sipariş listesinde çıkar. Burası <b>bütün şubeler için varsayılan</b>; her şube kendi ayarlarından (Günlük / haftalık listesi) kendi için değiştirebilir.</p>
    <div class="fh" id="uf"><span id="usay">${l.length} ürün</span>${[['g', 'Günlük'], ['s', 'Sipariş']].map(([k, ad]) => { const c = (k === 'g' ? S.urunFg : S.urunFs) || 'hepsi'; return `<button class="${c !== 'hepsi' ? 'on' : ''}" data-f="${k}">${ad}${c === 'evet' ? ': var' : c === 'hayir' ? ': yok' : ''} ${c === 'hepsi' ? '▾' : '⏷'}</button>`; }).join('')}</div>
    <div class="card">${l.map(u => `<div class="row" data-ad="${esc(ascii(u.ad))}" data-gn="${u.gunluk ? 1 : 0}" data-sp="${u.siparis ? 1 : 0}" style="cursor:default"><div class="m" data-u="${u.id}" style="cursor:pointer"><b>${esc(u.ad)}${u.sube ? ` <span class="tag b">sadece ${esc(S.subeler[u.sube]?.ad || u.sube)}</span>` : ''}</b><span>${u.birim}${u.koliIci != null ? ' · koli ' + yaz(u.koliIci) : ''} · ${kullanim[u.id] || 0} şube${u.sktGun ? ` · <span style="color:var(--amber);font-weight:700">SKT ${u.sktGun} gün</span>` : ''}</span></div>
      <button class="chip ${u.gunluk ? 'on' : ''}" style="padding:5px 9px;font-size:11.5px" data-sy="gunluk" data-id="${u.id}">${u.gunluk ? '✓ ' : ''}Günlük</button><button class="chip ${u.siparis ? 'on' : ''}" style="padding:5px 9px;font-size:11.5px" data-sy="siparis" data-id="${u.id}">${u.siparis ? '✓ ' : ''}Sipariş</button></div>`).join('')}</div>
    ${kalk.length ? `<details class="card" style="padding:0"><summary class="row" style="list-style:none"><div class="m"><b>Kaldırılan ürünler (${kalk.length})</b><span>Sayımlarda ve listelerde görünmezler · dokunup geri alabilirsiniz</span></div><span class="ch">▾</span></summary>${kalk.map(u => `<button class="row" data-u="${u.id}" data-ad="${esc(ascii(u.ad))}"><div class="m"><b style="color:var(--mut)">${esc(u.ad)}</b><span>${u.kaldirma ? 'kaldırıldı ' + trTarih(u.kaldirma.slice(0, 10)) : 'kaldırıldı'}</span></div></button>`).join('')}</details>` : ''}</div>`;
  bagla();
  const uygula = () => { const q = ascii(S.urunAra || ''), fg = S.urunFg || 'hepsi', fs = S.urunFs || 'hepsi'; const ok = (v, t) => v === 'hepsi' || (v === 'evet' ? t === '1' : t === '0'); $('#app').querySelectorAll('.row[data-gn]').forEach(l => l.hidden = !((!q || l.dataset.ad.includes(q)) && ok(fg, l.dataset.gn) && ok(fs, l.dataset.sp))); const n = $('#app').querySelectorAll('.row[data-gn]:not([hidden])').length; if ($('#usay')) $('#usay').textContent = n + ' ürün'; };
  $('#ua').oninput = e => { S.urunAra = e.target.value; uygula(); };
  $('#app').querySelectorAll('#uf button[data-f]').forEach(b => b.onclick = e => { e.stopPropagation(); const k = b.dataset.f; const fn = k === 'g' ? u => u.gunluk : u => u.siparis; const cur = (k === 'g' ? S.urunFg : S.urunFs) || 'hepsi';
    const r = b.getBoundingClientRect(); const m = document.createElement('div'); m.className = 'fpop'; m.style.cssText = `top:${r.bottom + 4}px;right:${Math.max(8, innerWidth - r.right)}px`;
    m.innerHTML = [['hepsi', 'Hepsi', l.length], ['evet', 'Olanlar', l.filter(fn).length], ['hayir', 'Olmayanlar', l.filter(u => !fn(u)).length]].map(([v, a, n]) => `<button data-v="${v}" class="${cur === v ? 'on' : ''}">${cur === v ? '✓ ' : ''}${a} <small>${n}</small></button>`).join('');
    document.querySelectorAll('.fpop').forEach(x => x.remove()); document.body.appendChild(m);
    m.querySelectorAll('button').forEach(o => o.onclick = () => { if (k === 'g') S.urunFg = o.dataset.v; else S.urunFs = o.dataset.v; m.remove(); render(); });
    setTimeout(() => document.addEventListener('click', () => m.remove(), { once: true }), 0); });
  uygula();
  $('#app').querySelectorAll('[data-u]').forEach(b => b.onclick = () => urunPanel(b.dataset.u));
  $('#app').querySelectorAll('[data-sy][data-id]').forEach(b => b.onclick = () => { const id = b.dataset.id, t = b.dataset.sy; const x = S.urunler[id]; const yeni = t === 'haftalik' ? x.haftalik === false : !x[t]; x[t] = yeni; updateDoc(doc(db, 'genel', 'urunler'), { [`u.${id}.${t}`]: yeni }).catch(hata); const y = window.scrollY; render(); window.scrollTo(0, y); });
  $('#uYeni').onclick = () => urunPanel(null); $('#uExcel').onclick = seedYukle;
}
function urunPanel(id, opt = {}) {
  const u = id ? S.urunler[id] : { ad: '', birim: 'kg', koliIci: null, sktGun: null, cozulmeGun: null, aktif: true, sube: opt.sube || null };
  const ozel = u.sube ? S.subeler[u.sube] : null;
  const konumAdlari = []; if (!id && !ozel) Object.values(S.subeler).forEach(s => (s.konumlar || []).forEach(k => { if (!konumAdlari.some(a => ascii(a) === ascii(k.ad))) konumAdlari.push(k.ad); }));
  const n = v => v == null ? '' : yaz(v);
  openSheet(`<h2>${id ? 'Ürünü düzenle' : ozel ? `${esc(ozel.ad)}'e özel yeni ürün` : 'Yeni ürün'}</h2>${ozel ? `<p class="note">Bu ürün sadece <b>${esc(ozel.ad)}</b> şubesinde görünür; diğer şubelerin listelerine çıkmaz.</p>` : ''}
    <label class="field"><span>Ürün adı</span><input id="pa" value="${esc(u.ad)}"></label>
    <div class="grid2"><label class="field"><span>Birim</span><select id="pb"><option value="kg" ${u.birim === 'kg' ? 'selected' : ''}>kg</option><option value="adet" ${u.birim === 'adet' ? 'selected' : ''}>adet</option></select></label>
    <label class="field"><span>Koli / paket içi</span><input id="pk" inputmode="decimal" value="${n(u.koliIci)}" placeholder="örn. 0,5"></label>
    <label class="field"><span>SKT (gün)</span><input id="ps" inputmode="numeric" value="${n(u.sktGun)}" placeholder="takip yoksa boş"></label>
    <label class="field"><span>Çözülme (gün)</span><input id="pc" inputmode="numeric" value="${n(u.cozulmeGun)}" placeholder="yoksa boş"></label></div>
    <label class="chk" style="padding:4px 0;border:0"><input type="checkbox" id="pGn" ${u.gunluk ? 'checked' : ''}> Günlük sayımda sayılır</label>
    <label class="chk" style="padding:4px 0;border:0"><input type="checkbox" id="pSp" ${u.siparis ? 'checked' : ''}> Sipariş listesinde</label>
    <label class="field"><span>Sipariş kolisi (Domino's sevkiyat kolisi, ${u.birim === 'adet' ? 'adet' : 'kg'})</span><input id="pSk" inputmode="decimal" value="${n(u.sKoli)}" placeholder="örn. sucuk 10, 7 hamur 12"></label>
    ${konumAdlari.length ? `<div class="sec" style="padding-left:0">Bütün şubelerde şu konumlara ekle</div><div class="chips" style="flex-wrap:wrap" id="pKon">${konumAdlari.map(a => `<button class="chip" data-kad="${esc(a)}">${esc(a)}</button>`).join('')}</div><p class="note" style="margin-top:0">Seçmezseniz ürün listede durur, şubelere sonra Ürün yerleri'nden yerleştirirsiniz.</p>` : ''}
    <p class="note">Koli içi değişince yeni sayımlar yeni değerle hesaplanır; eski sayımlar eski değerle kalır. Makeline kap darası her şubede farklı olabileceği için şube ayarında, konum sayfasında girilir.</p>
    <div class="err" id="pe"></div><div class="btns"><button class="btn" id="pk2">${u.aktif === false ? 'Kaydet ve geri al' : 'Kaydet'}</button></div>
    ${id && u.aktif !== false ? `<div class="btns"><button class="btn red" id="pSil">Ürünü kaldır</button></div><p class="note">Kaldırınca bütün şubelerin bütün konumlarından, sonuç sırasından ve günlük listeden çıkar. Geçmiş sayımlar bozulmaz.</p>` : ''}
    ${u.aktif === false ? `<p class="note">Geri alınan ürün konumlara kendiliğinden dönmez; şube ayarlarından tekrar eklersiniz.</p>` : ''}`, el => {
    const ps = el.querySelector('#pSil'); if (ps) ps.onclick = () => urunKaldir(id);
    const kSec = new Set(); el.querySelectorAll('[data-kad]').forEach(b => b.onclick = () => { const a = b.dataset.kad; kSec.has(a) ? kSec.delete(a) : kSec.add(a); b.classList.toggle('on', kSec.has(a)); b.textContent = (kSec.has(a) ? '✓ ' : '') + a; });
    el.querySelector('#pk2').onclick = async () => {
      const ad = el.querySelector('#pa').value.trim().toLocaleUpperCase('tr-TR'); if (!ad) return el.querySelector('#pe').textContent = 'Ürün adı yazın.';
      if (Object.entries(S.urunler).some(([k, x]) => k !== id && x.ad === ad && x.aktif !== false && (!x.sube || !u.sube || x.sube === u.sube))) return el.querySelector('#pe').textContent = 'Bu adda ürün zaten var.';
      const ni = v => { const x = sayiOku(v); return x == null ? null : Math.round(x); };
      const data = { ad, birim: el.querySelector('#pb').value, koliIci: sayiOku(el.querySelector('#pk').value), sktGun: ni(el.querySelector('#ps').value), cozulmeGun: ni(el.querySelector('#pc').value), gunluk: el.querySelector('#pGn').checked, siparis: el.querySelector('#pSp').checked, sKoli: sayiOku(el.querySelector('#pSk').value), aktif: true };
      if (id && u.dara != null) data.dara = u.dara; if (u.sube) data.sube = u.sube;
      const yid = id || yeniId('u'); if (!id) data.sira = Math.max(0, ...Object.values(S.urunler).map(x => x.sira ?? 0)) + 1; else data.sira = u.sira ?? 999;
      try {
        if (Object.keys(S.urunler).length) await updateDoc(doc(db, 'genel', 'urunler'), { ['u.' + yid]: data }); else await setDoc(doc(db, 'genel', 'urunler'), { u: { [yid]: data } });
        S.urunler[yid] = data; let n = 0;
        if (kSec.size) { const b = writeBatch(db); const sec = [...kSec].map(ascii);
          for (const [sid, s] of Object.entries(S.subeler)) { let deg = false; const kon = (s.konumlar || []).map(k => { if (!sec.includes(ascii(k.ad)) || (k.satirlar || []).some(x => x.u === yid)) return k; deg = true; n++; return { ...k, satirlar: [...(k.satirlar || []), { u: yid, y: varsayilanYon(k, yid) }] }; });
            if (deg) { s.konumlar = kon; b.set(doc(db, 'subeler', sid), { konumlar: kon }, { merge: true }); } }
          await b.commit(); }
        closeSheet(); toast(n ? `Kaydedildi · ${n} konuma eklendi.` : 'Kaydedildi.'); if (opt.bitti) opt.bitti(yid);
      } catch (e) { hata(e); }
    };
  });
}
async function urunKaldir(id) {
  const u = S.urunler[id]; if (!u) return;
  const yerler = []; Object.entries(S.subeler).forEach(([sid, s]) => { (s.konumlar || []).forEach(k => { if ((k.satirlar || []).some(x => x.u === id)) yerler.push(`${s.ad} ${k.ad}`); }); });
  if (!(await onayla(`<b>${esc(u.ad)}</b> kaldırılacak.${yerler.length ? `<br><br>Çıkarılacağı yerler (${yerler.length}): ${esc(yerler.join(', '))}` : ''}<br><br>Ayrıca bütün şubelerin sonuç sırasından ve günlük listesinden çıkar.`, 'Kaldır'))) return;
  const b = writeBatch(db);
  b.update(doc(db, 'genel', 'urunler'), { [`u.${id}.aktif`]: false, [`u.${id}.kaldirma`]: new Date().toISOString() });
  Object.entries(S.subeler).forEach(([sid, s]) => {
    const kul = (s.konumlar || []).some(k => (k.satirlar || []).some(x => x.u === id)) || (s.sonuc || []).includes(id) || (s.gunluk || []).includes(id);
    if (!kul) return;
    b.set(doc(db, 'subeler', sid), { konumlar: (s.konumlar || []).map(k => ({ ...k, satirlar: (k.satirlar || []).filter(x => x.u !== id) })), sonuc: (s.sonuc || []).filter(x => x !== id), gunluk: (s.gunluk || []).filter(x => x !== id) }, { merge: true });
  });
  try { await b.commit(); closeSheet(); toast(`${u.ad} kaldırıldı.`); } catch (e) { hata(e); }
}
function kullanicilarAyar() {
  const l = [...S.kullanicilar].sort((a, b) => (b.rol === 'admin') - (a.rol === 'admin') || (a.ad || '').localeCompare(b.ad || '', 'tr'));
  $('#app').innerHTML = ust('Kullanıcılar', { geri: true, subeSecici: false }) + `<div class="pad">
    <p class="note" style="margin:0 0 8px">Şube hesabını şube müdürü ve vardiya sorumlusu birlikte kullanabilir. Birden fazla şubeye bakan kişiye birden çok şube seçin.</p>
    <div class="card">${l.map(u => `<button class="row" data-uid="${u.uid}"><div class="m"><b>${esc(u.ad || u.kullaniciAdi)}${u.aktif === false ? ' <span class="tag r">Kapalı</span>' : ''}</b><span>${esc(u.kullaniciAdi)} · ${u.rol === 'admin' ? 'Yönetici · tüm şubeler' : (u.subeler || []).map(s => S.subeler[s]?.ad || s).join(', ') || 'şube yok'}</span></div><span class="ch">›</span></button>`).join('')}
    <button class="row" id="kYeni"><div class="m"><b style="color:var(--blue)">+ Yeni kullanıcı</b></div></button></div></div>`;
  bagla();
  $('#app').querySelectorAll('[data-uid]').forEach(b => b.onclick = () => kullaniciPanel(b.dataset.uid));
  $('#kYeni').onclick = () => kullaniciPanel(null);
}
function kullaniciPanel(uid) {
  const u = uid ? S.kullanicilar.find(x => x.uid === uid) : { kullaniciAdi: '', ad: '', rol: 'sube', subeler: [], aktif: true }; const ben = uid === S.user.uid;
  const ids = Object.keys(S.subeler).sort((a, b) => S.subeler[a].ad.localeCompare(S.subeler[b].ad, 'tr'));
  openSheet(`<h2>${uid ? 'Kullanıcı' : 'Yeni kullanıcı'}</h2>${uid ? `<p class="note">Kullanıcı adı: <b>${esc(u.kullaniciAdi)}</b></p>` : ''}
    ${uid ? '' : `<div class="grid2"><label class="field"><span>Kullanıcı adı</span><input id="ka" autocapitalize="none" placeholder="örn. serik"></label><label class="field"><span>Şifre</span><input id="kp" placeholder="en az 6 karakter"></label></div>`}
    <label class="field"><span>Görünen ad</span><input id="kd" value="${esc(u.ad || '')}" placeholder="örn. Serik Şube"></label>
    <label class="field"><span>Yetki</span><select id="kr" ${ben ? 'disabled' : ''}><option value="sube" ${u.rol !== 'admin' ? 'selected' : ''}>Şube hesabı (sayım)</option><option value="admin" ${u.rol === 'admin' ? 'selected' : ''}>Yönetici (her şey)</option></select></label>
    <div id="ksb"><div class="sec" style="padding-left:0">Şubeleri</div><div class="card" style="max-height:40vh;overflow:auto">${ids.map(id => `<label class="chk"><input type="checkbox" value="${id}" ${(u.subeler || []).includes(id) ? 'checked' : ''}> ${esc(S.subeler[id].ad)}</label>`).join('')}</div></div>
    ${uid && !ben ? `<label class="chk" style="padding:6px 0;border:0"><input type="checkbox" id="kak" ${u.aktif !== false ? 'checked' : ''}> Hesap açık</label><p class="note">Şifresini unutan kullanıcının hesabını kapatıp yeni kullanıcı adıyla açın.</p>` : ''}
    <div class="err" id="ke"></div><div class="btns"><button class="btn" id="kk">Kaydet</button></div>`, el => {
    const rolG = () => el.querySelector('#ksb').hidden = el.querySelector('#kr').value === 'admin'; el.querySelector('#kr').onchange = rolG; rolG();
    el.querySelector('#kk').onclick = async () => {
      const er = el.querySelector('#ke'); const rol = el.querySelector('#kr').value; const subeler = rol === 'admin' ? [] : [...el.querySelectorAll('#ksb input:checked')].map(c => c.value); const ad = el.querySelector('#kd').value.trim();
      if (rol !== 'admin' && !subeler.length) return er.textContent = 'En az bir şube seçin.';
      try {
        if (uid) { const p = { ad, rol: ben ? u.rol : rol, subeler }; const ak = el.querySelector('#kak'); if (ak) p.aktif = ak.checked; await updateDoc(doc(db, 'kullanicilar', uid), p); }
        else {
          const k = kadiNorm(el.querySelector('#ka').value); const pw = el.querySelector('#kp').value; if (!k) return er.textContent = 'Kullanıcı adı yazın (Türkçe harf ve boşluk olmadan).'; if (pw.length < 6) return er.textContent = 'Şifre en az 6 karakter olmalı.';
          const a2 = ikincilAuth(); const cr = await createUserWithEmailAndPassword(a2, eposta(k), pw); const nuid = cr.user.uid; await signOut(a2);
          await setDoc(doc(db, 'kullanicilar', nuid), { kullaniciAdi: k, ad: ad || k, rol, subeler, aktif: true, olusturma: new Date().toISOString() });
        }
        closeSheet(); toast('Kaydedildi.');
      } catch (e) { er.textContent = hataMetni(e); }
    };
  });
}

/* Sayımdaki konum sekmelerini basılı tutup sürükleyerek sıralama */
function sekmeSurukle() {
  const bar = $('.ktabs'); if (!bar) return; const tabs = [...bar.querySelectorAll('.kt[data-k]')]; if (tabs.length < 2) return;
  tabs.forEach(t => t.addEventListener('pointerdown', e => {
    if (e.button > 0) return; const x0 = e.clientX, y0 = e.clientY; let aktif = false, hedef = tabs.indexOf(t); const idx = hedef;
    const iptal = () => { clearTimeout(tm); t.removeEventListener('pointermove', mv0); t.removeEventListener('pointerup', son); t.removeEventListener('pointercancel', son); };
    const tm = setTimeout(() => { aktif = true; t.classList.add('dragging'); try { t.setPointerCapture(e.pointerId); } catch (_) { } navigator.vibrate?.(15); }, 450);
    const mv0 = ev => { if (!aktif) { if (Math.abs(ev.clientX - x0) > 8 || Math.abs(ev.clientY - y0) > 8) iptal(); return; }
      ev.preventDefault(); const dx = ev.clientX - x0; t.style.transform = `translateX(${dx}px)`; t.style.zIndex = 5;
      // sürüklenen sekmenin merkezi, diğer sekmelerin kayma öncesi (doğal) merkezlerine göre
      const mer = t.getBoundingClientRect().left + t.offsetWidth / 2; let n = idx;
      tabs.forEach((o, j) => { if (o === t) return; const tr = o.style.transform; const kay = tr ? parseFloat(tr.replace(/[^-\d.]/g, '')) : 0; const r = o.getBoundingClientRect(), c = r.left + r.width / 2 - kay;
        if (j > idx && mer > c) n = Math.max(n, j); if (j < idx && mer < c) n = Math.min(n, j); });
      hedef = n; const w = t.offsetWidth + 6; tabs.forEach((o, j) => { if (o === t) return; o.style.transform = (idx < hedef && j > idx && j <= hedef) ? `translateX(${-w}px)` : (idx > hedef && j < idx && j >= hedef) ? `translateX(${w}px)` : ''; }); };
    const son = () => { const gez = aktif; iptal(); tabs.forEach(o => { o.style.transform = ''; o.style.zIndex = ''; o.classList.remove('dragging'); });
      if (!gez) return; bar.dataset.surukle = '1'; setTimeout(() => delete bar.dataset.surukle, 300);
      if (hedef === idx) return; const sb = sube(); const ids = tabs.map(o => o.dataset.k); ids.splice(hedef, 0, ids.splice(idx, 1)[0]);
      const tum = sb.konumlar || []; const siraliGorunen = ids.map(id => tum.find(k => k.id === id)); let c = 0; const yeni = tum.map(k => ids.includes(k.id) ? siraliGorunen[c++] : k);
      sb.konumlar = yeni; subeKaydet(S.subeId, { konumlar: yeni }); editor(); };
    t.addEventListener('pointermove', mv0); t.addEventListener('pointerup', son); t.addEventListener('pointercancel', son);
  }));
  bar.addEventListener('click', e => { if (bar.dataset.surukle) { e.stopPropagation(); e.preventDefault(); } }, true);
  bar.addEventListener('touchmove', e => { if ($('.kt.dragging')) e.preventDefault(); }, { passive: false });
}
/* ================= Sürükle-bırak liste ================= */
function suruklenebilir(liste, birak) {
  if (!liste) return;
  const sat = [...liste.querySelectorAll('.si')].filter(x => x.querySelector('.drag')); const gruplar = []; let gk = []; gruplar.push(gk); sat.forEach(x => { if (x.classList.contains('sep')) { gk = []; gruplar.push(gk); } else gk.push(x); }); // başlık (sep) satırları listeyi gruplara böler, numara her grupta 1'den başlar
  sat.forEach((it, fi) => { if (it.classList.contains('sep')) return; const gercek = gruplar.find(g => g.includes(it)); const topN = gercek.length; const i = gercek.indexOf(it); const b = document.createElement('button'); b.className = 'sn'; b.type = 'button'; b.textContent = i + 1; b.title = 'Sıra numarası yazarak taşı';
    b.onclick = () => openSheet(`<h2>${esc(it.querySelector('.nm')?.firstChild?.textContent || '')}</h2><p class="note">Şu an ${i + 1}. sırada. Bu grupta kaçıncı sıraya taşınsın? (1–${topN})</p><label class="field"><span>Yeni sıra</span><input id="snI" inputmode="numeric" pattern="[0-9]*" placeholder="${i + 1}"></label><div class="btns"><button class="btn" id="snK">Taşı</button></div>`, el => {
      const inp = el.querySelector('#snI'); inp.focus();
      const git = () => { const n = parseInt(inp.value, 10); if (!n) return; const h = Math.max(1, Math.min(topN, n)) - 1; closeSheet(); if (h !== i) birak(fi, sat.indexOf(gercek[h])); };
      el.querySelector('#snK').onclick = git; inp.onkeydown = e => { if (e.key === 'Enter') git(); }; });
    it.querySelector('.drag').after(b); });
  liste.querySelectorAll('.drag').forEach(h => h.addEventListener('pointerdown', e => {
    e.preventDefault(); const item = h.closest('.si'); const items = [...liste.querySelectorAll('.si')].filter(x => x.querySelector('.drag'));
    const idx = items.indexOf(item); if (idx < 0) return; const y0 = e.clientY, sc0 = window.scrollY; const hh = item.getBoundingClientRect().height; let cur = idx;
    item.classList.add('dragging'); h.setPointerCapture(e.pointerId); let raf = null, lastY = y0;
    const yerlestir = () => { const dy = lastY - y0 + (window.scrollY - sc0); item.style.transform = `translateY(${dy}px)`; cur = Math.max(0, Math.min(items.length - 1, idx + Math.round(dy / hh)));
      items.forEach((it, j) => { if (it === item) return; let s = 0; if (idx < cur && j > idx && j <= cur) s = -hh; if (idx > cur && j < idx && j >= cur) s = hh; it.style.transform = s ? `translateY(${s}px)` : ''; }); };
    const kay = () => { if (lastY < 90) window.scrollBy(0, -12); else if (lastY > innerHeight - 90) window.scrollBy(0, 12); else { raf = null; return; } yerlestir(); raf = requestAnimationFrame(kay); };
    const mv = ev => { lastY = ev.clientY; yerlestir(); if (!raf) raf = requestAnimationFrame(kay); };
    const up = () => { h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up); if (raf) cancelAnimationFrame(raf); items.forEach(it => it.style.transform = ''); item.classList.remove('dragging'); if (cur !== idx) birak(idx, cur); };
    h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
  }));
}

render();
