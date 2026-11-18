# Tarif Arşivi: tasarım

**Durum:** Cano onayladı (2026-11-18 21:4x). Benim verdiğim kararlar (yayın adresi, dil, bütçe, uygulama içinden ekleme) de onaylı.
**Kim yapacak:** orca'da bir lider Claude ve birkaç işçi Claude.

## Neden
Cano sağlıklı ve güzel yemek yapmayı seviyor. Instagram ve X'te gördüğü tarifleri kaydediyor, tarif fotoğrafları çekiyor. Ama bu kayıtlar dağınık kalıyor ve onlara hiç geri dönmüyor. Hedef: bütün tarifler tek yerde, düzenli ve aranabilir olsun.

## Hedefler
- Yalnız Cano kullanacak, iPhone'da çalışacak.
- **Ekleme:** fotoğraf (tarif yazısının fotoğrafı ya da ekran görüntüsü) veya video (çoğunlukla Instagram ve X reels'in ekran kaydı, altyazılı) eklenecek. Kaynak bağlantısı isteğe bağlı olarak yapıştırılabilecek.
- **Yemek adını Cano kendisi yazacak.**
- **Otomatik çıkarma:** Uygulama fotoğraftaki basılı yazıyı ya da videodaki altyazıyı okuyup tarif taslağı çıkaracak: malzemeler ve adımlar.
- **Onay:** Taslak önce Cano'ya gösterilecek. Cano düzeltip eksikleri elle ekleyebilecek, kaydetme onaydan sonra yapılacak. Kayıttan sonra da düzenlenebilecek.
- **Arama:** ada göre ve içeriğe göre (malzeme, adım, okunan ham yazı).
- **İlk arşivi toplu ekleme:** Başta birkaç yüz kayıt eklenecek, sonra haftada yaklaşık 5 tarif. Bir seferde çok sayıda fotoğraf ve video seçilebilecek. Hepsi sıraya girip tek tek okunacak, taslaklar "onay bekleyenler" kutusunda birikecek. Cano her birine sonra ad yazıp onaylayacak. Sıra yarıda kalırsa kaldığı yerden devam edecek.

## Hedef dışı
- El yazısı okuma.
- Instagram veya X'in "kaydedilenler" listesine erişim. Bu teknik olarak mümkün değil.
- Bağlantıdan videoyu otomatik indirme. Siteler buna engel oluyor ve kullanım kurallarına da aykırı.
- Seslendirmeyi (konuşmayı) yazıya çevirme. İlk sürümde yalnızca ekrandaki altyazı okunacak.
- Birden çok kullanıcı, paylaşım, App Store.

## Başarısızlık sayılır (çalışsa bile)
- Tarifin Cano'nun onayı olmadan kaydedilmesi.
- Videoda olmayan bir malzemenin ya da adımın taslağa uydurulup eklenmesi. Okunamayan kısım boş bırakılır ve işaretlenir.
- Tariflerin sessizce kaybolması (yedek yoksa).
- Bir tarif eklemenin karmaşık olması (ekran kaydından kayda kadar birkaç dokunuşu geçmemeli).

## Kısıtlar
- Cano yazılımcı değil, Windows kullanıyor, Mac'i yok.
- iPhone Safari, "Ana Ekrana Ekle" ile kurulan web uygulaması (PWA).
- Tarif okuma için Claude API kullanılacak. Cano bir API anahtarı alacak, anahtar yalnızca telefonda saklanacak, kodda veya sunucuda tutulmayacak. Kullanım ücretlidir, maliyet planda hesaplanacak.
- Uygulamanın bir internet adresinden (HTTPS) yayınlanması gerekiyor. GitHub CLI bu bilgisayarda kurulu ama oturum açık değil.

## Yaklaşımlar
1. **Ana ekrana eklenen web uygulaması + Claude API** (seçilen). iPhone'da Mac olmadan çalışır, orca ekibi baştan sona yapabilir. Bedeli: API anahtarı ve küçük bir kullanım ücreti, yayınlamak için bir adres.
2. **claude.ai'de özel sayfa.** API anahtarı gerekmez. Ama iPhone'da video yükleme ve Claude'a sorma özelliklerinin çalışıp çalışmadığı bilinmiyor, orca'nın rolü küçülür. Seçilmedi.
3. **Gerçek iPhone uygulaması.** Mac ve ücretli Apple geliştirici hesabı ister. Elenmiş.

Cano 2026-11-18'de 1. yolu seçti.

## Cano'nun kararları
- iPhone; yalnızca kendisi kullanacak.
- Yemek adını kendisi yazacak.
- Tarif videolardaki altyazıdan çıkarılacak. Tarif yazısı varsa onun fotoğrafı da eklenebilecek.
- El yazısı okunmayacak.
- Kaydetmeden önce onay istenecek, eksikler elle eklenebilecek.
- 1. yol seçildi.

## Benim kararlarım (Cano düzeltebilir)
- **Veri telefonda** (tarayıcının kendi deposunda) saklanır. Sunucu ve hesap yok.
- **Yedek:** tek dokunuşla bütün arşiv tek bir dosyaya indirilip geri yüklenebilir. iPhone bazen web uygulamalarının verisini silebiliyor, o yüzden bu zorunlu.
- **Videonun kendisi saklanmaz,** çünkü çok yer kaplar. Videodan bir kapak karesi ve tarifin çıkarıldığı birkaç kare küçültülüp saklanır. Fotoğraflar da küçültülerek saklanır.
- **Videodan kare alma:** video telefonda açılır, belli aralıklarla kareler alınır, aynı görünen kareler elenir, kalanlar Claude'a gönderilir. Claude okuduğu yazıdan tarif taslağını hazırlar. Aralık ve kare sınırı planda belirlenecek.
- **Taslak alanları:** yemek adı (Cano), malzemeler (liste), adımlar (sıralı liste), kaynak bağlantısı (isteğe bağlı), not, okunan ham yazı (arama için). Okunamayan yerler "emin değilim" diye işaretlenir.
- **Arama:** Türkçe karakter duyarsız (ı/i, ş/s, ç/c, ğ/g, ö/o, ü/u), büyük ve küçük harf duyarsız. Ad, malzeme, adım, not ve ham yazıda arar.
- **Dil:** arayüz Türkçe.
- **Ekleme uygulamanın içinden başlar.** iPhone'da ana ekrana eklenen web uygulamaları Instagram'ın veya X'in "Paylaş" menüsünde görünmez. Akış şöyle: uygulamayı aç, Ekle'ye bas, Fotoğraflar'dan kaydı seç, okunmasını bekle, onayla. Okuma sırasında uygulama açık kalmalı (iPhone arka plandaki web uygulamasını durdurur). Okuma yarıda kalırsa kayıt kaybolmaz, "tekrar dene" çıkar.
- **Kaynak türleri:** Ana yol videodaki altyazıdır, çünkü tarif çoğu zaman gönderi açıklamasında olmuyor. Açıklamada tarif varsa onun ekran görüntüsü eklenir, metin kopyalandıysa yapıştırma kutusu kullanılır.
- **Dil:** Kaynak Türkçe değilse asıl metin aynen saklanır, yanına Türkçe çevirisi eklenir. Arama her ikisinde yapılır. Çeviri onay ekranında kontrol edilir.
- **Yayın adresi:** GitHub Pages (ücretsiz). Cano bir GitHub hesabı açacak, kod herkese açık olacak. Tarifler ve API anahtarı kodda değil, telefonda durur. Adres ilk tariften önce sabitlenmeli, çünkü veri o adrese bağlı. Adres sonradan değişirse yedekten geri yüklemek gerekir.
- **Bütçe:** Cano rakam vermedi. Ucuz bir model ve az kare ile başlanacak, gerekirse büyütülecek. Planda tarif başına maliyet hesaplanacak, toplu ekleme öncesinde de tahmini toplam maliyet gösterilecek. Cano API anahtarını alırken Anthropic panelinde aylık harcama sınırı koyacak.

## Açık sorular
- Instagram'ın "bilgilerini indir" dosyası kaydedilenlerin listesini veriyor mu? Videoları vermediği neredeyse kesin. Doğrulanmadı, planda bakılacak.
- Tek bir uzun ekran kaydında birden çok tarif olursa uygulama bunları ayırabilir mi? İlk sürümde değil, denemeye değer.

## Yapıcıya bırakılanlar
Ekran düzeni, kod yapısı, kullanılacak kütüphaneler (ücretsiz ve güvenli olanlar, MIT veya Apache-2.0 lisanslı), testler.
