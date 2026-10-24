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
- Her şubede sadece **son bitmiş günlük** ve **son bitmiş haftalık** sayım ile o günün devam eden sayımı saklanır. Önceki günden bitirilmeden kalan sayım kendiliğinden bitirilmiş sayılır. SKT ve sipariş her ürün için bu iki sayımdan daha yeni olanını kullanır.
- Gece 00:00–06:00 arası başlatılan sayım bir önceki günün sayımıdır.

## Ürün yerleri
**Ayarlar → Şube → Ürün yerleri**: her ürünün altında şubenin konumları düğme olarak durur; dokununca ürün o konumun sonuna eklenir, tekrar dokununca çıkar. "Hiçbir yerde olmayanlar" filtresi sayılmayacak ürünleri gösterir. Sayım şekli kendiliğinden seçilir (Makeline'da darası varsa tartı; diğer konumlarda koli içi varsa koli; yoksa adet), konum sayfasından değiştirilebilir.

Sayım ekranında (sadece yönetici) konum sekmelerinin sonundaki **⚙** iki kez dokununca açılır: o konuma ürün ekle, üzerinde durulan ürünü konumdan çıkar, konum sırasını düzenle, ürün yerleri tablosu.

## İrsaliye ve SKT
- **SKT → + İrsaliye ekle**: kağıt irsaliyenin fotoğrafı ya da 3SC "Teslim edildi" mailinin ekran görüntüsü Gemini ile okunur (anahtar: Ayarlar → Fotoğraf okuma). Ürünler listemizle eşleştirilir; eşleşmeyenler elle seçilir ve bir sonraki sefere öğrenilir. Gıda dışı kalemler (şapka, yelek, Suma…) atlanır. Elle de girilebilir.
- SKT başlangıcı: kağıt irsaliyede **Sevk Tarihi**, mailde **Sevkiyat Tarihi**. Son gün = sevk tarihi + ürünün SKT günü, o günün 23:59'una kadar. Saat 22:00'den sonra yarının tarihine göre bakılır.
- Atık hesabı: son sayım (+ sayımdan sonra gelen irsaliyeler) − SKT'si geçmemiş irsaliyelerin toplamı. Önce gelen önce kullanılır varsayılır; atık önce Makeline'dan düşülür ("muhtemelen Makeline'daki"). Atık, ürünün SKT süresi kadar geriye irsaliye kaydı birikince hesaplanmaya başlar.
- Çözülme günü olan ürünler (mozzarella gibi) gelişten sonraki günlerde "çözülüyor, henüz kullanmayın" diye görünür.
- Sonuç ekranında SKT'li ürünlerin yanında "40 atık", "yarın SKT" ya da "SKT yok" yazar. İrsaliyeler 30 gün saklanır.

## Sonuç
Şubenin **sonuç sırası** (Domino's sistemine giriş sırası) ile listelenir. Sisteme girilen ürüne dokunup işaretlenir; işaretler sayımla birlikte saklanır, başka telefondan da görünür. "Resim olarak paylaş" ile WhatsApp'a atılır.

## Sipariş
- **Ayarlar → Şube → Sevkiyat takvimi**: sipariş günleri ve her siparişin kaç günü karşılayacağı. Varsayılan: Serik, Belek, Legends, Manavgat, Kumköy, Ankara İlkbahar → Pazartesi 5 gün, Perşembe 6 gün; Döşemealtı, Altınkale, Ankara Yıldız → Salı 5 gün, Cuma 6 gün.
- **Sipariş** sekmesi: bir sonraki sipariş günü açılır. Domino's'tan ideali hangi aralıkla alacağınızı söyler (sipariş gününden 6 gün önce başlar, gün sayısı kadar; ör. 19'u Pazartesi → 13–17, 22'si Perşembe → 16–21).
- İdealleri yazın, buff seçin. Koli = (ideal ÷ gün × (gün + buff) − elde) ÷ sipariş kolisi. Elde son sayımdan (ve sayımdan sonra gelen irsaliyelerden) gelir. Liste'yi siz yazarsınız; "Listeyi paylaş" ile WhatsApp'a atılır.
- Ürünler'de **Sipariş** işareti ve **sipariş kolisi** (Domino's sevkiyat kolisi: sucuk 10 kg, mozzarella 12 kg, 7 hamur 12…) ayrıca tutulur.
