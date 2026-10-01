import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { uploadWithPartialFile, PartialUploadError } from './index';

// @vitest-environment happy-dom

const mockUrl = 'https://api.example.com/upload';

const ok = (status = 200) => ({ ok: true, status, text: async () => '' });
const fail = (status: number, body = '') => ({
	ok: false,
	status,
	text: async () => body
});

/** FormData gövdesinden gönderilen 'index' alanını sırayla çıkarır. */
const sentIndexes = () =>
	(vi.mocked(fetch).mock.calls as any[]).map((call) => (call[1]?.body as FormData).get('index') as string);

/** FormData gövdesinden 'isDone' alanlarını sırayla çıkarır. */
const sentIsDone = () =>
	(vi.mocked(fetch).mock.calls as any[]).map((call) => (call[1]?.body as FormData).get('isDone') as string);

/** `noUncheckedIndexedAccess` altında mock.calls erişimini kısaltır. */
const initAt = (i: number) => vi.mocked(fetch).mock.calls[i]![1] as RequestInit;
const urlAt = (i: number) => vi.mocked(fetch).mock.calls[i]![0] as string;

const smallFile = () => new File(['hello world'], 'test.txt', { type: 'text/plain' });
const manyChunksFile = () => new File(['a'.repeat(100)], 'big.txt');

describe('uploadWithPartialFile', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	describe('geçersiz girdi (reject)', () => {
		it.each([
			['chunkSize = 0', { chunkSize: 0 }],
			['chunkSize negatif', { chunkSize: -1 }],
			['chunkSize ondalık', { chunkSize: 1.5 }],
			['chunkSize NaN', { chunkSize: Number.NaN }],
			['concurrency = 0', { concurrency: 0 }],
			['concurrency negatif', { concurrency: -1 }],
			['retries = 0', { retries: 0 }],
			['delay negatif', { delay: -1 }],
			['onProgress fonksiyon değil', { onProgress: 'no' as any }],
			['onUnauthorized fonksiyon değil', { onUnauthorized: 42 as any }]
		])('%s reddedilir', async (_label, options) => {
			await expect(uploadWithPartialFile(mockUrl, smallFile(), options as any)).rejects.toThrow(
				PartialUploadError
			);
			await expect(uploadWithPartialFile(mockUrl, smallFile(), options as any)).rejects.toMatchObject({
				code: 'INVALID_INPUT'
			});
			expect(fetch).not.toHaveBeenCalled();
		});

		it('url boşsa reddedilir', async () => {
			await expect(uploadWithPartialFile('', smallFile())).rejects.toMatchObject({ code: 'INVALID_INPUT' });
			await expect(uploadWithPartialFile(undefined as any, smallFile())).rejects.toMatchObject({
				code: 'INVALID_INPUT'
			});
		});

		it('file null/geçersizse reddedilir', async () => {
			await expect(uploadWithPartialFile(mockUrl, null as any)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
			await expect(uploadWithPartialFile(mockUrl, {} as any)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
		});

		it('chunkSize = 0 artık RangeError değil kontrollü hata verir', async () => {
			const promise = uploadWithPartialFile(mockUrl, smallFile(), { chunkSize: 0 });
			await expect(promise).rejects.not.toThrow(RangeError);
			await expect(promise).rejects.toThrow('chunkSize must be >= 1, received: 0');
		});

		it('concurrency = 0 artık sahte başarı döndürmez', async () => {
			const promise = uploadWithPartialFile(mockUrl, manyChunksFile(), { concurrency: 0 });
			await expect(promise).rejects.toThrow('concurrency must be >= 1, received: 0');
			expect(fetch).not.toHaveBeenCalled();
		});
	});

	describe('başarılı yükleme', () => {
		it('küçük dosyayı tek parça yükler', async () => {
			(fetch as any).mockResolvedValue(ok());

			const result = await uploadWithPartialFile(mockUrl, smallFile(), { chunkSize: 1024 });

			expect(result.success).toBe(true);
			expect(result.statusCode).toBe(200);
			expect(result.data?.id).toBeDefined();
			expect(result.code).toBeUndefined();
			expect(fetch).toHaveBeenCalledTimes(1);

			const body = initAt(0).body as FormData;
			expect(body.get('isDone')).toBe('true');
			expect(body.get('totalChunks')).toBe('1');
			expect(body.get('totalSize')).toBe('11');
		});

		it('büyük dosyayı çok parça yükler', async () => {
			(fetch as any).mockResolvedValue(ok());

			const result = await uploadWithPartialFile(mockUrl, manyChunksFile(), { chunkSize: 5, concurrency: 1 });

			expect(result.success).toBe(true);
			expect(fetch).toHaveBeenCalledTimes(20);
		});

		it('eşzamanlılık doğru çalışır', async () => {
			(fetch as any).mockResolvedValue(ok());

			// 100 byte, 10 byte parça -> 10 parça, concurrency 5
			const result = await uploadWithPartialFile(mockUrl, manyChunksFile(), { chunkSize: 10, concurrency: 5 });

			expect(result.success).toBe(true);
			expect(fetch).toHaveBeenCalledTimes(10);
		});

		it('sonucu id yerine crypto tabanlı benzersiz id üretir', async () => {
			(fetch as any).mockResolvedValue(ok());

			const ids = await Promise.all([
				uploadWithPartialFile(mockUrl, smallFile()),
				uploadWithPartialFile(mockUrl, smallFile())
			]);

			expect(ids[0].data?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
			expect(ids[0].data?.id).not.toBe(ids[1].data?.id);
		});
	});

	describe('eski pozisyonel imza (geriye uyum)', () => {
		it('7 parametreli eski imza çalışmaya devam eder', async () => {
			(fetch as any).mockResolvedValueOnce({ ok: false, status: 401 }).mockResolvedValue(ok());

			const onUnauthorized = vi.fn().mockResolvedValue({ headers: { Authorization: 'Bearer new' } });

			// (url, file, headers, chunkSize, delay, concurrency, onUnauthorized)
			const result = await uploadWithPartialFile(
				mockUrl,
				smallFile(),
				{ Authorization: 'Bearer old' },
				1024,
				0,
				1,
				onUnauthorized
			);

			expect(result.success).toBe(true);
			expect(onUnauthorized).toHaveBeenCalled();
			expect(fetch).toHaveBeenCalledTimes(2);
			expect((initAt(1).headers as any).Authorization).toBe('Bearer new');
		});

		it('eski imzada varsayılanlar korunur (25MB parça)', async () => {
			(fetch as any).mockResolvedValue(ok());

			const result = await uploadWithPartialFile(mockUrl, smallFile(), { Authorization: 'x' });

			expect(result.success).toBe(true);
			expect((initAt(0).body as FormData).get('totalChunks')).toBe('1');
		});

		it('header nesnesi options olarak yanlış yorumlanmaz', async () => {
			(fetch as any).mockResolvedValue(ok());

			const result = await uploadWithPartialFile(mockUrl, smallFile(), { 'X-Trace-Id': 'abc', delay: 999 });

			expect(result.success).toBe(true);
			// 'delay' option anahtarı olduğu için options olarak yorumlanır ve 'X-Trace-Id' header olmaktan çıkar
			const headers = initAt(0).headers as any;
			expect(headers['X-Trace-Id']).toBeUndefined();
		});

		it('her option anahtarı options nesnesi olarak tanınır', async () => {
			// OPTION_KEYS'e eklenmeyen bir anahtar sessizce header sanılır ve
			// seçeneği sessizce yok sayar. Bu liste yeni alan eklendiğinde güncellenmeli.
			const optionKeys = [
				'headers',
				'chunkSize',
				'delay',
				'concurrency',
				'retries',
				'retryDelay',
				'onUnauthorized',
				'onProgress',
				'signal',
				'fileGuid',
				'skipChunks',
				'maxRefreshAttempts',
				'timeout',
				'credentials',
				'parseResponse'
			];

			const values: Record<string, unknown> = {
				headers: {},
				chunkSize: 1024,
				delay: 0,
				concurrency: 1,
				retries: 1,
				retryDelay: 0,
				fileGuid: 'fixed-guid',
				skipChunks: [],
				maxRefreshAttempts: 1,
				timeout: 0,
				credentials: 'omit'
			};

			for (const key of optionKeys) {
				(fetch as any).mockClear();
				(fetch as any).mockResolvedValue(ok());

				const payload =
					values[key] !== undefined
						? { [key]: values[key] }
						: {
								[key]:
									key === 'onUnauthorized'
										? () => null
										: key === 'onProgress'
											? () => {}
											: key === 'signal'
												? new AbortController().signal
												: key === 'parseResponse'
													? () => undefined
													: undefined
							};

				const result = await uploadWithPartialFile(mockUrl, smallFile(), payload);

				// Seçenek header'a kaydıysa doğrulama reddedecek ya da gönderilen
				// header'larda görünecek; ikisi de hatadır.
				expect(result.success, `'${key}' options olarak tanınmadı`).toBe(true);

				const sentHeaders = initAt(0).headers as Record<string, string>;
				expect(Object.keys(sentHeaders), `'${key}' header olarak gönderildi`).toHaveLength(0);
			}
		});
	});

	describe('Content-Type güvenliği', () => {
		it('kullanıcı Content-Type gönderirse header kaldırılır (boundary korunur)', async () => {
			(fetch as any).mockResolvedValue(ok());

			await uploadWithPartialFile(mockUrl, smallFile(), {
				headers: { 'Content-Type': 'multipart/form-data', Authorization: 'Bearer x' }
			});

			const headers = initAt(0).headers as any;
			expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('content-type');
			expect(headers.Authorization).toBe('Bearer x');
		});

		it('Content-Type farklı yazımla gelirse de kaldırılır', async () => {
			(fetch as any).mockResolvedValue(ok());

			await uploadWithPartialFile(mockUrl, smallFile(), { headers: { 'content-TYPE': 'multipart/form-data' } });

			expect((initAt(0).headers as any)['content-TYPE']).toBeUndefined();
		});
	});

	describe('401 / token yenileme', () => {
		it('token yeniler ve aynı parçayı tekrar dener', async () => {
			(fetch as any).mockResolvedValueOnce(fail(401)).mockResolvedValue(ok());
			const onUnauthorized = vi.fn().mockResolvedValue({ headers: { Authorization: 'Bearer new' } });

			const result = await uploadWithPartialFile(mockUrl, smallFile(), { onUnauthorized });

			expect(result.success).toBe(true);
			expect(onUnauthorized).toHaveBeenCalledTimes(1);
			expect(fetch).toHaveBeenCalledTimes(2);
		});

		it('onUnauthorized null dönerse kontrollü şekilde başarısız olur', async () => {
			(fetch as any).mockResolvedValue(fail(401));
			const onUnauthorized = vi.fn().mockResolvedValue(null);

			const result = await uploadWithPartialFile(mockUrl, smallFile(), { onUnauthorized });

			expect(result.success).toBe(false);
			expect(result.code).toBe('UNAUTHORIZED');
			expect(result.statusCode).toBe(401);
			expect(fetch).toHaveBeenCalledTimes(1); // boşuna 3 kez denemiyor
		});

		it('onUnauthorized yoksa UNAUTHORIZED döner', async () => {
			(fetch as any).mockResolvedValue(fail(401));

			const result = await uploadWithPartialFile(mockUrl, smallFile(), { retries: 1 });

			expect(result.success).toBe(false);
			expect(result.code).toBe('HTTP_ERROR');
			expect(result.statusCode).toBe(401);
		});

		it('sunucu hep 401 dönse ve yenileme hep "başarılı" olsa bile sonsuz döngüye girmez', async () => {
			(fetch as any).mockResolvedValue(fail(401));
			const onUnauthorized = vi.fn().mockResolvedValue({ headers: { Authorization: 'Bearer new' } });

			const result = await uploadWithPartialFile(mockUrl, smallFile(), {
				onUnauthorized,
				maxRefreshAttempts: 3
			});

			expect(result.success).toBe(false);
			expect(result.code).toBe('TOKEN_REFRESH_FAILED');
			// 1 ilk deneme + 3 yenileme sonrası deneme
			expect(onUnauthorized).toHaveBeenCalledTimes(3);
			expect(fetch).toHaveBeenCalledTimes(4);
		});

		it('onUnauthorized hata fırlatırsa yüklemeyi bozmaz', async () => {
			(fetch as any).mockResolvedValue(fail(401));
			const onUnauthorized = vi.fn().mockRejectedValue(new Error('refresh exploded'));

			const result = await uploadWithPartialFile(mockUrl, smallFile(), { onUnauthorized });

			expect(result.success).toBe(false);
			expect(result.code).toBe('TOKEN_REFRESH_FAILED');
			expect(result.message).toContain('refresh exploded');
		});

		it('refresh sonrası url değiştirilebilir', async () => {
			(fetch as any).mockResolvedValueOnce(fail(401)).mockResolvedValue(ok());
			const onUnauthorized = vi.fn().mockResolvedValue({ url: 'https://cdn.example.com/upload' });

			const result = await uploadWithPartialFile(mockUrl, smallFile(), { onUnauthorized });

			expect(result.success).toBe(true);
			expect(urlAt(1)).toBe('https://cdn.example.com/upload');
		});
	});

	describe('son parça her zaman en son', () => {
		it('concurrency > 1 olsa da isDone taşıyan parça en son gönderilir', async () => {
			(fetch as any).mockResolvedValue(ok());

			// 100 byte / 10 byte = 10 parça, concurrency 5
			await uploadWithPartialFile(mockUrl, manyChunksFile(), { chunkSize: 10, concurrency: 5 });

			const doneFlags = sentIsDone();
			// isDone yalnızca son parçada true olmalı
			expect(doneFlags.filter((d) => d === 'true')).toHaveLength(1);
			expect(doneFlags[doneFlags.length - 1]).toBe('true');

			// son gönderilen index 9 (son parça) olmalı
			expect(sentIndexes()[sentIndexes().length - 1]).toBe('9');
		});

		it('tek parçalı dosyada isDone tek seferde true', async () => {
			(fetch as any).mockResolvedValue(ok());

			await uploadWithPartialFile(mockUrl, smallFile(), { chunkSize: 1024, concurrency: 4 });

			expect(sentIsDone()).toEqual(['true']);
		});

		it('ara parça başarısız olursa son parça hiç gönderilmez', async () => {
			(fetch as any).mockImplementation((_url: any, init: any) => {
				const index = (init.body as FormData).get('index');
				return index === '1' ? Promise.resolve(fail(500)) : Promise.resolve(ok());
			});

			const result = await uploadWithPartialFile(mockUrl, manyChunksFile(), {
				chunkSize: 10,
				concurrency: 1,
				retries: 1
			});

			expect(result.success).toBe(false);
			expect(sentIndexes()).not.toContain('9');
		});
	});

	describe('hata yönetimi', () => {
		it('ağ hatasında retry eder ve başarılı olur', async () => {
			(fetch as any).mockRejectedValueOnce(new Error('Network error')).mockResolvedValue(ok());

			const result = await uploadWithPartialFile(mockUrl, smallFile(), { retryDelay: 0 });

			expect(result.success).toBe(true);
			expect(fetch).toHaveBeenCalledTimes(2);
		});

		it('maksimum retry sonrası NETWORK_ERROR döner', async () => {
			(fetch as any).mockRejectedValue(new Error('Persistent error'));

			const result = await uploadWithPartialFile(mockUrl, smallFile(), { retryDelay: 0 });

			expect(result.success).toBe(false);
			expect(result.code).toBe('NETWORK_ERROR');
			expect(result.message).toBe('Persistent error');
			expect(result.statusCode).toBe(0); // hiç yanıt alınmadı
			expect(fetch).toHaveBeenCalledTimes(3);
		});

		it('sunucu hata gövdesini mesaja ekler', async () => {
			(fetch as any).mockResolvedValue(fail(500, 'disk full'));

			const result = await uploadWithPartialFile(mockUrl, smallFile(), { retryDelay: 0 });

			expect(result.success).toBe(false);
			expect(result.code).toBe('HTTP_ERROR');
			expect(result.message).toBe('Server error: 500: disk full');
			expect(result.statusCode).toBe(500);
		});

		it('hata durumunda data dönmez', async () => {
			(fetch as any).mockResolvedValue(fail(500));

			const result = await uploadWithPartialFile(mockUrl, smallFile(), { retryDelay: 0 });

			expect(result.success).toBe(false);
			expect(result.data).toBeUndefined();
		});

		it('başarısız parçanın gerçek status kodunu döner', async () => {
			(fetch as any).mockResolvedValue(fail(507));

			const result = await uploadWithPartialFile(mockUrl, smallFile(), { retryDelay: 0 });

			expect(result.statusCode).toBe(507);
		});

		it('500 hatasında backoff uygular', async () => {
			vi.useFakeTimers();
			(fetch as any).mockResolvedValue(fail(500));

			const promise = uploadWithPartialFile(mockUrl, smallFile(), { retries: 3, retryDelay: 100 });

			await vi.runAllTimersAsync();
			const result = await promise;

			expect(result.success).toBe(false);
			expect(fetch).toHaveBeenCalledTimes(3);
			expect(vi.getTimerCount()).toBe(0); // bekleyen timer kalmadı
		});

		it('500 hatasında hemen değil, gecikmeli tekrar dener', async () => {
			vi.useFakeTimers();
			(fetch as any).mockResolvedValue(fail(500));

			const promise = uploadWithPartialFile(mockUrl, smallFile(), { retries: 2, retryDelay: 1000 });

			await vi.advanceTimersByTimeAsync(0);
			expect(fetch).toHaveBeenCalledTimes(1);
			await vi.runAllTimersAsync();
			await promise;
			expect(fetch).toHaveBeenCalledTimes(2);
		});

		it('text() desteklemeyen yanıtlarda çökmeyez', async () => {
			(fetch as any).mockResolvedValue({ ok: false, status: 500 });

			const result = await uploadWithPartialFile(mockUrl, smallFile(), { retryDelay: 0 });

			expect(result.code).toBe('HTTP_ERROR');
			expect(result.message).toBe('Server error: 500');
		});
	});

	describe('ilerleme (onProgress)', () => {
		it("0'dan 100'e monoton artar", async () => {
			(fetch as any).mockResolvedValue(ok());
			const onProgress = vi.fn();

			await uploadWithPartialFile(mockUrl, manyChunksFile(), { chunkSize: 25, concurrency: 1, onProgress });

			expect(onProgress).toHaveBeenCalledTimes(4);

			const reports = onProgress.mock.calls.map((c) => c[0]);
			expect(reports.map((r) => r.percent)).toEqual([25, 50, 75, 100]);

			const percents = reports.map((r) => r.percent);
			expect([...percents].sort((a, b) => a - b)).toEqual(percents);
			expect(reports.at(-1)?.loaded).toBe(100);
			expect(reports.at(-1)?.total).toBe(100);
			expect(reports.at(-1)?.uploadedChunks).toBe(4);
			expect(reports.at(-1)?.totalChunks).toBe(4);
		});

		it('onProgress hata fırlatırsa yükleme bozulmaz', async () => {
			(fetch as any).mockResolvedValue(ok());
			const onProgress = vi.fn(() => {
				throw new Error('UI hatası');
			});

			const result = await uploadWithPartialFile(mockUrl, smallFile(), { onProgress });

			expect(result.success).toBe(true);
		});
	});

	describe('iptal (AbortSignal)', () => {
		it('zaten abort edilmiş sinyalde hiç fetch yapmaz', async () => {
			const controller = new AbortController();
			controller.abort();

			const result = await uploadWithPartialFile(mockUrl, smallFile(), { signal: controller.signal });

			expect(result.success).toBe(false);
			expect(result.code).toBe('ABORTED');
			expect(fetch).not.toHaveBeenCalled();
		});

		it('yükleme sırasında abort edilirse ABORTED döner', async () => {
			const controller = new AbortController();
			(fetch as any).mockImplementation(async () => {
				controller.abort();
				return ok();
			});

			const result = await uploadWithPartialFile(mockUrl, manyChunksFile(), {
				chunkSize: 25,
				concurrency: 1,
				signal: controller.signal
			});

			expect(result.success).toBe(false);
			expect(result.code).toBe('ABORTED');
			expect(fetch).toHaveBeenCalledTimes(1);
		});

		it("sinyal fetch'e geçirilir", async () => {
			(fetch as any).mockResolvedValue(ok());
			const controller = new AbortController();

			await uploadWithPartialFile(mockUrl, smallFile(), { signal: controller.signal });

			expect(initAt(0).signal).toBe(controller.signal);
		});
	});

	describe('devam eden yükleme (resume)', () => {
		it('fileGuid verilirse mevcut id kullanılır', async () => {
			(fetch as any).mockResolvedValue(ok());

			const result = await uploadWithPartialFile(mockUrl, smallFile(), { fileGuid: 'mevcut-id' });

			expect(result.data?.id).toBe('mevcut-id');
			expect((initAt(0).body as FormData).get('fileGuid')).toBe('mevcut-id');
		});

		it('skipChunks ile zaten yüklenmiş parçalar atlanır', async () => {
			(fetch as any).mockResolvedValue(ok());

			const result = await uploadWithPartialFile(mockUrl, manyChunksFile(), {
				chunkSize: 10,
				concurrency: 1,
				skipChunks: [0, 1, 2]
			});

			expect(result.success).toBe(true);
			expect(sentIndexes()).toEqual(['3', '4', '5', '6', '7', '8', '9']);
		});

		it('skipChunks fonksiyon olarak verilebilir', async () => {
			(fetch as any).mockResolvedValue(ok());

			await uploadWithPartialFile(mockUrl, manyChunksFile(), {
				chunkSize: 25,
				skipChunks: (index) => index % 2 === 0
			});

			expect(sentIndexes().sort()).toEqual(['1', '3']);
		});

		it('atlanan parçalar ilerlemede yüklenmiş sayılır', async () => {
			(fetch as any).mockResolvedValue(ok());
			const onProgress = vi.fn();

			await uploadWithPartialFile(mockUrl, manyChunksFile(), {
				chunkSize: 50,
				concurrency: 1,
				skipChunks: [0],
				onProgress
			});

			expect(onProgress.mock.calls[0]![0].loaded).toBe(50);
			expect(onProgress.mock.calls.at(-1)![0].percent).toBe(100);
		});

		it('son parça atlanırsa isDone hiç gönderilmez (sunucu finalize etmez)', async () => {
			(fetch as any).mockResolvedValue(ok());

			await uploadWithPartialFile(mockUrl, manyChunksFile(), {
				chunkSize: 10,
				skipChunks: [9]
			});

			expect(sentIsDone()).not.toContain('true');
		});
	});

	describe('tam dosya bütünlüğü', () => {
		it('parçalar bittiyse dosyanın tamamı birleşir', async () => {
			(fetch as any).mockResolvedValue(ok());

			await uploadWithPartialFile(mockUrl, manyChunksFile(), { chunkSize: 10, concurrency: 3 });

			const received = (vi.mocked(fetch).mock.calls as any[])
				.map((call) => (call[1]?.body as FormData).get('file') as File)
				.reduce((acc, f) => acc + f.size, 0);

			expect(received).toBe(100);
			expect(sentIndexes().sort((a, b) => Number(a) - Number(b))).toEqual(
				Array.from({ length: 10 }, (_, i) => String(i))
			);
		});

		it('her parça doğru form alanlarını taşır', async () => {
			(fetch as any).mockResolvedValue(ok());

			// happy-dom `FormData.get()` ile dosya adını döndürmediği için
			// `append` çağrısını doğrudan gözlemliyoruz.
			const appendSpy = vi.spyOn(FormData.prototype, 'append');

			await uploadWithPartialFile(mockUrl, smallFile(), { fileGuid: 'x' });

			const body = initAt(0).body as FormData;
			expect(body.get('filename')).toBe('test.txt');
			expect(body.get('index')).toBe('0');
			expect(body.get('totalChunks')).toBe('1');
			expect(body.get('fileGuid')).toBe('x');

			const fileAppend = appendSpy.mock.calls.find((c) => c[0] === 'file');
			expect(fileAppend?.[2]).toBe('test.txt_chunk_0');
			expect((fileAppend?.[1] as Blob).size).toBe(11);
		});
	});

	describe("token yenileme mutex'ı", () => {
		it("eşzamanlı 401'lerde aynı anda tek yenileme uçuşta olur", async () => {
			// Sunucu bir süre 401 döner, sonra kabul eder.
			let seen = 0;
			(fetch as any).mockImplementation(() => {
				seen++;
				return seen <= 12 ? Promise.resolve(fail(401)) : Promise.resolve(ok());
			});

			let inFlight = 0;
			let maxInFlight = 0;

			const onUnauthorized = vi.fn(async () => {
				inFlight++;
				maxInFlight = Math.max(maxInFlight, inFlight);
				// Gerçek bir ağ turu kadar sürsün
				await new Promise((r) => setTimeout(r, 5));
				inFlight--;
				return { headers: { Authorization: 'Bearer new' } };
			});

			const result = await uploadWithPartialFile(mockUrl, manyChunksFile(), {
				chunkSize: 10,
				concurrency: 4,
				maxRefreshAttempts: 20,
				onUnauthorized
			});

			expect(result.success).toBe(true);
			// Mutex'in varlık sebebi: hiçbir anda birden fazla yenileme uçuşta olmamalı
			expect(maxInFlight).toBe(1);
			// 12 adet 401 vardı; her yenileme birden çok 401'yi karşılayabilir
			expect(onUnauthorized.mock.calls.length).toBeGreaterThan(0);
			expect(onUnauthorized.mock.calls.length).toBeLessThan(12);
		});

		it('yenileme bitince sonraki ihtiyaç için yeniden çağrılabilir', async () => {
			let attempts = 0;
			// İlk iki deneme 401 -> iki yenileme gerekir
			(fetch as any).mockImplementation(() => {
				attempts++;
				return attempts <= 2 ? Promise.resolve(fail(401)) : Promise.resolve(ok());
			});

			const onUnauthorized = vi.fn().mockResolvedValue({ headers: { Authorization: 'Bearer new' } });

			const result = await uploadWithPartialFile(mockUrl, smallFile(), { onUnauthorized });

			expect(result.success).toBe(true);
			expect(onUnauthorized).toHaveBeenCalledTimes(2);
		});

		it("mutex yenileme hatasında takılmaz ve tüm worker'lar aynı hatayı görür", async () => {
			(fetch as any).mockResolvedValue(fail(401));

			const onUnauthorized = vi.fn().mockRejectedValue(new Error('refresh boom'));

			// Asıl risk: bir promise hiç settle olmazsa yükleme sonsuza kadar asılı kalır.
			const result = await uploadWithPartialFile(mockUrl, manyChunksFile(), {
				chunkSize: 10,
				concurrency: 4,
				onUnauthorized
			});

			expect(result.success).toBe(false);
			expect(result.code).toBe('TOKEN_REFRESH_FAILED');
			expect(result.message).toContain('refresh boom');
			// Eşzamanlı worker'lar tek bir uçuşta birleşmeli
			expect(onUnauthorized).toHaveBeenCalledTimes(1);
		});
	});

	describe('credentials', () => {
		it('varsayılan same-origin', async () => {
			(fetch as any).mockResolvedValue(ok());

			await uploadWithPartialFile(mockUrl, smallFile());

			expect(initAt(0).credentials).toBe('same-origin');
		});

		it("include ile cookie'li cross-origin yükleme yapılabilir", async () => {
			(fetch as any).mockResolvedValue(ok());

			await uploadWithPartialFile(mockUrl, smallFile(), { credentials: 'include' });

			expect(initAt(0).credentials).toBe('include');
		});

		it('omit de desteklenir', async () => {
			(fetch as any).mockResolvedValue(ok());

			await uploadWithPartialFile(mockUrl, smallFile(), { credentials: 'omit' });

			expect(initAt(0).credentials).toBe('omit');
		});

		it('geçersiz credentials reddedilir', async () => {
			await expect(
				uploadWithPartialFile(mockUrl, smallFile(), { credentials: 'nope' as any })
			).rejects.toMatchObject({ code: 'INVALID_INPUT' });
			expect(fetch).not.toHaveBeenCalled();
		});
	});

	describe('timeout', () => {
		it('timeout verilmezse signal aynen iletilir', async () => {
			(fetch as any).mockResolvedValue(ok());
			const controller = new AbortController();

			await uploadWithPartialFile(mockUrl, smallFile(), { signal: controller.signal });

			expect(initAt(0).signal).toBe(controller.signal);
		});

		it('timeout verilirse birleşik sinyal kullanılır', async () => {
			(fetch as any).mockResolvedValue(ok());

			await uploadWithPartialFile(mockUrl, smallFile(), { timeout: 5000 });

			const sent = initAt(0).signal as AbortSignal;
			expect(sent).toBeInstanceOf(AbortSignal);
			expect(sent).not.toBeUndefined();
			expect(sent.aborted).toBe(false);
		});

		it('timeout sonrası iptal edilmiş sinyal yüklemeyi durdurur', async () => {
			(fetch as any).mockImplementation(async (_url: any, init: any) => {
				// Zaman aşımı sinyali tetiklenmiş gibi davran
				init.signal.aborted = true;
				const err = new Error('The operation was aborted');
				err.name = 'TimeoutError';
				throw err;
			});

			const result = await uploadWithPartialFile(mockUrl, smallFile(), { timeout: 1, retries: 1 });

			expect(result.success).toBe(false);
			expect(result.code).toBe('NETWORK_ERROR');
			expect(result.message).toContain('aborted');
		});

		it('geçersiz timeout reddedilir', async () => {
			await expect(uploadWithPartialFile(mockUrl, smallFile(), { timeout: -1 })).rejects.toMatchObject({
				code: 'INVALID_INPUT'
			});
		});

		it('AbortSignal.any yoksa elle birlestirmeye duser', async () => {
			// Node 18 / eski tarayicilarda AbortSignal.any bulunmuyor; kod bu
			// durumda crash etmemeli, kendi sinyalini uretmeli.
			const RealAbortSignal = globalThis.AbortSignal;
			// bilerek `any` metodu olmayan bir sarmalayıcı
			vi.stubGlobal('AbortSignal', { timeout: (ms: number) => RealAbortSignal.timeout(ms) });

			(fetch as any).mockResolvedValue(ok());
			const result = await uploadWithPartialFile(mockUrl, smallFile(), { timeout: 5000 });

			expect(result.success).toBe(true);

			const sent = initAt(0).signal as AbortSignal;
			expect(sent).toBeInstanceOf(RealAbortSignal);
			expect(sent.aborted).toBe(false);
			expect(typeof sent.addEventListener).toBe('function');
		});

		it("fallback yolu kullanici abort'u ile tetiklenir", async () => {
			const RealAbortSignal = globalThis.AbortSignal;
			vi.stubGlobal('AbortSignal', { timeout: (ms: number) => RealAbortSignal.timeout(ms) });

			const controller = new AbortController();
			let observedAborted: boolean | undefined;

			(fetch as any).mockImplementation(async (_url: any, init: any) => {
				controller.abort();
				observedAborted = init.signal.aborted;
				return ok();
			});

			const result = await uploadWithPartialFile(mockUrl, manyChunksFile(), {
				chunkSize: 25,
				concurrency: 1,
				timeout: 60000,
				signal: controller.signal
			});

			// Elle birlestirilen sinyal, kullanici sinyali tetiklenince de abort olmali
			expect(observedAborted).toBe(true);
			expect(result.code).toBe('ABORTED');
		});
	});

	describe('sunucu yanıtı', () => {
		it('son parçanın JSON gövdesi data.response içinde döner', async () => {
			(fetch as any).mockResolvedValue({
				ok: true,
				status: 201,
				text: async () => JSON.stringify({ location: '/files/abc123' })
			});

			const result = await uploadWithPartialFile(mockUrl, smallFile());

			expect(result.success).toBe(true);
			expect(result.statusCode).toBe(201);
			expect(result.data?.response?.status).toBe(201);
			expect(result.data?.response?.data).toEqual({ location: '/files/abc123' });
		});

		it('JSON olmayan gövde ham metin olarak döner', async () => {
			(fetch as any).mockResolvedValue({ ok: true, status: 200, text: async () => 'OK-COMPLETE' });

			const result = await uploadWithPartialFile(mockUrl, smallFile());

			expect(result.data?.response?.data).toBe('OK-COMPLETE');
		});

		it('boş gövde undefined döner', async () => {
			(fetch as any).mockResolvedValue({ ok: true, status: 200, text: async () => '' });

			const result = await uploadWithPartialFile(mockUrl, smallFile());

			expect(result.data?.response?.data).toBeUndefined();
		});

		it('text() desteklemeyen yanıtta çökmeyez', async () => {
			(fetch as any).mockResolvedValue({ ok: true, status: 200 });

			const result = await uploadWithPartialFile(mockUrl, smallFile());

			expect(result.success).toBe(true);
			expect(result.data?.response?.status).toBe(200);
		});

		it('yanıt başlıkları düz nesne olarak döner', async () => {
			(fetch as any).mockResolvedValue({
				ok: true,
				status: 200,
				text: async () => '',
				headers: new Headers({ 'X-File-Id': 'xyz' })
			});

			const result = await uploadWithPartialFile(mockUrl, smallFile());

			expect(result.data?.response?.headers?.['x-file-id']).toBe('xyz');
		});

		it('son parça atlanırsa response undefined olur', async () => {
			(fetch as any).mockResolvedValue(ok());

			const result = await uploadWithPartialFile(mockUrl, manyChunksFile(), {
				chunkSize: 10,
				skipChunks: [9]
			});

			expect(result.success).toBe(true);
			expect(result.data?.response).toBeUndefined();
		});

		it('parseResponse yorumlanmış değeri parsed alanına koyar', async () => {
			(fetch as any).mockResolvedValue({
				ok: true,
				status: 200,
				text: async () => JSON.stringify({ id: 'srv-1' })
			});

			const parseResponse = vi.fn((r: any) => r.data.id as string);

			const result = await uploadWithPartialFile(mockUrl, smallFile(), { parseResponse });

			expect(parseResponse).toHaveBeenCalledTimes(1);
			expect(result.data?.response?.parsed).toBe('srv-1');
			expect(result.data?.response?.data).toEqual({ id: 'srv-1' });
		});

		it('parseResponse hata fırlatırsa yükleme yine başarılı olur', async () => {
			(fetch as any).mockResolvedValue(ok());

			const result = await uploadWithPartialFile(mockUrl, smallFile(), {
				parseResponse: () => {
					throw new Error('beklenmeyen şema');
				}
			});

			expect(result.success).toBe(true);
			expect(result.data?.response?.parsed).toBeUndefined();
		});

		it('parseResponse geçersizse reddedilir', async () => {
			await expect(
				uploadWithPartialFile(mockUrl, smallFile(), { parseResponse: 'yok' as any })
			).rejects.toMatchObject({ code: 'INVALID_INPUT' });
		});

		it('statusCode artık sabit 200 değil gerçek yanıt kodudur', async () => {
			(fetch as any).mockResolvedValue({ ok: true, status: 204, text: async () => '' });

			const result = await uploadWithPartialFile(mockUrl, smallFile());

			expect(result.statusCode).toBe(204);
		});
	});
});
