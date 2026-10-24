// Sayım / SKT / irsaliye hesapları. Saf mantık: DOM ve Firebase yok; hem uygulama hem bildirim betiği (GitHub Actions) aynı kodu kullanır.
// S: { urunler, subeler, subeId, sayimlar, irsaliyeler }  ·  now: saat kaynağı (testte sabitlenebilir)
const TZ = 'Europe/Istanbul';
const r6 = n => Math.round(n * 1e6) / 1e6;

export function hesapKur(S, now = () => new Date()) {
  // --- zaman (her zaman Türkiye saatiyle; sunucu UTC olsa da aynı sonuç)
  const trSaat = () => new Date(now().toLocaleString('en-US', { timeZone: TZ }));
  const saatTR = () => trSaat().getHours();
  const bugun = () => trSaat().toLocaleDateString('sv-SE');
  // İş günü: dükkanlar gece kapandığı için 00:00–06:00 arası yapılan sayım bir önceki günün sayımıdır.
  const isGunu = () => { const d = trSaat(); if (d.getHours() < 6) d.setDate(d.getDate() - 1); return d.toLocaleDateString('sv-SE'); };
  const haftaGunu = s => (new Date(s + 'T12:00').getDay() + 6) % 7; // 0 = Pazartesi
  const gunEkle = (t, n) => { const d = new Date(t + 'T12:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
  const refTarih = () => saatTR() >= 22 ? gunEkle(bugun(), 1) : bugun(); // 22:00'den sonra yarına göre
  const sube = () => S.subeler[S.subeId];

  // --- sayım hesapları
  const varsGun = x => !!x.gunluk, varsHaf = x => x.haftalik !== false;
  function sayimdaMi(sb, u, tur) { const x = S.urunler[u]; if (!x) return false; const o = sb.isaret?.[u]?.[tur === 'gunluk' ? 'g' : 'h']; return o != null ? o : (tur === 'gunluk' ? varsGun(x) : varsHaf(x)); }
  function grupSirala(k, sat) { return k.gruplu ? [...sat.filter(x => x.g !== 'i'), ...sat.filter(x => x.g === 'i')] : sat; }
  function kapsam(sb, tur) { // sayımda görünen konumlar ve satırlar
    return (sb.konumlar || []).map(k => ({ ...k, satirlar: grupSirala(k, (k.satirlar || []).filter(s => { const x = S.urunler[s.u]; return x && x.aktif !== false && (tur === 'gunluk' ? sayimdaMi(sb, s.u, 'gunluk') : true); })) })).filter(k => k.satirlar.length);
  }
  const deger = (sy, k, u) => (sy.v && sy.v[k] && sy.v[k][u]) || {};
  const satirDara = s => s.d ?? S.urunler[s.u]?.dara ?? null;
  const koliIci = (sid, u) => { const o = S.subeler[sid]?.koliIci?.[u]; return o != null ? o : (S.urunler[u]?.koliIci ?? null); }; // şubede farklıysa o, değilse genel
  function prm(sy, s, k) {
    const p = (sy.p && sy.p[s.u]) || null;
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
  const sonZaman = sy => sy.son || sy.basla || '';
  const _tpMemo = new Map();
  function toplamlar(sy) { const k = sy.id + '|' + sonZaman(sy) + '|' + S.subeId; if (!_tpMemo.has(k)) { if (_tpMemo.size > 50) _tpMemo.clear(); _tpMemo.set(k, urunToplamlari(sy, sube())); } return _tpMemo.get(k); }
  function stokBul(u, sy) { // verilen sayım ya da ürünü sayan en son sayım
    const l = sy ? [sy] : [...S.sayimlar].sort((a, b) => sonZaman(b).localeCompare(sonZaman(a)));
    for (const c of l) { const t = toplamlar(c)[u]; if (t && t.say) return { sy: c, t: t.t }; } return null;
  }

  // --- sevkiyat takvimi: sipariş günü + 1 = sevk (irsaliye) günü
  const sevkGunleri = sb => new Set((sb?.takvim || []).map(t => (t.gun + 1) % 7));
  function oncekiSevk(sb, tarih) { const g = sevkGunleri(sb); if (!g.size) return null; for (let i = 1; i <= 14; i++) { const d = gunEkle(tarih, -i); if (g.has(haftaGunu(d))) return d; } return null; }
  // Girilmesi gereken ama girilmemiş sevkiyatlar. baslangicSaati: uyarının başladığı saat (uygulamada 12, 22:00 bildiriminde de 12)
  function eksikIrsaliyeler(sb, baslangicSaati = 12) {
    if (!sb?.takvim?.length || !S.irsaliyeler.length) return [];
    const ilk = S.irsaliyeler[S.irsaliyeler.length - 1].tarih; const bg = isGunu(); const saat = saatTR(); const out = [];
    for (let i = 0; i <= 8; i++) { const od = gunEkle(bg, -i); if (!sb.takvim.some(t => t.gun === haftaGunu(od))) continue; // od = sipariş günü
      const sevk = gunEkle(od, 1), son = gunEkle(od, 2); if (sevk <= ilk) continue;
      const zamaniGeldi = bg > son || (bg === son && saat >= baslangicSaati); if (!zamaniGeldi || bg > gunEkle(sevk, 7)) continue;
      if (S.irsaliyeler.some(ir => ir.tarih > od)) continue; // sipariş gününden sonra herhangi bir irsaliye girilmişse uyarma
      out.push({ sevk, son }); }
    return out;
  }

  // --- SKT durumu
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

  // Bir şubenin günlük SKT özeti (bildirim, WhatsApp metni ve uygulama aynı hesabı kullanır)
  function sktOzet() {
    const R = bugun(), Y = gunEkle(R, 1), o = { atik: [], bugun: [], yarin: [] };
    const sayi = n => String(r6(n)).replace('.', ',');
    for (const u of Object.keys(S.urunler)) {
      const x = S.urunler[u]; if (x.aktif === false || !x.sktGun) continue;
      let d; try { d = sktDurum(u); } catch { continue; } if (!d || d.sayimYok) continue;
      const ad = x.ad || u, bi = x.birim === 'kg' ? ' kg' : '';
      if (d.atik > 0) o.atik.push({ a: ad, q: sayi(d.atik) + bi });
      for (const p of d.gecerli) if (p.a > 0) { if (p.son === R) o.bugun.push({ a: ad, q: sayi(p.a) + bi }); else if (p.son === Y) o.yarin.push({ a: ad, q: sayi(p.a) + bi }); }
    }
    return o;
  }
  const ozetBos = o => !o.atik.length && !o.bugun.length && !o.yarin.length;
  const ogeMetin = i => `${i.a} ${i.q}`;
  function ozetMetin(ad, o) { // WhatsApp / bildirim metni
    const t = bugun().split('-').reverse().slice(0, 2).join('.');
    const l = [`*${ad} – SKT özeti (${t})*`];
    if (ozetBos(o)) l.push('Bugün SKT yok ✓');
    if (o.atik.length) l.push('🗑 Atık: ' + o.atik.map(ogeMetin).join(', '));
    if (o.bugun.length) l.push('⚠️ Bugün son gün: ' + o.bugun.map(ogeMetin).join(', '));
    if (o.yarin.length) l.push('⏰ Yarın son gün: ' + o.yarin.map(ogeMetin).join(', '));
    return l.join('\n');
  }
  return { sktOzet, ozetBos, ozetMetin, ogeMetin, bugun, isGunu, haftaGunu, gunEkle, refTarih, saatTR, sube, varsGun, varsHaf, sayimdaMi, grupSirala, kapsam, deger, satirDara, koliIci, prm, sayildi, satirToplam, urunToplamlari, sonZaman, toplamlar, stokBul, sevkGunleri, oncekiSevk, eksikIrsaliyeler, sktDurum };
}
