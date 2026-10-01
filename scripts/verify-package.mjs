/**
 * Yayınlanan paketin hem ESM hem CJS olarak gerçekten yüklenebildiğini doğrular.
 * Derleme sessizce bozulursa (yanlış `exports` haritası, eksik `.js` uzantısı,
 * yanlış `type` işareti) burada yakalanır.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { listPackedFiles } from './lib/pack.mjs';

const root = process.cwd();
const pkg = createRequire(import.meta.url)('../package.json');

const esmEntry = pathToFileURL(resolve(root, 'dist/esm/index.js')).href;
const cjsEntry = resolve(root, 'dist/cjs/index.js').replace(/\\/g, '/');

const dir = mkdtempSync(join(tmpdir(), 'partial-uploader-verify-'));

try {
	// ---- ESM tarafı ----
	writeFileSync(
		join(dir, 'check.mjs'),
		`import assert from 'node:assert/strict';
import { uploadWithPartialFile, PartialUploadError } from ${JSON.stringify(esmEntry)};
assert.equal(typeof uploadWithPartialFile, 'function');
assert.equal(typeof PartialUploadError, 'function');
try {
  await uploadWithPartialFile('/u', { size: 1, slice() {} }, { chunkSize: 0 });
  throw new Error('geçersiz chunkSize reddedilmedi');
} catch (e) {
  assert.equal(e.code, 'INVALID_INPUT');
}
console.log('  ESM ok');
`
	);
	execFileSync(process.execPath, [join(dir, 'check.mjs')], { stdio: 'inherit' });

	// ---- CJS tarafı ----
	writeFileSync(
		join(dir, 'check.cjs'),
		`const assert = require('node:assert/strict');
const { uploadWithPartialFile, PartialUploadError } = require(${JSON.stringify(cjsEntry)});
assert.equal(typeof uploadWithPartialFile, 'function');
assert.equal(typeof PartialUploadError, 'function');
uploadWithPartialFile('/u', { size: 1, slice() {} }, { concurrency: 0 }).then(
  () => { throw new Error('geçersiz concurrency reddedilmedi'); },
  (e) => assert.equal(e.code, 'INVALID_INPUT')
).then(() => console.log('  CJS ok'), (e) => { console.error(e); process.exit(1); });
`
	);
	execFileSync(process.execPath, [join(dir, 'check.cjs')], { stdio: 'inherit' });

	// ---- exports haritasındaki her yol gerçekten var mı ----
	const referenced = new Set();
	const collect = (value) => {
		if (typeof value === 'string' && value.startsWith('./dist/')) referenced.add(value.slice(2));
		else if (value && typeof value === 'object') Object.values(value).forEach(collect);
	};
	collect(pkg.exports);
	collect(pkg.main);
	collect(pkg.module);
	collect(pkg.types);

	for (const rel of referenced) {
		assert.ok(existsSync(join(root, rel)), `exports haritasında var olmayan dosya: ${rel}`);
	}
	console.log(`  ${referenced.size} exported path doğrulandı`);

	// ---- Yayınlanan tarball test dosyalarını içermemeli ----
	const packed = listPackedFiles(root);
	const leaked = packed.filter((f) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(f));

	assert.equal(leaked.length, 0, `paket içinde test dosyası var: ${leaked.join(', ')}`);
	console.log(`  ${packed.length} dosya paketlendi, test dosyası sızmadı`);

	console.log('Package doğrulaması başarılı.');
} finally {
	rmSync(dir, { recursive: true, force: true });
}
