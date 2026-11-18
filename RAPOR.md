# Tarif Arşivi: ekip lideri raporu (Görev 1–8)

Tarih: 2026-11-18. Dal: `Cano/ekip-lideri`. Hiçbir şey GitHub'a gönderilmedi (`git push` yapılmadı).

## Kim ne yaptı

| Görev | Yapan | Commit | Testler |
|---|---|---|---|
| 1. İskelet, paketler, ortak tipler | Lider | `e896fce` chore: iskelet ve ortak tipler | 3 |
| 2. Türkçe arama | İşçi `ctx_693adc8a9ac1` | `a757b8a` feat: türkçe arama | 13 |
| 3. Veritabanı ve yedek | İşçi `ctx_58e77a3846b5` | `c49464e` feat: yerel veritabanı ve yedek | 11 |
| 4. Kare hazırlama | İşçi `ctx_cf5607ff2a8d` | `ed95901` feat: kare hazırlama | 17 |
| 5. Claude ile tarif çıkarma | İşçi `ctx_d7fcc589bed7` | `8a39f5c` feat: claude ile tarif çıkarma | 24 |
| 6. İşlem sırası | İşçi `ctx_7406933f05dd` | `568e24e` feat: toplu işlem sırası | 13 |
| 7. Ekranlar | İşçi `ctx_b95d3cd4f980` | `3432ce7` feat: ekranlar | 10 |
| 8. Çevrimdışı açılma ve yayın akışı | İşçi `ctx_6643cdbdc2ee` | `53cb789` feat: pwa ve yayın akışı | 4 |

Görev 2, 3, 4 ve 5 aynı anda yürüdü, ardından Görev 6 geldi, sonra 7 ve 8 yine aynı anda yürüdü. Hepsi aynı klasörde çalıştı (`--worktree current`), her işçi yalnız kendi dosyalarına dokundu. `package.json` dosyasını yalnız lider değiştirdi. İşçiler commit yapmadı, hiçbir paket istemedi. Hiçbir görev geri gönderilmedi, hepsi ilk seferde geçti.

## Test ve build sonuçları (son durum)

- `npm test`: **11 dosya, 95 test, hepsi geçti.**
- `npm run build` (önce TypeScript denetimi, sonra Vite): **hatasız.** Ortaya `dist/manifest.webmanifest`, `dist/sw.js` (çevrimdışı çalışma dosyası) ve 11 önbellek kaydı çıkıyor.
- Tek uyarı: ana JavaScript dosyası yaklaşık 605 kB. Büyük kısmı Anthropic kütüphanesi. Telefonda ilk açılışta biraz yavaş olabilir. Sonra önbellekten açıldığı için sorun değil.
- Ara kontrol notu: Görev 2, 4 ve 3 commit edilirken diğer işçilerin dosyaları henüz yarımdı. O yüzden bu üçünü yalnız kendi testleri ve kendi dosyalarının tip denetimiyle doğruladım. Görev 5'ten sonra tam `npm test` ve `npm run build` yeşildi. Görev 8 de ekranlar yarımken commit edildi; kendi testi geçiyordu. Görev 7'den sonra her şey yeniden tam olarak denendi ve yeşil.

## Review Focus: 5 madde hangi testle karşılanıyor

1. **Altyazısız veya tarifsiz video**
   - `src/extract/claude.test.ts`: "Boş tarif (Review Focus 1)". Claude boş liste döndüğünde sonuç `ok` sayılıyor ve listeler boş kalıyor.
   - `src/ui/review.test.ts`: "malzeme ve adım boşsa ad yazılsa da Kaydet pasif; satır eklenip yazılınca aktif". Bu durumda ekranda "Bu kayıtta tarif bulunamadı" yazıyor.
2. **Okuma yarıda kalırsa (uygulama arka plana gider ya da internet kesilir)**
   - `src/queue/queue.test.ts`: "ikinci öğede network hatası: o öğe failed, üçüncü yine işlenir".
   - Aynı dosyada: "processing'de kalmış öğe resetStuck sonrası pending olur ve işlenir", "beklenmeyen istisna öğeyi failed yapar, processing'de bırakmaz" ve "failed öğe retry sonrası tekrar işlenir".
   - Liste ve onay ekranında "tekrar dene" bandı ve düğmesi var. Bunların görünmesi ayrıca test edilmedi, kodu okudum.
3. **Geçersiz anahtar, kredi bitti, 429**
   - `src/extract/claude.test.ts`: "AuthenticationError → auth", "PermissionDeniedError → auth", "mesajında credit geçen BadRequestError → credit", "402 durum kodlu APIError → credit", "RateLimitError → other, çok fazla istek mesajı", "APIConnectionError → network". Hepsinde mesajlar Türkçe ve anahtar mesaja hiç girmiyor.
   - `src/queue/queue.test.ts`: "auth / credit hatasında işlenen öğe ve kalanlar paused olur". Öğeler `failed` değil `paused` oluyor.
   - `src/ui/add.test.ts`: "anahtar sorununda okuma durunca Türkçe neden ve Ayarlar bağlantısı görünür".
   - 429 ve 5xx hatalarında kütüphanenin kendi yeniden denemesi açık bırakıldı (varsayılan `maxRetries`).
4. **Uzun ekran kaydı (3–5 dk)**
   - `src/media/frames.test.ts`: "uzun kayıtta (300 sn) en fazla 40 kare verir…" ve "çok uzun kayıtta da 40'ı aşmaz".
   - Gönderimden önce maliyet gösterimi: `src/ui/add.test.ts` "1 video + 1 fotoğraf seçilince toplam tahmini maliyeti gösterir" ve `src/extract/cost.test.ts`.
   - Not: Plan bu maliyet testini Görev 8'e bağlıyordu. Ama maliyet ekle ekranında gösterildiği için test Görev 7'de yazıldı.
5. **Türkçe büyük İ/ı ve şapkalı harfler**
   - `src/search/search.test.ts`: "İSPANAK, ıspanak ve ispanak sorguları aynı sonucu verir (Review Focus 5)".
   - Aynı dosyada `normalizeTr` testleri de var (İ, ı, ç, ğ, ö, ü, ş ve şapkalı harfler).

## Kırmızı çizgiler

- `git push` yok. Proje klasörü dışına kod yazılmadı. İşçilere verilen görev metinleri yalnızca oturumun geçici klasöründe duruyor.
- Gerçek Claude API çağrısı yapılmadı. Bütün testlerde sahte istemci kullanıldı.
- API anahtarı hiçbir dosyada yok. Testlerde yalnız sahte değerler var (`test-anahtar`, `sk-ant-test-gizli`). Yedek dosyası ayarlar tablosunu hiç okumuyor, bunu bir test doğruluyor.
- Planda olmayan paket eklenmedi. Lisanslar `npm view` ile doğrulandı:
  - MIT: vite, zod, vitest, jsdom, vite-plugin-pwa
  - Apache-2.0: typescript, dexie, @anthropic-ai/sdk, fake-indexeddb
  - vite-plugin-pwa'nın kendi kullandığı workbox-build ve workbox-window da MIT.
  - Not: Plan `@anthropic-ai/sdk` için MIT yazıyordu, gerçekte Apache-2.0. Bu da kabul edilenler arasında.

## Eksik kalanlar ve Cano'nun bilmesi gerekenler

- **iPhone'da denenmesi gerekenler (Görev 10):**
  - Videodan kare alma (`extractVideoFrames`) ve fotoğraf küçültme (`preparePhoto`) bilgisayardaki test ortamında çalışmıyor, gerçek telefonda denenmeleri gerekiyor. Özellikle iPhone Safari'nin videoda ileri sarma davranışına bakılmalı.
  - Ana ekrana ekleme ve uçak modunda açılma da telefonda denenmeli.
- **Yayın (Görev 9):**
  - Yayın akışı dosyası hazır: `.github/workflows/pages.yml`. `main` dalına gönderilince testleri çalıştırıp siteyi GitHub Pages'e yayınlıyor.
  - Bu dal henüz `main`'e birleştirilmedi.
  - GitHub hesabı, gönderme ve Pages ayarı Cano ile birlikte yapılacak.
- **Güvenlik uyarısı:** `npm audit` 4 orta düzey uyarı veriyor. Uyarılar glob ve minimatch paketlerinde; bunlar vite-plugin-pwa'nın yalnız build sırasında kullandığı workbox-build'den geliyor. Telefona giden uygulamada bu kod yok. Önerilen "düzeltme" vite-plugin-pwa'yı eski sürüme indirmek, o yüzden yapılmadı.
- **İşçilerin verdiği küçük kararlar:**
  - Kapak ayrı saklanmıyor, ilk kare kapak sayılıyor.
  - Fotoğraf ve kareler veritabanında ham bayt olarak tutuluyor, çünkü iPhone'da dosya olarak saklamak güvenilir değil.
  - 429 (çok fazla istek) hatasında öğe `failed` oluyor ve "tekrar dene" ile yeniden okunabiliyor.
  - API anahtarı Ayarlar'da yeniden gösterilmiyor, yalnız "kayıtlı" yazıyor.
- **Maliyet tahmini:** Opus 5.5 ile 40 karelik bir video yaklaşık 0,13 $, Haiku 5.5 ile 0,01 $'ın altında. Bunlar tahmin. Gerçek rakam Görev 10'daki denemelerde `usage` bilgisinden görülecek.
- **Küçük bir tekrar:** Önbellek listesinde `manifest.webmanifest` iki kez geçiyor. Zararsız, istenirse sonra temizlenir.
