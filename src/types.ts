/**
 * Token yenileme sonucu. `headers` verilirse mevcut header'la birleştirilir,
 * `url` verilirse istek yeni adrese gider.
 */
export interface RefreshResult {
	headers?: Record<string, string>;
	url?: string;
}

export type UnauthorizedCallback = (error: Response) => Promise<RefreshResult | null> | RefreshResult | null;

/**
 * Yükleme ilerlemesi. `percent` 0-100 aralığındadır ve monoton olarak artar.
 */
export interface UploadProgress {
	/** Yüklenmiş byte sayısı */
	loaded: number;
	/** Toplam byte sayısı */
	total: number;
	/** 0-100 arası yüzde */
	percent: number;
	/** Tamamlanan parça sayısı */
	uploadedChunks: number;
	/** Toplam parça sayısı */
	totalChunks: number;
	/** Az önce tamamlanan parçanın indeksi */
	lastChunk: number;
}

export type ProgressCallback = (progress: UploadProgress) => void;

/** Sunucunun tek bir parça için döndüğü yanıt. */
export interface UploadedChunkResponse {
	/** HTTP durum kodu. */
	status: number;
	/** Sunucu yanıtının ayrıştırılmış gövdesi. JSON değilse ham metin. */
	data?: unknown;
	/** Yanıt başlıkları. */
	headers?: Record<string, string>;
	/** `parseResponse` verildiyse onun döndürdüğü değer. */
	parsed?: unknown;
}

export type ResponseParser<T = unknown> = (response: UploadedChunkResponse) => T | Promise<T>;

export interface PartialUploadResponse {
	success: boolean;
	message: string;
	statusCode: number;
	/** Başarılı yüklemelerde döner, hatalarda `undefined` olur. */
	data?: {
		/** İstemcide üretilen yükleme kimliği. */
		id: string;
		/** `isDone` taşıyan son parçanın sunucu yanıtı. */
		response?: UploadedChunkResponse;
	};
	/** Hata kodlarından biri. Başarıda `undefined`. */
	code?: UploadErrorCode;
}

export type UploadErrorCode =
	| 'INVALID_INPUT'
	| 'NETWORK_ERROR'
	| 'HTTP_ERROR'
	| 'UNAUTHORIZED'
	| 'TOKEN_REFRESH_FAILED'
	| 'ABORTED'
	| 'UPLOAD_FAILED';

/** `skipChunks` için parça atlamayı kolaylaştırır. */
export type ChunkSelector = number[] | Set<number> | ((index: number, totalChunks: number) => boolean);

export interface PartialUploadOptions {
	/** İstek başlıkları. `Content-Type` gövde FormData olduğu için yok sayılır. */
	headers?: Record<string, string>;
	/** Parça boyutu (byte). Varsayılan 25 MB. */
	chunkSize?: number;
	/** Parçalar arası bekleme (ms). Varsayılan 50. */
	delay?: number;
	/** Aynı anda yüklenecek parça sayısı. Varsayılan 1. */
	concurrency?: number;
	/** Parça başına toplam deneme sayısı. Varsayılan 3. */
	retries?: number;
	/** Yeniden deneme beklemesinin temel süresi (ms). Varsayılan `delay`. */
	retryDelay?: number;
	/** 401 alındığında token yenileme. */
	onUnauthorized?: UnauthorizedCallback;
	/** İlerleme callback'i. */
	onProgress?: ProgressCallback;
	/** Yüklemeyi iptal etmek için. */
	signal?: AbortSignal;
	/** Toplam yenileme denemesi sınırı (tüm parçalar toplam). Varsayılan 3. */
	maxRefreshAttempts?: number;
	/** Parça başına istek zaman aşımı (ms). `0` = sınırsız (varsayılan). */
	timeout?: number;
	/** `fetch` credentials modu. Varsayılan `same-origin` (`fetch` varsayılanı). */
	credentials?: RequestCredentials;
	/** Sunucu yanıtını dönüştürmek için çağrılır. */
	parseResponse?: ResponseParser;
	/** Devam eden bir yüklemeyi bağlamak için mevcut id. */
	fileGuid?: string;
	/** Zaten yüklenmiş olduğu bilinen parçaların atlanması. */
	skipChunks?: ChunkSelector;
}

/**
 * Eski (0.0.8) pozisyonel imzadaki 3. parametre: düz header nesnesi.
 * @deprecated Yeni kodda {@link PartialUploadOptions} kullanın.
 */
export type LegacyHeaders = Record<string, string>;

/**
 * 3. parametre ya yeni {@link PartialUploadOptions} nesnesi ya da düz header
 * nesnesi olabilir. Çalışma anında `normalizeArgs` ayrımı yapar.
 */
export type HeadersOrOptions = PartialUploadOptions | LegacyHeaders;
