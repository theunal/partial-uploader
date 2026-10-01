import { PartialUploadError, describeHttpError } from './errors.js';
import type {
	ChunkSelector,
	HeadersOrOptions,
	PartialUploadOptions,
	PartialUploadResponse,
	RefreshResult,
	UnauthorizedCallback,
	UploadedChunkResponse,
	UploadProgress
} from './types.js';

const DEFAULT_CHUNK_SIZE = 26214400; // 25 MB
const DEFAULT_DELAY = 50;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_RETRIES = 3;
const DEFAULT_MAX_REFRESH_ATTEMPTS = 3;
const DEFAULT_TIMEOUT = 0;
const DEFAULT_CREDENTIALS: RequestCredentials = 'same-origin';

/** FormData gövdesinde `Content-Type` elle verilirse multipart boundary kaybolur. */
const stripContentType = (headers: Record<string, string>): Record<string, string> => {
	const result: Record<string, string> = {};

	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === 'content-type') continue;
		result[key] = value;
	}

	return result;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** Yakalanan değerden güvenli bir mesaj çıkarır. */
const errorMessage = (e: unknown): string => {
	if (e instanceof Error) return e.message;
	if (typeof e === 'string') return e;
	if (e === null || e === undefined) return '';
	return Object.prototype.toString.call(e);
};

/**
 * Yeni option anahtarları. 3. parametrede bunlardan biri varsa nesne options
 * olarak yorumlanır, aksi halde eski imzadaki header nesnesi sayılır.
 * `PartialUploadOptions`'a alan eklerken BURAYA DA eklenmeli.
 */
const OPTION_KEYS = new Set<string>([
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
]);

/**
 * 3. parametre ya yeni `PartialUploadOptions` nesnesi ya da eski imzadaki
 * header nesnesi. Ayırt etmek için bilinen option anahtarlarına bakılır;
 * bilinen anahtar yoksa (örn. `{ Authorization: '...' }`) header kabul edilir.
 */
const normalizeArgs = (
	headersOrOptions?: HeadersOrOptions,
	chunkSize?: number,
	delay?: number,
	concurrency?: number,
	onUnauthorized?: UnauthorizedCallback
): PartialUploadOptions => {
	if (isRecord(headersOrOptions) && Object.keys(headersOrOptions).some((k) => OPTION_KEYS.has(k))) {
		return { ...(headersOrOptions as PartialUploadOptions) };
	}

	return {
		headers: isRecord(headersOrOptions) ? { ...(headersOrOptions as Record<string, string>) } : {},
		chunkSize,
		delay,
		concurrency,
		onUnauthorized
	};
};

const assertPositiveInteger = (value: number, name: string, min: number): number => {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new PartialUploadError('INVALID_INPUT', `${name} must be a finite number, received: ${String(value)}`);
	}
	if (!Number.isInteger(value)) {
		throw new PartialUploadError('INVALID_INPUT', `${name} must be an integer, received: ${value}`);
	}
	if (value < min) {
		throw new PartialUploadError('INVALID_INPUT', `${name} must be >= ${min}, received: ${value}`);
	}

	return value;
};

const resolveSettings = (options: PartialUploadOptions) => {
	const chunkSize = assertPositiveInteger(options.chunkSize ?? DEFAULT_CHUNK_SIZE, 'chunkSize', 1);
	const concurrency = assertPositiveInteger(options.concurrency ?? DEFAULT_CONCURRENCY, 'concurrency', 1);
	const retries = assertPositiveInteger(options.retries ?? DEFAULT_RETRIES, 'retries', 1);
	const maxRefreshAttempts = assertPositiveInteger(
		options.maxRefreshAttempts ?? DEFAULT_MAX_REFRESH_ATTEMPTS,
		'maxRefreshAttempts',
		0
	);

	const delay = options.delay ?? DEFAULT_DELAY;
	if (typeof delay !== 'number' || !Number.isFinite(delay) || delay < 0) {
		throw new PartialUploadError(
			'INVALID_INPUT',
			`delay must be a finite number >= 0, received: ${String(options.delay)}`
		);
	}

	const retryDelay = options.retryDelay ?? delay;
	if (typeof retryDelay !== 'number' || !Number.isFinite(retryDelay) || retryDelay < 0) {
		throw new PartialUploadError(
			'INVALID_INPUT',
			`retryDelay must be a finite number >= 0, received: ${String(options.retryDelay)}`
		);
	}

	/** Zaman aşımı 0 ise kısıt uygulanmaz. */
	const timeout = options.timeout ?? DEFAULT_TIMEOUT;
	if (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout < 0) {
		throw new PartialUploadError(
			'INVALID_INPUT',
			`timeout must be a finite number >= 0, received: ${String(options.timeout)}`
		);
	}

	// `fetch` varsayılanı `same-origin`'dır; header ile değiştirilemez.
	const credentials = options.credentials ?? DEFAULT_CREDENTIALS;

	if (options.onProgress !== undefined && typeof options.onProgress !== 'function') {
		throw new PartialUploadError('INVALID_INPUT', 'onProgress must be a function');
	}
	if (options.onUnauthorized !== undefined && typeof options.onUnauthorized !== 'function') {
		throw new PartialUploadError('INVALID_INPUT', 'onUnauthorized must be a function');
	}
	if (options.parseResponse !== undefined && typeof options.parseResponse !== 'function') {
		throw new PartialUploadError('INVALID_INPUT', 'parseResponse must be a function');
	}

	if (
		credentials !== undefined &&
		credentials !== 'omit' &&
		credentials !== 'same-origin' &&
		credentials !== 'include'
	) {
		throw new PartialUploadError(
			'INVALID_INPUT',
			`credentials must be 'omit' | 'same-origin' | 'include', received: ${String(credentials)}`
		);
	}

	return { chunkSize, concurrency, retries, delay, retryDelay, maxRefreshAttempts, timeout, credentials };
};

const toSkipSet = (selector?: ChunkSelector, totalChunks?: number): Set<number> => {
	if (selector === undefined) return new Set();

	if (typeof selector === 'function') {
		const set = new Set<number>();
		for (let i = 0; i < (totalChunks ?? 0); i++) {
			if (selector(i, totalChunks ?? 0)) set.add(i);
		}
		return set;
	}

	return selector instanceof Set ? new Set(selector) : new Set(selector);
};

const delay = (ms: number, signal?: AbortSignal): Promise<void> =>
	new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new PartialUploadError('ABORTED', 'Upload aborted'));
			return;
		}
		if (ms <= 0) {
			resolve();
			return;
		}

		const onAbort = () => {
			clearTimeout(timer);
			reject(new PartialUploadError('ABORTED', 'Upload aborted'));
		};

		const timer = setTimeout(() => {
			signal?.removeEventListener('abort', onAbort);
			resolve();
		}, ms);

		signal?.addEventListener('abort', onAbort, { once: true });
	});

const generateId = (): string => {
	const cryptoObj = globalThis.crypto as Crypto | undefined;
	if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
		return cryptoObj.randomUUID();
	}

	// randomUUID yoksa (güvenli olmayan eski bağlam) geri düşüş
	const chars = '0123456789abcdef';
	let guid = '';
	for (let i = 0; i < 40; i++) {
		guid += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return guid;
};

/**
 * Zaman aşımı sinyali üretir. `AbortSignal.timeout` desteklenmeyen ortamlarda
 * `undefined` döner (kısıt uygulanmaz).
 */
const timeoutSignal = (ms: number): AbortSignal | undefined => {
	if (typeof AbortSignal.timeout !== 'function') return undefined;
	try {
		return AbortSignal.timeout(ms);
	} catch {
		return undefined;
	}
};

/**
 * Verilen sinyallerden herhangi biri tetiklendiğinde tetiklenen tek bir sinyal üretir.
 * `AbortSignal.any` olmayan ortamlarda elle birleştirir.
 */
const combineSignals = (...signals: (AbortSignal | undefined)[]): AbortSignal | undefined => {
	const active = signals.filter((s): s is AbortSignal => s !== undefined && s !== null);

	if (active.length === 0) return undefined;
	if (active.length === 1) return active[0];

	// TypeScript'in DOM lib'inde `AbortSignal.any` tipi yok.
	const any = (AbortSignal as unknown as { any?: (list: AbortSignal[]) => AbortSignal }).any;
	if (typeof any === 'function') return any.call(AbortSignal, active);

	// Fallback: AbortSignal.any desteklenmeyen ortamlar
	const controller = new AbortController();
	const abort = () => controller.abort();

	for (const s of active) {
		if (s.aborted) {
			controller.abort();
			break;
		}
		s.addEventListener('abort', abort, { once: true });
	}

	return controller.signal;
};

/** Yanıt gövdesini güvenli şekilde okur. İkinci kez okunamaz, hata durumunda yutulur. */
const readBody = async (res: Response): Promise<unknown> => {
	if (!res || typeof res.text !== 'function') return undefined;

	try {
		const text = await res.text();
		if (!text) return undefined;

		try {
			return JSON.parse(text);
		} catch {
			// JSON değilse ham metni döndür.
			return text;
		}
	} catch {
		// Gövde okunamıyor (ör. tarayıcı tarafından tüketilmiş).
		return undefined;
	}
};

/**
 * Yanıt başlıklarını düz nesne olarak döndürür.
 * Anahtarlar her zaman küçük harfe indirgenir (gerçek `fetch` yanıtlarının
 * davranışıyla tutarlı olsun diye; boyut/harf farkına göre erişim kolaylaşsın).
 */
const readHeaders = (res: Response): Record<string, string> | undefined => {
	const headers = res?.headers;
	if (!headers || typeof headers.forEach !== 'function') return undefined;

	const result: Record<string, string> = {};
	headers.forEach((value: string, key: string) => {
		result[String(key).toLowerCase()] = value;
	});

	return Object.keys(result).length > 0 ? result : undefined;
};

/**
 * Dosyayı parçalar halinde yükler.
 *
 * @example Yeni imza
 * await uploadWithPartialFile('/url', file, {
 *   headers: { Authorization: 'Bearer ...' },
 *   concurrency: 3,
 *   onProgress: (p) => console.log(p.percent),
 * });
 *
 * @example Eski imza (hâlâ destekleniyor)
 * await uploadWithPartialFile('/url', file, { Authorization: 'Bearer ...' }, 5242880, 50, 3);
 */
const uploadWithPartialFile = async (
	url: string,
	file: File | Blob,
	headersOrOptions?: HeadersOrOptions,
	legacyChunkSize?: number,
	legacyDelay?: number,
	legacyConcurrency?: number,
	legacyOnUnauthorized?: UnauthorizedCallback
): Promise<PartialUploadResponse> => {
	// ---- Doğrulama (geçersiz girdi -> reject) ----
	if (typeof url !== 'string' || url.trim() === '') {
		throw new PartialUploadError('INVALID_INPUT', `url must be a non-empty string, received: ${String(url)}`);
	}
	if (file === null || typeof file !== 'object' || typeof file.slice !== 'function') {
		throw new PartialUploadError('INVALID_INPUT', 'file must be a Blob or File instance');
	}
	if (typeof file.size !== 'number' || !Number.isFinite(file.size) || file.size < 0) {
		throw new PartialUploadError('INVALID_INPUT', 'file must have a finite, non-negative size');
	}

	const options = normalizeArgs(
		headersOrOptions,
		legacyChunkSize,
		legacyDelay,
		legacyConcurrency,
		legacyOnUnauthorized
	);
	const {
		chunkSize,
		concurrency,
		retries,
		delay: chunkDelay,
		retryDelay,
		maxRefreshAttempts,
		timeout,
		credentials
	} = resolveSettings(options);

	const signal = options.signal;
	if (signal?.aborted) {
		return { success: false, message: 'Upload aborted', statusCode: 0, code: 'ABORTED' };
	}

	// ---- Paylaşılan, dinamik istek bağlamı ----
	const sharedContext = {
		url,
		headers: stripContentType(options.headers ?? {}),
		refreshAttempts: 0,
		// Eşzamanlı 401'lerde aynı anda birden fazla yenileme çağrılmasın diye
		// uçuştaki tek promise paylaşılır (mutex).
		refreshInFlight: null as Promise<RefreshResult | null> | null
	};

	const id = options.fileGuid ?? generateId();
	const fileName = (file as File).name || 'file';
	const totalSize = file.size;
	const totalChunks = Math.max(1, Math.ceil(totalSize / chunkSize));
	const lastIndex = totalChunks - 1;
	const skipped = toSkipSet(options.skipChunks, totalChunks);

	let loadedBytes = 0;
	let uploadedChunks = 0;

	const emitProgress = (lastChunk: number) => {
		if (!options.onProgress) return;

		const progress: UploadProgress = {
			loaded: loadedBytes,
			total: totalSize,
			percent: totalSize === 0 ? 100 : Math.min(100, Math.round((loadedBytes / totalSize) * 100)),
			uploadedChunks,
			totalChunks,
			lastChunk
		};

		// Callback hatası yüklemeyi bozmasın.
		try {
			options.onProgress(progress);
		} catch {
			/* yoksay */
		}
	};

	const chunkByteLength = (index: number) => {
		const start = index * chunkSize;
		const end = Math.min(start + chunkSize, totalSize);
		return Math.max(0, end - start);
	};

	/**
	 * Token yenilemeyi eşzamanlı çağrılardan korur.
	 * Uçuşta bir yenileme varsa onun sonucunu bekler; böylece `concurrency > 1`
	 * iken iki worker aynı anda 401 alıp iki ayrı token isteği atmaz.
	 * Çağıran, işlem başına 1 hak harcar.
	 */
	const refreshTokenOnce = async (res: Response): Promise<RefreshResult | null> => {
		const inFlight = (sharedContext.refreshInFlight ??= (async () => {
			sharedContext.refreshAttempts++;
			try {
				return await options.onUnauthorized!(res);
			} finally {
				sharedContext.refreshInFlight = null;
			}
		})());

		return inFlight;
	};

	const uploadChunk = async (index: number): Promise<UploadedChunkResponse | undefined> => {
		const start = index * chunkSize;
		const end = Math.min(start + chunkSize, totalSize);
		const chunk = file.slice(start, end);
		const isLast = index === lastIndex;

		for (let attempt = 0; attempt < retries; attempt++) {
			try {
				const formData = new FormData();
				formData.append('file', chunk, `${fileName}_chunk_${index}`);
				formData.append('fileGuid', id);
				formData.append('isDone', isLast.toString());
				formData.append('totalSize', totalSize.toString());
				formData.append('totalChunks', totalChunks.toString());
				formData.append('filename', fileName);
				formData.append('index', index.toString());

				const res = await fetch(sharedContext.url, {
					method: 'POST',
					body: formData,
					headers: sharedContext.headers,
					credentials,
					// Kullanıcı sinyali ile istek zaman aşımını birleştir.
					signal: combineSignals(signal, timeout > 0 ? timeoutSignal(timeout) : undefined)
				});

				const status = typeof res.status === 'number' ? res.status : 0;
				const ok = res.ok ?? (status >= 200 && status < 300);

				// ---- 401: token yenileme, AYRI ve SINIRLI deneme sayacıyla ----
				if (status === 401 && options.onUnauthorized) {
					if (sharedContext.refreshAttempts < maxRefreshAttempts) {
						let refreshData: RefreshResult | null = null;
						try {
							refreshData = await refreshTokenOnce(res);
						} catch (e) {
							throw new PartialUploadError(
								'TOKEN_REFRESH_FAILED',
								`onUnauthorized threw an error: ${errorMessage(e)}`,
								status,
								e
							);
						}

						if (refreshData) {
							if (refreshData.headers) {
								sharedContext.headers = { ...sharedContext.headers, ...refreshData.headers };
							}
							if (refreshData.url) {
								sharedContext.url = refreshData.url;
							}
							// Token yenilendi; bu denemeyi harcamadan aynı parçayı tekrar dene.
							attempt--;
							continue;
						}

						throw new PartialUploadError(
							'UNAUTHORIZED',
							'Unauthorized and no token refresh was provided',
							status
						);
					}

					throw new PartialUploadError(
						'TOKEN_REFRESH_FAILED',
						`Token refresh limit reached (${maxRefreshAttempts} attempts) while server kept returning 401`,
						status
					);
				}

				if (ok) {
					const raw: UploadedChunkResponse = {
						status,
						headers: readHeaders(res),
						data: await readBody(res)
					};

					if (!options.parseResponse) return raw;

					// Sunucu verisini yorumlama hatası yükleme durumunu bozmasın.
					let parsed: unknown;
					try {
						parsed = await options.parseResponse(raw);
					} catch {
						return raw;
					}

					return { ...raw, parsed };
				}

				// ---- Diğer hata durumları: exponential backoff ile yeniden dene ----
				const isLastAttempt = attempt === retries - 1;
				const message = await describeHttpError(res, status);

				if (isLastAttempt) {
					throw new PartialUploadError('HTTP_ERROR', message, status);
				}

				await delay(retryDelay * (attempt + 1), signal);
			} catch (e: unknown) {
				if (e instanceof PartialUploadError) throw e;
				if (signal?.aborted || (e instanceof Error && e.name === 'AbortError')) {
					throw new PartialUploadError('ABORTED', 'Upload aborted', undefined, e);
				}
				if (attempt === retries - 1) {
					throw new PartialUploadError('NETWORK_ERROR', errorMessage(e) || 'Network error', undefined, e);
				}

				await delay(retryDelay * (attempt + 1), signal);
			}
		}

		throw new PartialUploadError('UPLOAD_FAILED', `Chunk ${index} could not be uploaded`);
	};

	// ---- Devam eden yükleme: atlanan parçalar ilerlemede zaten yüklenmiş sayılır ----
	for (const index of skipped) {
		loadedBytes += chunkByteLength(index);
		uploadedChunks++;
	}
	if (skipped.size > 0) emitProgress(-1);

	try {
		const pending: number[] = [];
		for (let i = 0; i < lastIndex; i++) {
			if (!skipped.has(i)) pending.push(i);
		}

		let cursor = 0;

		// ---- Faz 1: son parça hariç paralel yükleme ----
		const workerCount = Math.min(concurrency, pending.length);
		const workers = Array.from({ length: workerCount }, async () => {
			while (cursor < pending.length) {
				if (signal?.aborted) throw new PartialUploadError('ABORTED', 'Upload aborted');

				// while koşulu `cursor < pending.length` garantisi veriyor.
				const index = pending[cursor++]!;
				await uploadChunk(index);

				loadedBytes += chunkByteLength(index);
				uploadedChunks++;
				emitProgress(index);

				if (chunkDelay > 0) await delay(chunkDelay, signal);
			}
		});

		await Promise.all(workers);

		// ---- Faz 2: `isDone` taşıyan son parça HER ZAMAN en son ----
		// Böylece sunucu, diğer parçalar ulaşmadan dosyayı finalize etmez.
		let finalResponse: UploadedChunkResponse | undefined;
		if (!skipped.has(lastIndex)) {
			finalResponse = await uploadChunk(lastIndex);

			loadedBytes += chunkByteLength(lastIndex);
			uploadedChunks++;
			emitProgress(lastIndex);
		}

		return {
			success: true,
			message: 'file uploaded successfully',
			statusCode: finalResponse?.status ?? 200,
			data: {
				id,
				// Sunucunun finalize yanıtı; `parseResponse` kullanıldıysa yorumlanmış hali.
				response: finalResponse
			}
		};
	} catch (e: unknown) {
		// Tüm çalışma zamanı hataları yaşam döngüsü içinde bu sonuca dönüşür;
		// yalnızca geçersiz girdi (yukarıdaki doğrulama) reject eder.
		const err = e instanceof PartialUploadError ? e : undefined;

		return {
			success: false,
			message: err?.message ?? errorMessage(e) ?? 'file could not be loaded',
			statusCode: err?.statusCode ?? 0,
			code: err?.code ?? 'UPLOAD_FAILED'
		};
	}
};

export { uploadWithPartialFile };
export { PartialUploadError } from './errors.js';
export type {
	ChunkSelector,
	HeadersOrOptions,
	LegacyHeaders,
	PartialUploadOptions,
	PartialUploadResponse,
	ProgressCallback,
	RefreshResult,
	ResponseParser,
	UnauthorizedCallback,
	UploadErrorCode,
	UploadedChunkResponse,
	UploadProgress
} from './types.js';
