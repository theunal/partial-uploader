import type { UploadErrorCode } from './types';

/**
 * Yalnızca **geçersiz girdi** (programmer error) durumlarında fırlatılır.
 * Ağ/sunucu hataları `PartialUploadResponse` içinde `success: false` olarak döner,
 * böylece çağıranın mevcut `try/catch` kullanımı bozulmaz.
 */
export class PartialUploadError extends Error {
	readonly code: UploadErrorCode;
	readonly statusCode?: number;

	constructor(code: UploadErrorCode, message: string, statusCode?: number, cause?: unknown) {
		super(message);
		this.name = 'PartialUploadError';
		this.code = code;
		this.statusCode = statusCode;

		if (cause !== undefined) {
			(this as { cause?: unknown }).cause = cause;
		}

		// TypeScript'in ES5 hedefinde `instanceof` bozulmasın diye
		Object.setPrototypeOf(this, PartialUploadError.prototype);
	}
}

/** Hata mesajına sunucudan gelen gövdeyi güvenli şekilde ekler. */
export const describeHttpError = async (res: Response, status: number): Promise<string> => {
	let detail = '';

	if (res && typeof res.text === 'function') {
		try {
			const body = await res.text();
			if (body) detail = `: ${body.slice(0, 500)}`;
		} catch {
			// Gövde okunamazsa (zaten tüketilmiş olabilir) sessizce geç.
		}
	}

	return `Server error: ${status}${detail}`;
};
