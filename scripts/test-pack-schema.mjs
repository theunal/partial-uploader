/**
 * `listPackedFiles` parser'ının farklı npm çıktı şemalarına karşı
 * doğruluğunu test eder. (Hangi npm binary'sinin çalıştığına bağlı olmamalı.)
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listPackedFiles, parsePackedFiles } from './lib/pack.mjs';

const dir = mkdtempSync(join(tmpdir(), 'packschema-'));

try {
	// 1) Gerçek npm çıktısı (bu makinedeki npm hangi şemayı üretiyorsa)
	writeFileSync(
		join(dir, 'package.json'),
		JSON.stringify({ name: 'schema-probe', version: '1.0.0', files: ['a.js'] }, null, 2)
	);
	writeFileSync(join(dir, 'a.js'), 'module.exports = 1;\n');

	const real = listPackedFiles(dir);
	assert.ok(real.includes('a.js'), 'gerçek npm çıktısı ayrıştırılamadı');
	console.log(`  gerçek npm çıktısı                        -> ${real.length} dosya OK`);

	// 2) Sürümden bağımsız şemalar (npm hangi sürümde olursa olsun çalışmalı)
	const cases = [
		['eski npm: dizi', JSON.stringify([{ name: 'x', files: [{ path: 'a.js' }] }])],
		['yeni npm: nesne', JSON.stringify({ x: { name: 'x', files: [{ path: 'a.js' }] } })],
		[
			'stdout uyarı satırı önünde',
			'npm warn Unknown env config "global-ignore-file"\n' + JSON.stringify({ x: { files: [{ path: 'a.js' }] } })
		],
		['birden fazla paket', JSON.stringify({ x: { files: [{ path: 'a.js' }] }, y: { files: [{ path: 'b.js' }] } })],
		['önekte whitespace', '\n\n  ' + JSON.stringify({ x: { files: [{ path: 'a.js' }] } })]
	];

	for (const [name, json] of cases) {
		const files = parsePackedFiles(json);
		assert.ok(files.length > 0, `${name} -> dosya yok`);
		console.log(`  ${name.padEnd(38)} -> ${files.join(',')} OK`);
	}

	// 3) Tanınmayan şemada anlamlı hata verilmeli (TypeError değil)
	assert.throws(() => parsePackedFiles('{"x":{"name":"x"}}'), /files/, 'files alanı yoksa anlamlı hata bekleniyordu');
	assert.throws(() => parsePackedFiles('tamamen json degil'), /JSON bulunamadı/);
	console.log('  hata yollari (files yok / JSON yok)        -> OK');

	console.log('Şema testleri başarılı.');
} finally {
	rmSync(dir, { recursive: true, force: true });
}
