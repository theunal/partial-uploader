# partial-uploader

Parça parça (chunked) dosya yükleme kütüphanesi. Tarayıcıda `fetch` + `FormData` üzerine kuruludur; harici bağımlılığı yoktur.

**Öne çıkanlar:** ilerleme callback'i, iptal (`AbortSignal`), eşzamanlı yükleme, otomatik token yenileme, exponential backoff ile retry, kaldığı yerden devam (resume), istek zaman aşımı, cookie'li cross-origin yükleme, sunucu yanıtına erişim, çift ESM/CJS çıktı, tip desteği.

## Kurulum

```sh
npm install partial-uploader
```

## Hızlı başlangıç

```ts
import { uploadWithPartialFile } from 'partial-uploader';

const result = await uploadWithPartialFile('/upload', file, {
	headers: { Authorization: `Bearer ${token}` },
	chunkSize: 5 * 1024 * 1024, // 5 MB
	concurrency: 3,
	onProgress: ({ percent, loaded, total }) => {
		console.log(`%${percent} (${loaded}/${total})`);
	}
});

if (result.success) {
	console.log('Yüklendi, id:', result.data?.id);
} else {
	console.error(result.code, result.message, result.statusCode);
}
```

## API

```ts
uploadWithPartialFile(url, file, options?)
```

### `url: string`

Yükleme ucu. Token yenilemesi sırasında `onUnauthorized` farklı bir URL döndürebilir.

### `file: File | Blob`

Yüklenecek dosya. `size` ve `slice` metotlarına sahip herhangi bir Blob uygundur. `File` verirseniz `name` alanı sunucuya `filename` olarak gönderilir.

### `options: PartialUploadOptions`

| Alan                 | Varsayılan         | Açıklama                                                                              |
| -------------------- | ------------------ | ------------------------------------------------------------------------------------- |
| `headers`            | `{}`               | İstek başlıkları. `Content-Type` **yok sayılır** (bkz. [Content-Type](#content-type)) |
| `chunkSize`          | `26214400` (25 MB) | Parça boyutu (byte). Pozitif tam sayı olmalı                                          |
| `delay`              | `50`               | Parçalar arası bekleme (ms)                                                           |
| `concurrency`        | `1`                | Aynı anda yüklenecek parça sayısı. `>= 1` olmalı                                      |
| `retries`            | `3`                | Parça başına toplam deneme sayısı                                                     |
| `retryDelay`         | `delay`            | Yeniden deneme beklemesinin temel süresi (ms), kademeli olarak artar                  |
| `onUnauthorized`     | —                  | 401 alındığında çağrılır. `{ headers?, url? }` veya `null` döner                      |
| `onProgress`         | —                  | Her parça tamamlandığında çağrılır                                                    |
| `signal`             | —                  | `AbortController` sinyali                                                             |
| `maxRefreshAttempts` | `3`                | Tüm parçalar için toplam token yenileme sınırı                                        |
| `timeout`            | `0`                | Parça başına istek zaman aşımı (ms). `0` = sınırsız                                   |
| `credentials`        | `'same-origin'`    | `fetch` credentials modu: `'omit'` \| `'same-origin'` \| `'include'`                  |
| `parseResponse`      | —                  | Sunucu yanıtını dönüştürmek için çağrılır                                             |
| `fileGuid`           | —                  | Devam eden yüklemeyi bağlamak için mevcut id                                          |
| `skipChunks`         | —                  | Zaten yüklenmiş parçalar: `number[]`, `Set<number>` veya `(index) => boolean`         |

### Dönüş: `PartialUploadResponse`

```ts
{
	success: boolean;
	message: string;
	statusCode: number;
	data?: {
		id: string;                       // istemcide üretilen kimlik
		response?: UploadedChunkResponse; // isDone taşıyan son parçanın sunucu yanıtı
	};
	code?: UploadErrorCode; // yalnızca hatada
}
```

`UploadedChunkResponse` = `{ status, data?, headers?, parsed? }`.

- `data` — gövde JSON ise ayrıştırılmış, değilse ham metin
- `headers` — yanıt başlıkları (anahtarlar küçük harf)
- `parsed` — `parseResponse` verildiyse onun döndürdüğü değer

`code` değerleri: `INVALID_INPUT`, `NETWORK_ERROR`, `HTTP_ERROR`, `UNAUTHORIZED`, `TOKEN_REFRESH_FAILED`, `ABORTED`, `UPLOAD_FAILED`.

### Hata modeli

- **Geçersiz girdi** (boş `url`, `chunkSize: 0`, `concurrency: 0`, `file: null` vb.) → promise **reject** eder, `PartialUploadError` ile. `error.code === 'INVALID_INPUT'`.
- **Çalışma zamanı hataları** (ağ, 5xx, 401, iptal) → promise **resolve** olur ve `success: false` döner.

Bu ayrım bilinçlidir: yazım hatası sessizce yutulmamalı, ağ hatası ise mevcut `try/catch` kullanımınızı bozmamalı.

```ts
import { uploadWithPartialFile, PartialUploadError } from 'partial-uploader';

try {
	const result = await uploadWithPartialFile('/upload', file, { concurrency: 4 });
	if (!result.success) console.error(result.code, result.message);
} catch (e) {
	if (e instanceof PartialUploadError) console.error('Geçersiz kullanım:', e.message);
}
```

## Token yenileme

Sunucu `401` döndüğünde `onUnauthorized` çağrılır. Yeni header döndürürseniz aynı parça **harcanmadan** tekrar denenir:

```ts
await uploadWithPartialFile('/upload', file, {
	onUnauthorized: async () => {
		const { token } = await refreshToken();
		return { headers: { Authorization: `Bearer ${token}` } };
	}
});
```

`null` dönerseniz yükleme `UNAUTHORIZED` ile başarısız olur. Yenileme denemeleri `maxRefreshAttempts` ile sınırlıdır; sunucu sürekli 401 verirse sonsuz döngüye girilmez, `TOKEN_REFRESH_FAILED` döner.

`concurrency > 1` iken eşzamanlı 401'ler tek bir yenileme isteğinde birleştirilir; `onUnauthorized` her seferinde yeniden çağrılmaz.

## İlerleme ve iptal

```ts
const controller = new AbortController();
document.querySelector('button').onclick = () => controller.abort();

const result = await uploadWithPartialFile('/upload', file, {
	signal: controller.signal,
	onProgress: ({ percent, loaded, total, uploadedChunks, totalChunks }) => update(percent)
});

if (result.code === 'ABORTED') console.log('Kullanıcı iptal etti');
```

## Cookie'li (cross-origin) yükleme

`fetch` `credentials` modu header ile değiştirilemediği için ayrı bir seçenek olarak sunuluyor:

```ts
await uploadWithPartialFile('https://api.example.com/upload', file, { credentials: 'include' });
```

Sunucu tarafında `Access-Control-Allow-Credentials` ve `Access-Control-Allow-Origin` (yalnızca tam origin, `*` değil) açık olmalıdır.

## Zaman aşımı

```ts
// Her parça için en fazla 30 saniye
await uploadWithPartialFile('/upload', file, { timeout: 30_000 });
```

`timeout` ile kullanıcı `signal`'ı birleştirilir; ikisinden hangisi önce tetiklenirse yükleme durur. `0` (varsayılan) zaman aşımı uygulamaz.

## Sunucu yanıtına erişim

Son parça (`isDone` taşıyan) sunucunun yanıtı `data.response` içinde döner:

```ts
const result = await uploadWithPartialFile('/upload', file, {
	parseResponse: (res) => res.data?.location as string
});

console.log(result.data?.response?.status); // ör. 201
console.log(result.data?.response?.data); // JSON ise ayrıştırılmış, değilse ham metin
console.log(result.data?.response?.parsed); // parseResponse'ın döndürdüğü değer
```

`parseResponse` bir hata fırlatırsa yükleme **başarısız olmaz**; yalnızca `parsed` boş kalır.

> Son parça `skipChunks` ile atlanırsa `data.response` `undefined` olur — sunucuya finalize sinyali gitmediği için bir yanıt da yoktur.

## Kaldığı yerden devam

`fileGuid` ile mevcut bir yüklemeye bağlanır, `skipChunks` ile yüklenmiş parçalar atlanır:

```ts
// Sunucudan hangi parçaların yüklendiğini öğrendikten sonra
await uploadWithPartialFile('/upload', file, {
	fileGuid: savedId,
	skipChunks: [0, 1, 2]
});
```

Atlanan parçalar ilerleme hesabında yüklenmiş sayılır, bu yüzden yüzde doğru kalır. Son parça (`isDone` taşıyan) atlanırsa sunucuya finalize sinyali gitmez — bu bilinçlidir.

## Content-Type

Gövde `FormData` olduğu için `Content-Type` **elle verilmemelidir**; boundary bilgisi ancak tarayıcı/çalışma zamanı tarafından eklenebilir. Yanlışlıkla geçerseniz multipart gövde sunucuda ayrıştırılamaz.

Bu nedenle `headers` içindeki `Content-Type` (hangi yazımla olursa olsun) sessizce kaldırılır. `uploadWithPartialFile('/upload', file, { headers: { 'Content-Type': 'multipart/form-data' } })` çağrısı güvenlidir.

## Parça sırası

`isDone` alanı yalnızca son parçada `true` olur ve **son parça her zaman en son gönderilir** — `concurrency` ne olursa olsun. Böylece sunucu, diğer parçalar ulaşmadan dosyayı eksik halde finalize etmez.

## Sunucu kontratı

Her parça için `multipart/form-data` gövdesi:

| Alan          | Açıklama                                       |
| ------------- | ---------------------------------------------- |
| `file`        | Parça verisi, adı `${filename}_chunk_${index}` |
| `fileGuid`    | Yükleme kimliği (tüm parçalarda aynı)          |
| `index`       | Sıfırdan başlayan parça indeksi                |
| `totalChunks` | Toplam parça sayısı                            |
| `totalSize`   | Dosyanın toplam boyutu                         |
| `filename`    | Orijinal dosya adı                             |
| `isDone`      | Son parçada `"true"`                           |

## Eski imza (hâlâ destekleniyor)

0.0.8'deki pozisyonel imza geriye uyumlu olarak çalışır:

```ts
await uploadWithPartialFile('/upload', file, { Authorization: 'Bearer x' }, 5242880, 50, 3, onUnauthorized);
//                                              ^ headers                    ^chunkSize ^delay ^concurrency ^onUnauthorized
```

3. parametre düz bir header nesnesiyse header, bilinen bir option anahtarı içeriyorsa options olarak yorumlanır.

## Geliştirme

Geliştirme araçları modern Node gerektirir (**Node ≥ 22.12**): `vitest 5` daha eski sürümlerde çalışmıyor. Kütüphanenin **çalışma zamanı** ise `engines` gereksinimi olan Node 18'den itibaren her yerde çalışır — CI'da bunu ayrı bir smoke test job'ı doğruluyor.

```sh
npm install
npm run typecheck        # tsc (strict + noUncheckedIndexedAccess)
npm run format           # prettier --write
npm test                 # vitest
npm run test:coverage    # vitest + coverage
npm run build            # dist/esm + dist/cjs
npm run verify:package   # derle + paket yüklemesini doğrula
npm run ci               # hepsi
```

Tip güvenliği `tsconfig.json` ile sağlanır: `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch` açıktır.

> ESLint bilinçli olarak kullanılmıyor: `typescript-eslint` TypeScript 7'yi desteklemiyor ve tip-bazlı lint şu anda ancak TypeScript 5.x ile mümkün. Kullanılmak istenirse `typescript@5.9.x`'e sabitlenip `eslint` + `typescript-eslint` geri eklenmelidir.

## Sürüm geçişleri

Kırıcı değişiklikler için [CHANGELOG.md](./CHANGELOG.md)'e bakın.

## Lisans

MIT
