/**
 * `npm pack --dry-run --json` çıktısını okumak için yardımcılar.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

/**
 * Yayınlanacak dosya yollarını döndürür.
 *
 * Bu çıktının şekli npm sürümleri arasında değişti:
 *   npm <= 11 : [ { files: [...] } ]
 *   npm >= 12 : { "<paket-adi>": { files: [...] } }
 * Bazı sürümler ayrıca stdout'a uyarı satırları yazabiliyor.
 * Bu yüzden tek şema varsaymak yerine `files` dizisi içeren ilk nesne aranır.
 */
export const listPackedFiles = (cwd) => {
	const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd, encoding: 'utf8' });

	// stdout'u temizle: uyarı satırları JSON'un önüne karışabiliyor.
	const start = raw.search(/[[{]/);
	assert.ok(start >= 0, `npm pack --json ayrıştırılamadı:\n${raw.slice(0, 500)}`);

	let parsed;
	try {
		parsed = JSON.parse(raw.slice(start));
	} catch (e) {
		throw new Error(`npm pack --json çıktısı geçersiz JSON: ${e.message}\n${raw.slice(0, 500)}`);
	}

	const candidates = Array.isArray(parsed) ? parsed : Object.values(parsed);
	const entry = candidates.find((c) => c && Array.isArray(c.files));

	assert.ok(
		entry,
		`npm pack --json çıktısında "files" alanı bulunamadı (npm beklenmeyen bir şema üretti).\n${raw.slice(0, 500)}`
	);

	return entry.files.map((f) => f.path);
};

/** Ham çıktıdan dosya yollarını çıkarır (testlerde sentetik girdi için). */
export const parsePackedFiles = (raw) => {
	const start = raw.search(/[[{]/);
	assert.ok(start >= 0, 'JSON bulunamadı');

	let parsed;
	try {
		parsed = JSON.parse(raw.slice(start));
	} catch (e) {
		throw new Error(`geçersiz JSON: ${e.message}`);
	}

	const candidates = Array.isArray(parsed) ? parsed : Object.values(parsed);
	const entry = candidates.find((c) => c && Array.isArray(c.files));
	assert.ok(entry, '"files" alanı bulunamadı');

	return entry.files.map((f) => f.path);
};
