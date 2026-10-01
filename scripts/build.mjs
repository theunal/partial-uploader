/**
 * Çift (ESM + CJS) çıktı üretir.
 *
 * Önceki `build` betiği `tsc src/index.ts` idi; komut satırında dosya
 * verildiğinde TypeScript tsconfig.json dosyasını tamamen yok saydığı için
 * `outDir`/`declaration` uygulanmıyordu. Artık ayrı tsconfig'ler kullanılıyor.
 */
import { execFileSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
// .cmd shim'larını spawn etmek Windows'ta EINVAL veriyor; derleyiciyi
// doğrudan node ile çalıştırmak platformdan bağımsız çalışıyor.
const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');

const run = (label, args) => {
	process.stdout.write(`${label}...\n`);
	execFileSync(process.execPath, [tsc, ...args], { cwd: root, stdio: 'inherit' });
};

// 1) Temizlik
if (existsSync(dist)) {
	rmSync(dist, { recursive: true, force: true });
}

// 2) Derleme
run('Building ESM', ['-p', 'tsconfig.esm.json']);
run('Building CJS', ['-p', 'tsconfig.cjs.json']);

// 3) Her çıktı klasörüne modül türü işareti yaz.
//    Node, `exports` haritasından bağımsız olarak en yakın package.json'a bakar.
for (const [dir, type] of [
	['esm', 'module'],
	['cjs', 'commonjs']
]) {
	const target = join(dist, dir);
	mkdirSync(target, { recursive: true });
	writeFileSync(join(target, 'package.json'), `${JSON.stringify({ type }, null, 2)}\n`, 'utf8');
}

process.stdout.write('Build complete: dist/esm + dist/cjs\n');
