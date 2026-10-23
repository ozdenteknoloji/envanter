# Envanter — Kurulum

Uygulama, Firebase'de (giriş + veritabanı) çalışan bir web uygulamasıdır. Kimin neyi göreceğini `firestore.rules` dosyasındaki kurallar **sunucuda** kontrol eder. Puantajdan ayrı bir Firebase projesidir (`envanter-merkezi`), maaş verisine hiçbir yoldan erişemez.

| Hesap | Görebildiği |
|---|---|
| Şube hesabı | Kendi şube(ler)inin sayımları ve sonuçları. Ayarlar sekmesinden (iki dokunuşla) sadece kendi şubesinin ürün yerlerini, konum sıralarını, sonuç sırasını, günlük listesini ve şubeye özel koli içini düzenler; bir ürünü sadece kendi şubesinden çıkarabilir. Şube müdürü ve vardiya sorumlusu aynı hesabı kullanabilir. Birden fazla şubeye bakan kişiye birden çok şube verilir; girişte şube seçer. |
| Yönetici (admin) | Her şey: ürünler, şube ayarları, kullanıcılar. |

## 1. Firebase
1. **Authentication → Başlayın → Sign-in method → E-posta/Şifre → Etkinleştir.**
2. **Authentication → Settings → Authorized domains → Add domain** → `ozdenteknoloji07-max.github.io`
3. **Firestore Database → Veritabanı oluştur** → konum `eur3 (Europe)` → üretim modu.
4. **Firestore Database → Kurallar**: içindekileri silin, `firestore.rules` dosyasının tamamını yapıştırın → **Yayınla**.
5. **Authentication → Users → Kullanıcı ekle** → e-posta `admin@envanter-merkezi.app`, güçlü bir şifre. (Kullanıcı adınız `admin` olur.)

## 2. İlk giriş
1. https://ozdenteknoloji07-max.github.io/envanter/ → `admin` ve şifreyle girin → **İlk kurulum** → adınızı yazıp **Yönetici olarak kur**. Bu ekran yalnızca bir kez çalışır.
2. **Ayarlar → Serik Excel verisini yükle**: 105 ürün, Serik'in 6 konumu ve sonuç sırası gelir.
3. **Ayarlar → Şubeler → + Yeni şube** → "Ayarları kopyala: Serik" seçerek diğer şubeleri açın, sonra farklarını düzeltin.
4. **Ayarlar → Kullanıcılar → + Yeni kullanıcı** → şube hesaplarını açın (ör. kullanıcı adı `serik`).

Telefonda adresi açın → tarayıcı menüsü → **Ana ekrana ekle**.

## Sayım nasıl çalışır
- Her şubede günde bir **günlük** ve bir **haftalık** sayım olabilir. Haftalık sayımda bütün ürünler, günlük sayımda sadece "Günlük sayım listesi"ndeki ürünler sayılır.
- Konum sekmeleri (Makeline, Walk-in, Dolap…) şube ayarındaki sırayla gelir; ürünler de konumdaki sırayla.
- Rakam yazılır → **İleri** → sonraki ürün. Konum bitince sonraki konuma geçer. **Boş geçilen satır 0 sayılır.**
- **+ Ekstra**: açılmış koli / kg doğrudan eklenir (ör. 56 koli mozzarella + 1,4 kg).
- Sayım şekli (konum ayarından): **Koli** = koli × koli içi + ekstra · **Tartı** = brüt kg − kap sayısı × dara + ekstra · **Adet** = adet + ekstra.
- Koli içi ya da dara değişirse yeni sayımlar yeni değerle hesaplanır, eski sayımlar eski değerle kalır.
- İnternet yoksa (soğuk hava deposu) yazılanlar telefonda tutulur, bağlantı gelince gönderilir.
- Sayımlar 7 gün saklanır.

## Ürün yerleri
**Ayarlar → Şube → Ürün yerleri**: her ürünün altında şubenin konumları düğme olarak durur; dokununca ürün o konumun sonuna eklenir, tekrar dokununca çıkar. "Hiçbir yerde olmayanlar" filtresi sayılmayacak ürünleri gösterir. Sayım şekli kendiliğinden seçilir (Makeline'da darası varsa tartı; diğer konumlarda koli içi varsa koli; yoksa adet), konum sayfasından değiştirilebilir.

Sayım ekranında (sadece yönetici) konum sekmelerinin sonundaki **⚙** iki kez dokununca açılır: o konuma ürün ekle, üzerinde durulan ürünü konumdan çıkar, konum sırasını düzenle, ürün yerleri tablosu.

## Sonuç
Şubenin **sonuç sırası** (Domino's sistemine giriş sırası) ile listelenir. Sisteme girilen ürüne dokunup işaretlenir; işaretler sayımla birlikte saklanır, başka telefondan da görünür. "Resim olarak paylaş" ile WhatsApp'a atılır.
