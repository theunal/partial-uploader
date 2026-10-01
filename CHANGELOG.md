# Changelog

Bu dosya [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) biçimini izler ve sürümler [SemVer](https://semver.org/lang/tr/) ile numaralandırılır.

## [0.1.0] — 2026-10-02

Kritik hata düzeltmeleri, doğrulama, yeni seçenekler ve proje altyapısı.

### Düzeltilen hatalar

- **`concurrency: 0` sahte başarı döndürüyordu.** Worker sayısı 0 olduğu için hiçbir parça yüklenmeden `success: true` dönüyordu. Artık doğrulama hatası olarak reddediliyor.
- **`chunkSize: 0` `RangeError` fırlatıyordu.** `Math.ceil(totalSize / 0)` → `Infinity` → `Array.from({ length: Infinity })` patlıyordu ve bu `try` bloğunun dışında olduğu için çağıranın `catch`'ine sızıyordu. Artık kontrollü `PartialUploadError`.
- **401 token yenileme döngüsü sonsuzdu.** `retry--` retry sayacını geri alıyordu; sunucu sürekli 401 verip yenileme her seferinde "başarılı" dönse yükleme asılı kalıyordu. Yenileme denemeleri artık `maxRefreshAttempts` ile sınırlı, aşılınca `TOKEN_REFRESH_FAILED` dönüyor.
- **Kullanıcı `Content-Type` gönderirse multipart gövde bozuluyordu.** `headers` içindeki `Content-Type` sessizce kaldırılıyor; boundary korunuyor.
- **`isDone` erken gidebiliyordu.** `concurrency > 1` iken son parça diğerlerinden önce tamamlanırsa sunucu eksik dosyayı finalize ediyordu. `isDone` taşıyan son parça artık **her zaman en son** gönderiliyor.
- **Hata durumunda yanlış `statusCode` dönüyordu.** Tüm worker'lar arasında paylaşılan `lastStatusCode` hangi parçanın düştüğünü göstermiyordu; hata olmasa bile `200` dönüyordu. Artık başarısız parçanın gerçek durum kodu (veya yanıt yoksa `0`) dönüyor, başarıda son parçanın gerçek kodu dönüyor.
- **Başarısız yüklemelerde `data.id` dönüyordu.** Artık dönmüyor.
- **Sunucu hata gövdesi kayboluyordu.** `res.text()` hiç okunmuyordu; artık mesaja ekleniyor.
- **HTTP hatalarında retry beklemeden yapılıyordu.** Artık exponential backoff uygulanıyor.
- **`Math.random()` ile üretilen id** yerine `crypto.randomUUID()` kullanılıyor.
- **Kuyruk `Array.shift()` ile boşaltılıyordu** (O(n) → O(n²)); sıra sayacına çevrildi.
- **Yükleme başlamadan önce keyfi `delay` uygulanıyordu.** `delay` artık yalnızca parçalar arasında.

### Eklenenler

- **Girdi doğrulaması.** `url`, `file`, `chunkSize`, `concurrency`, `retries`, `delay`, `retryDelay`, `timeout`, `credentials`, `parseResponse` doğrulanıyor. Geçersiz girdi `PartialUploadError` (`code: 'INVALID_INPUT'`) ile reddediliyor.
- **`onProgress`** — `loaded`, `total`, `percent`, `uploadedChunks`, `totalChunks`, `lastChunk`.
- **`signal`** — `AbortController` ile iptal.
- **Resume** — `fileGuid` ile mevcut yüklemeye bağlanma, `skipChunks` ile atlanan parçalar.
- **`credentials`** — cross-origin cookie'li yükleme için `fetch` credentials modu.
- **`timeout`** — `AbortSignal.timeout` ile parça başına istek zaman aşımı (`AbortSignal.any` yoksa elle birleştirme).
- **`parseResponse`** — sunucu yanıtını dönüştürme.
- **`data.response`** — `isDone` taşıyan son parçanın sunucu yanıtı (`status`, `data`, `headers`); gövde JSON değilse ham metin.
- **`code` alanı** — `INVALID_INPUT`, `NETWORK_ERROR`, `HTTP_ERROR`, `UNAUTHORIZED`, `TOKEN_REFRESH_FAILED`, `ABORTED`, `UPLOAD_FAILED`.
- **Token yenileme mutex'ı** — eşzamanlı worker'lar aynı anda birden fazla yenileme isteği atmıyor.

### Altyapı

- `strict` + `noUncheckedIndexedAccess` etkin; `any` sızıntıları giderildi.
- Build artık `tsconfig.json`'u gerçekten kullanıyor (önceki `tsc src/index.ts` komut satırı dosya verdiği için tsconfig'i tamamen yok sayıyordu).
- Çift çıktı: `dist/esm` + `dist/cjs`, `exports` haritası ve modül türü işaretleriyle.
- ESLint 9 (type-aware) + Prettier.
- GitHub Actions CI (Node 18/20/22) — typecheck, lint, format, test, build, paket doğrulaması.
- `dist/` artık sürüm kontrolünde değil; `src/` paketleniyor (sourcemap'ların çözülebilmesi için).
- `publish.txt` yerine `npm run ci` ve `prepublishOnly`.
- README yeniden yazıldı: yanlış `isSuccess` alan adı ve yanlış `catch` kullanımı giderildi.

### Kırıcı değişiklikler

1. Geçersiz girdiler artık `success: false` yerine **promise reject** ediyor.
2. Başarısız yüklemelerde `result.data` artık `undefined`.
3. Başarıda `statusCode` sabit `200` yerine son parçanın gerçek HTTP durum kodu (yine de `data.response.status` ile son parça bilgisi verilir).
4. `delay` seçeneği yükleme başında bekleme yapmıyor, yalnızca parçalar arasında.
5. Son parça ayrı faza alındığı için büyük dosyalarda en sonda yüklenir.
6. Yanıt başlıkları `data.response.headers` içinde **küçük harfle** döner.

## [0.0.8]

Önceki sürüm. Pozisyonel imza (`url, file, headers, chunkSize, delay, concurrency, onUnauthorized`) hâlâ destekleniyor.

[0.1.0]: https://github.com/theunal/partial-uploader/compare/v0.0.8...v0.1.0
[0.0.8]: https://github.com/theunal/partial-uploader/releases/tag/v0.0.8
