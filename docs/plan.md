# Tarif Arşivi: uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Bu projede yürütme orca ekibiyle yapılır: lider Claude görevleri işçilere dağıtır (bkz. "Yürütme düzeni").

**Hedef:** iPhone'da ana ekrana eklenen bir web uygulaması. Tarif fotoğraflarını ve altyazılı video ekran kayıtlarını Claude ile okuyup tarif taslağı çıkarır, Cano onaylayınca kaydeder, ada ve içeriğe göre arar.

**Mimari:** Sunucusuz, tek sayfalık TypeScript uygulaması. Veri telefonda (IndexedDB, Dexie) tutulur. Video karelerini telefonda `<video>` ve `<canvas>` ile alır, Claude Messages API'yi tarayıcıdan doğrudan Cano'nun kendi anahtarıyla çağırır. GitHub Pages'te yayınlanır, vite-plugin-pwa ile çevrimdışı açılır.

**Teknoloji:** Vite, TypeScript, Vitest + jsdom + fake-indexeddb (testler), Dexie (Apache-2.0), zod (MIT), `@anthropic-ai/sdk` (MIT), vite-plugin-pwa (MIT). Arayüz çatısı yok, düz DOM ve TypeScript kullanılır (YAGNI).

**Spec:** `docs/tasarim.md`. Yürütücüler planla birlikte bunu da okur.

## Global Constraints
- Bağımlılık lisansı yalnızca MIT veya Apache-2.0. Listede olmayan bir paket eklemeden önce lisansını kontrol et.
- Arayüz metinleri Türkçe.
- API anahtarı yalnızca telefondaki depoda (IndexedDB `settings`) durur. Koda, depoya, loglara, URL'ye asla girmez.
- Cano onaylamadan hiçbir tarif `recipes` tablosuna yazılmaz. Taslaklar `drafts` tablosunda bekler.
- Kaynakta olmayan malzeme veya adım üretilmez. Okunamayan kısım `uncertain: true` ile işaretlenir.
- El yazısı okuma, seslendirmeyi yazıya çevirme, bağlantıdan video indirme yok.
- Videonun kendisi saklanmaz. Yalnız küçültülmüş kapak karesi ve gönderilen kareler (JPEG, uzun kenar ≤768 px) saklanır.
- Model: `claude-opus-5-5` (varsayılan; Cano Haiku 5.5'i seçerse `claude-haiku-5-5`), Ayarlar'dan değiştirilebilir. Opus/Sonnet 5.5 isteklerinde `betas: ["server-side-fallback-2026-07-01"]` + `fallbacks: "default"` eklenir; `stop_reason === "refusal"` ayrıca ele alınır.
- Yayın tabanı: `https://<github-kullanıcı>.github.io/tarif-arsivi/` (Vite `base: "/tarif-arsivi/"`). İlk tariften sonra adres değiştirilmez.
- `git push` yalnızca Görev 9'da, Cano GitHub hesabını açtıktan sonra yapılır.

## Review Focus
1. **Altyazısız veya tarifsiz video:** Claude boş liste döner → taslakta "Bu kayıtta tarif bulunamadı" yazar, kaydet düğmesi yalnızca Cano elle bir şey eklerse açılır. (Görev 5 + Görev 7 testleri)
2. **Okuma sırasında uygulama arka plana gider ya da internet kesilir:** öğe `pending`/`failed` kalır, kaybolmaz; uygulama açılınca "tekrar dene" görünür. (Görev 6 testi)
3. **Geçersiz anahtar / kredi bitti / 429:** Türkçe açık mesaj gösterilir. 401 ve 402/kredi hatasında sıra durur, öğeler `failed` olmaz, `paused` olur. 429 ve 5xx için SDK'nın kendi yeniden denemesi kullanılır. (Görev 5 + Görev 6 testleri)
4. **Uzun ekran kaydı (3–5 dk):** en fazla 40 kare gönderilir, gönderimden önce tahmini maliyet gösterilir. (Görev 4 + Görev 8 testleri)
5. **Türkçe büyük İ/ı ve şapkalı harfler aramada:** "İSPANAK", "ıspanak", "ispanak" aynı sonucu verir. (Görev 2 testi)

---

## Yürütme düzeni (orca)
- **Lider** Görev 1'i kendisi yapar, sonra 2, 3, 4 ve 5'i dört işçiye paralel dağıtır (`--worktree current` değil, ayrı worktree; her işçi yalnız kendi dosyalarına dokunur). Ardından 6'yı tek işçiye, 7'yi bir, 8'i başka bir işçiye verir. 9 ve 10 Cano'yla birlikte yapılır.
- Her görevin sonunda lider `npm test` ve `npm run build` çalıştırır, geçmeyeni işçiye geri gönderir.
- PowerShell 5.1 tırnak tuzağı: görev metinleri dosyadan verilir.

---

### Task 1: Proje iskeleti ve ortak tipler

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.ts`, `src/types.ts`, `src/config.ts`, `.gitignore`, `docs/plan.md` (bu planın kopyası), `docs/tasarim.md` (spec kopyası)
- Test: `src/types.test.ts`

**Interfaces:**
- Produces (`src/types.ts`):
  - `type Line = { text: string; uncertain: boolean }`
  - `type RecipeContent = { sourceLanguage: string; ingredients: Line[]; steps: Line[]; ingredientsTr: Line[] | null; stepsTr: Line[] | null; rawText: string }` (`*Tr` yalnızca kaynak Türkçe değilse dolu)
  - `type Recipe = RecipeContent & { id: string; title: string; sourceUrl: string | null; note: string; coverJpeg: Blob | null; frames: Blob[]; createdAt: number; updatedAt: number }`
  - `type QueueStatus = "pending" | "processing" | "draft" | "failed" | "paused"`
  - `type QueueItem = { id: string; kind: "video" | "photo" | "text"; file: Blob | null; pastedText: string | null; sourceUrl: string | null; status: QueueStatus; error: string | null; frames: Blob[]; draft: RecipeContent | null; createdAt: number }`
- Produces (`src/config.ts`): `FRAME_INTERVAL_SEC = 1.5`, `MAX_FRAMES = 40`, `FRAME_MAX_SIDE = 768`, `DEDUPE_THRESHOLD = 0.02`, `MODELS = { "claude-opus-5-5": { in: 4.0, out: 20.0 }, "claude-haiku-5-5": { in: 0.10, out: 0.50 } }` (USD / 1M token, 2026-11-03 tablosu), `DEFAULT_MODEL = "claude-opus-5-5"`

- [ ] **Step 1:** `npm create vite@latest . -- --template vanilla-ts`, ardından `npm i dexie zod @anthropic-ai/sdk` ve `npm i -D vitest jsdom fake-indexeddb vite-plugin-pwa`. Her paketin lisansını `npm view <paket> license` ile doğrula (MIT veya Apache-2.0 olmalı).
- [ ] **Step 2:** `vite.config.ts` içinde `base: "/tarif-arsivi/"`, Vitest `environment: "jsdom"`.
- [ ] **Step 3:** Test `types.test.ts`: `MODELS[DEFAULT_MODEL]` tanımlı ve `MAX_FRAMES === 40`.
- [ ] **Step 4:** `npm test` → PASS; `npm run build` → hatasız.
- [ ] **Step 5:** `git init`, commit `chore: iskelet ve ortak tipler`.

### Task 2: Türkçe arama

**Files:** Create `src/search/normalize.ts`, `src/search/search.ts`; Test `src/search/search.test.ts`

**Interfaces:**
- Consumes: `Recipe` (Task 1)
- Produces: `normalizeTr(s: string): string`; `searchRecipes(recipes: Recipe[], query: string): Recipe[]`

- [ ] **Step 1: Testler**
  - `normalizeTr("İSPANAKLI Börek") === "ispanakli borek"`; `normalizeTr("ışığı") === "isigi"`; `"Çğöüş"` → `"cgous"`.
  - Adı "Mercimek çorbası" olan tarif `"corba"` ile bulunur.
  - Adında geçmeyip malzemesinde "ıspanak" olan tarif `"ISPANAK"` ile bulunur.
  - Yalnız `ingredientsTr` içinde "nohut" geçen (kaynağı "chickpeas" olan) tarif `"nohut"` ile de, `"chickpea"` ile de bulunur.
  - Çok kelimeli sorgu `"fırın tavuk"` iki kelimenin de geçtiği tarifleri döner (sıra önemsiz).
  - Boş sorgu bütün tarifleri `updatedAt` azalan sırayla döner.
  - Sıralama: adda eşleşen, yalnız içerikte eşleşenden önce gelir.
- [ ] **Step 2:** `npx vitest run src/search` → FAIL.
- [ ] **Step 3:** Uygula. Önce `toLocaleLowerCase("tr")`, sonra ı→i, ş→s, ç→c, ğ→g, ö→o, ü→u, ardından birleşik aksan temizliği. Ad, not, malzeme, adım, `*Tr` alanları ve `rawText` üzerinde arama yapılır. Bellekte filtreleme yeterli (birkaç yüz kayıt).
- [ ] **Step 4:** PASS. **Step 5:** commit `feat: türkçe arama`.

### Task 3: Veritabanı ve yedek

**Files:** Create `src/db/db.ts`, `src/backup/backup.ts`; Test `src/db/db.test.ts`, `src/backup/backup.test.ts`

**Interfaces:**
- Consumes: `Recipe`, `QueueItem` (Task 1)
- Produces:
  - `db` (Dexie): tablolar `recipes` (anahtar `id`), `queue` (anahtar `id`, dizin `status`), `settings` (anahtar `key`)
  - `saveRecipe(r: Recipe): Promise<void>`, `listRecipes(): Promise<Recipe[]>`, `getRecipe(id): Promise<Recipe | undefined>`, `deleteRecipe(id): Promise<void>`
  - `putQueueItem(q: QueueItem): Promise<void>`, `listQueue(status?: QueueStatus): Promise<QueueItem[]>`, `deleteQueueItem(id): Promise<void>`
  - `getSetting(key: "apiKey" | "model" | "lastBackupAt"): Promise<string | undefined>`, `setSetting(key, value: string): Promise<void>`
  - `exportArchive(): Promise<Blob>`: tek JSON dosyası, `{ version: 1, exportedAt, recipes: [...] }`, Blob'lar base64 olarak. API anahtarı **dahil edilmez**.
  - `importArchive(file: Blob): Promise<{ added: number; skipped: number }>`: aynı `id` varsa atlar.

- [ ] **Step 1: Testler** (`fake-indexeddb/auto`):
  - kaydet → listele → aynı alanlar, Blob'lar dahil;
  - `exportArchive` çıktısında `apiKey` geçmez;
  - export → boş DB'ye import → `{added: N, skipped: 0}`, ikinci import → `{added: 0, skipped: N}`;
  - bozuk JSON import'u Türkçe hata mesajıyla reddedilir, DB değişmez.
- [ ] **Step 2:** FAIL. **Step 3:** Uygula. **Step 4:** PASS. **Step 5:** commit `feat: yerel veritabanı ve yedek`.

### Task 4: Videodan ve fotoğraftan kare hazırlama

**Files:** Create `src/media/frames.ts`, `src/media/image.ts`; Test `src/media/frames.test.ts`

**Interfaces:**
- Consumes: `config` (Task 1)
- Produces:
  - `pickTimestamps(durationSec: number, intervalSec = FRAME_INTERVAL_SEC, max = MAX_FRAMES): number[]`
  - `isNearDuplicate(a: Uint8Array, b: Uint8Array, threshold = DEDUPE_THRESHOLD): boolean`: 32×32 gri küçük resim parmak izi, ortalama mutlak fark / 255
  - `extractVideoFrames(file: Blob): Promise<{ frames: Blob[]; cover: Blob }>` (yalnız tarayıcı)
  - `preparePhoto(file: Blob): Promise<Blob>`: JPEG, uzun kenar ≤ `FRAME_MAX_SIDE`

- [ ] **Step 1: Testler** (saf fonksiyonlar):
  - `pickTimestamps(30)` → `[0.75, 2.25, …]` (aralık ortaları), uzunluk 20;
  - `pickTimestamps(300)` → uzunluk 40, aralığa yayılmış (ilk < 8, son > 292);
  - `pickTimestamps(0.5)` → `[0.25]`;
  - `isNearDuplicate` aynı dizide true, tamamen farklıda false.
- [ ] **Step 2:** FAIL. **Step 3:** Uygula.
  - `extractVideoFrames`: `<video muted playsinline preload="auto">` + `URL.createObjectURL`. Her zaman damgası için `currentTime` ver, `seeked` olayını bekle, `canvas`'a çiz. Önceki kabul edilen kareyle `isNearDuplicate` ise atla. Her kareyi `toBlob("image/jpeg", 0.8)` ile kaydet. Kapak = ilk kabul edilen kare.
  - Bu fonksiyon jsdom'da test edilmez, Görev 10'da iPhone'da elle doğrulanır.
- [ ] **Step 4:** PASS. **Step 5:** commit `feat: kare hazırlama`.

### Task 5: Claude ile tarif çıkarma

**Files:** Create `src/extract/schema.ts`, `src/extract/prompt.ts`, `src/extract/claude.ts`, `src/extract/cost.ts`; Test `src/extract/claude.test.ts`, `src/extract/cost.test.ts`

**Interfaces:**
- Consumes: `RecipeContent`, `Line`, `MODELS` (Task 1)
- Produces:
  - `RecipeContentSchema` (zod, `RecipeContent` ile birebir)
  - `extractRecipe(input: { images: Blob[]; pastedText: string | null }, opts: { apiKey: string; model: string; client?: Anthropic }): Promise<ExtractResult>`
  - `type ExtractResult = { ok: true; content: RecipeContent; usage: { input: number; output: number } } | { ok: false; reason: "auth" | "credit" | "refusal" | "network" | "invalid" | "other"; message: string }` (`message` Türkçe)
  - `estimateCostUsd(imageCount: number, model: string): number`: kare başına ≈ (432×768)/750 ≈ 442 token, istem ≈ 1 000, çıktı ≈ 3 000 token
  - `imageTokens(w: number, h: number): number = ceil(w*h/750)`

- [ ] **Step 1: Testler** (`client` sahte bir nesneyle enjekte edilir, gerçek API çağrılmaz):
  - Başarılı cevaptaki `parsed_output` olduğu gibi döner, `ok: true`;
  - istekte her kare `{type:"image", source:{type:"base64", media_type:"image/jpeg"}}` olarak, metin bloğundan **önce** gönderilir;
  - istek `output_config.format` içerir; Opus modelinde `fallbacks: "default"` ve beta başlığı vardır, Haiku'da yoktur;
  - `AuthenticationError` → `reason: "auth"`, mesaj "API anahtarı geçersiz";
  - kredi/402 benzeri `BadRequestError` (mesajında "credit") → `reason: "credit"`;
  - `stop_reason: "refusal"` → `reason: "refusal"`;
  - `parsed_output === null` → `reason: "invalid"`;
  - `estimateCostUsd(40, "claude-opus-5-5")` ≈ 0.13 (±0.02), `estimateCostUsd(40, "claude-haiku-5-5")` < 0.01.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Uygula.
  - İstemci: `new Anthropic({ apiKey, dangerouslyAllowBrowser: true })`. Bu seçeneğin adını `@anthropic-ai/sdk` README'sinden doğrula, tahmin etme.
  - Çağrı `client.beta.messages.parse` (fallback betası Opus'ta gerekli; parse + zod yardımcısı `@anthropic-ai/sdk/helpers/zod` → `zodOutputFormat`). `max_tokens: 16000`, `output_config.effort: "medium"`.
  - `thinking` gönderilmez (Opus 5.5'te varsayılan adaptive).
  - Hata zinciri en özelden genele: `AuthenticationError` → `PermissionDeniedError` → `RateLimitError` → `APIStatusError` → `APIConnectionError`.
  - `prompt.ts` sistem istemi (Türkçe veya İngilizce, sabit metin, önbellek dostu):
    - Görüntülerdeki **basılı ekran yazısını ve altyazıları** oku. El yazısını yok say.
    - Aynı altyazı birden çok karede görünüyorsa bir kez yaz.
    - **Yalnız görünen bilgiyi** malzeme ve adım olarak çıkar. Miktar görünmüyorsa uydurma, okunamayanı `uncertain: true` yap.
    - Tarif yoksa listeleri boş bırak.
    - `rawText` tüm okunan yazıyı sırayla içersin.
    - Kaynak dil Türkçe değilse `ingredientsTr`/`stepsTr` alanlarını sadık çeviriyle doldur (miktar ve birimleri değiştirme), Türkçeyse `null`.
- [ ] **Step 4:** PASS. **Step 5:** commit `feat: claude ile tarif çıkarma`.

### Task 6: İşlem sırası (toplu ekleme)

**Files:** Create `src/queue/queue.ts`; Test `src/queue/queue.test.ts`

**Interfaces:**
- Consumes: `putQueueItem`, `listQueue`, `getSetting` (Task 3); `extractVideoFrames`, `preparePhoto` (Task 4); `extractRecipe` (Task 5)
- Produces:
  - `enqueueFiles(files: File[], sourceUrl?: string): Promise<QueueItem[]>`: `video/*` → `kind:"video"`, `image/*` → `"photo"`
  - `enqueueText(text: string, sourceUrl?: string): Promise<QueueItem>`
  - `processQueue(deps?: { extract?: typeof extractRecipe; frames?: typeof extractVideoFrames; photo?: typeof preparePhoto; onProgress?: (done: number, total: number) => void }): Promise<{ drafted: number; failed: number; paused: boolean }>`
  - `resetStuck(): Promise<number>`: açılışta `processing` kalanları `pending` yapar
  - `retry(id: string): Promise<void>`

- [ ] **Step 1: Testler** (bağımlılıklar sahte):
  - 3 öğe sırayla işlenir, hepsi `draft` olur, `draft` alanı dolar, karelerle birlikte saklanır;
  - ikinci öğede `reason:"network"` → o öğe `failed`, üçüncü yine işlenir;
  - `reason:"auth"` veya `"credit"` → işlenen öğe ve kalanlar `paused`, fonksiyon `{paused:true}` döner;
  - `processing` durumunda bırakılmış öğe `resetStuck` sonrası `pending` olur ve işlenir;
  - aynı anda iki `processQueue` çağrısı aynı öğeyi iki kez işlemez (tek kilit);
  - API anahtarı yoksa hiçbir öğe işlenmez, `{paused:true}`.
- [ ] **Step 2:** FAIL. **Step 3:** Uygula. Öğeler tek tek işlenir, her durum değişikliği hemen DB'ye yazılır. Kareler bir kez çıkarılıp öğeye kaydedilir, böylece tekrar denemede yeniden çıkarılmaz. **Step 4:** PASS. **Step 5:** commit `feat: toplu işlem sırası`.

### Task 7: Ekranlar

**Files:** Create `src/ui/router.ts`, `src/ui/list.ts`, `src/ui/add.ts`, `src/ui/review.ts`, `src/ui/recipe.ts`, `src/ui/settings.ts`, `src/ui/style.css`; Modify `src/main.ts`; Test `src/ui/review.test.ts`, `src/ui/add.test.ts`

**Interfaces:**
- Consumes: Görev 2, 3, 5 ve 6'nın bütün dışa açık fonksiyonları
- Produces: hash rotaları `#/` (liste ve arama), `#/ekle`, `#/onay` (onay bekleyenler), `#/onay/:id`, `#/tarif/:id`, `#/ayarlar`

Ekranlar:
- **Liste:** üstte arama kutusu (yazdıkça sonuç), kapak küçük resmi, ad. "Onay bekleyen N tarif" bandı.
- **Ekle:** "Fotoğraf / video seç" (`<input type="file" accept="image/*,video/*" multiple>`), "Yazı yapıştır" kutusu, isteğe bağlı kaynak bağlantısı. Seçimden sonra "N öğe, tahmini maliyet ≈ $X" gösterilir, "Okumayı başlat" düğmesi gelir. Okuma sırasında ilerleme ve "Okuma sürerken uygulamayı açık tut" uyarısı.
- **Onay (tek taslak):** kareler yatay şerit; **Ad** alanı boş ve zorunlu; malzeme ve adım satırları düzenlenebilir, satır eklenip silinebilir; `uncertain` satırlar sarı ve "emin değilim" etiketli; çeviri varsa "Türkçe / Asıl" sekmesi; not alanı. Düğmeler: "Kaydet" (ad boşsa pasif, ayrıca malzeme ve adım ikisi de boşsa pasif), "Sil".
- **Tarif:** görüntüleme, "Düzenle" (onay ekranının aynısı), "Sil" (onay sorar).
- **Ayarlar:** API anahtarı (gizli alan), model seçimi (Opus 5.5 / Haiku 5.5, yanında tarif başına tahmini maliyet), "Yedeği indir" / "Yedekten yükle", son yedek tarihi. 7 günden eski yedekte listede hatırlatma bandı.

- [ ] **Step 1: Testler** (jsdom):
  - Onay ekranında ad boşken Kaydet pasif, ad yazılınca aktif;
  - malzeme ve adım ikisi de boşken ad yazılsa da pasif, bir satır eklenince aktif ("tarif bulunamadı" metni görünür);
  - Kaydet → `recipes` içinde 1 kayıt, kuyruktan silinir;
  - Ekle ekranında 2 dosya seçilince maliyet satırı `estimateCostUsd` sonucunu gösterir.
- [ ] **Step 2:** FAIL. **Step 3:** Uygula. Mobil öncelikli, 16 px kenar boşluğu, büyük dokunma alanları (≥44 px). Açılışta `resetStuck()` çalışır. **Step 4:** PASS, `npm run build` hatasız. **Step 5:** commit `feat: ekranlar`.

### Task 8: Çevrimdışı açılma ve ana ekran

**Files:** Modify `vite.config.ts`; Create `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`; Modify `index.html`; Create `.github/workflows/pages.yml`; Test `src/pwa.test.ts`

- [ ] **Step 1: Test:** `npm run build` sonrası `dist/manifest.webmanifest` içinde `name: "Tarif Arşivi"`, `display: "standalone"`, `start_url: "/tarif-arsivi/"` var; `index.html` içinde `apple-mobile-web-app-capable` meta etiketi var.
- [ ] **Step 2:** FAIL. **Step 3:** vite-plugin-pwa `registerType: "autoUpdate"`, uygulama dosyaları önbellekte. Claude API çağrıları önbelleğe **alınmaz**. Basit bir tencere simgesi. GitHub Actions: `main`'e push → build → Pages'e yayın. **Step 4:** PASS. **Step 5:** commit `feat: pwa ve yayın akışı`.

### Task 9: Yayın (Cano ile birlikte)

- [ ] **Step 1:** Cano GitHub hesabı açar (yoksa). Bunun için 10 yaşındaki bir çocuğa anlatır gibi adım adım bir rehber verilir. Şifre ve doğrulama kodunu Cano kendisi girer.
- [ ] **Step 2:** Cano bu bilgisayarda `gh auth login` yapar (rehberle).
- [ ] **Step 3:** `gh repo create tarif-arsivi --public --source . --push`; Settings → Pages → Source: GitHub Actions.
- [ ] **Step 4:** Doğrulama: `https://<kullanıcı>.github.io/tarif-arsivi/` açılıyor, ekranda "Tarif Arşivi" yazıyor.

### Task 10: Gerçek kayıtlarla ayar ve iPhone denemesi (Cano ile birlikte)

- [ ] **Step 1:** Cano API anahtarı alır (console.anthropic.com), **aylık harcama sınırı** koyar, anahtarı uygulamanın Ayarlar ekranına kendisi yapıştırır.
- [ ] **Step 2:** iPhone Safari → adres → Paylaş → "Ana Ekrana Ekle".
- [ ] **Step 3:** 3 gerçek ekran kaydı (biri İngilizce) + 2 tarif fotoğrafıyla dene. Her biri için şunlara bakılır: kare çıkarma çalıştı mı, eksik veya uydurma satır var mı, maliyet (`usage`) ne kadar. Sonuçlar `docs/deneme-sonuclari.md` dosyasına yazılır.
- [ ] **Step 4:** Altyazı kaçıyorsa `FRAME_INTERVAL_SEC` ve `MAX_FRAMES` ayarlanır. Haiku yeterliyse Cano'ya model değişikliği önerilir. Değişen değerler commit edilir.
- [ ] **Step 5:** Uçak modunda uygulama açılıyor ve kayıtlı tarifler görünüyor; yedek indirilip geri yüklenebiliyor.
