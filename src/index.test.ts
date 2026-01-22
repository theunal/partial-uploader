import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadWithPartialFile } from './index';

// @vitest-environment happy-dom

describe('uploadWithPartialFile', () => {
    const mockUrl = 'https://api.example.com/upload';
    const mockFile = new File(['hello world'], 'test.txt', { type: 'text/plain' });

    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
        vi.useFakeTimers();
    });

    it('should upload a small file in a single chunk successfully', async () => {
        (fetch as any).mockResolvedValue({
            ok: true,
            status: 200
        });

        const resultPromise = uploadWithPartialFile(mockUrl, mockFile, {}, 1024, 0);

        // Fast-forward any delays
        await vi.runAllTimersAsync();

        const result = await resultPromise;

        expect(result.success).toBe(true);
        expect(result.statusCode).toBe(200);
        expect(result.data?.id).toBeDefined();
        expect(fetch).toHaveBeenCalledTimes(1);

        const formData = (vi.mocked(fetch).mock.calls[0][1]?.body as FormData);
        expect(formData.get('isDone')).toBe('true');
        expect(formData.get('totalChunks')).toBe('1');
    });

    it('should upload a large file in multiple chunks', async () => {
        (fetch as any).mockResolvedValue({
            ok: true,
            status: 200
        });

        // 11 byte file, 5 byte chunks -> 3 chunks
        const largeFile = new File(['0123456789a'], 'large.txt');
        const resultPromise = uploadWithPartialFile(mockUrl, largeFile, {}, 5, 0, 1);

        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.success).toBe(true);
        expect(result.statusCode).toBe(200);
        expect(result.data?.id).toBeDefined();
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('should retry on network error and succeed', async () => {
        (fetch as any)
            .mockRejectedValueOnce(new Error('Network error'))
            .mockResolvedValueOnce({ ok: true, status: 200 });

        const resultPromise = uploadWithPartialFile(mockUrl, mockFile, {}, 1024, 10);

        // First attempt fails, wait for delay
        await vi.runAllTimersAsync();

        const result = await resultPromise;

        expect(result.success).toBe(true);
        expect(result.statusCode).toBe(200);
        expect(result.data?.id).toBeDefined();
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should refresh token on 401 and retry successfully', async () => {
        (fetch as any)
            .mockResolvedValueOnce({ ok: false, status: 401 }) // First attempt: 401
            .mockResolvedValueOnce({ ok: true, status: 200 }); // Second attempt: Success

        const onUnauthorized = vi.fn().mockResolvedValue({
            headers: { 'Authorization': 'Bearer new-token' }
        });

        const resultPromise = uploadWithPartialFile(mockUrl, mockFile, { 'Authorization': 'Bearer old' }, 1024, 0, 1, onUnauthorized);

        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(onUnauthorized).toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.statusCode).toBe(200);
        expect(result.data?.id).toBeDefined();
        expect(fetch).toHaveBeenCalledTimes(2);

        // Check if second call used new headers
        const secondCallHeaders = (vi.mocked(fetch).mock.calls[1][1]?.headers as any);
        expect(secondCallHeaders['Authorization']).toBe('Bearer new-token');
    });

    it('should fail after maximum retries', async () => {
        (fetch as any).mockRejectedValue(new Error('Persistent error'));

        const resultPromise = uploadWithPartialFile(mockUrl, mockFile, {}, 1024, 0);

        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.success).toBe(false);
        expect(result.statusCode).toBe(200); // defaults to 200 if fetch throws before any response
        expect(result.data?.id).toBeDefined();
        expect(fetch).toHaveBeenCalledTimes(3); // Retry limit is 3 in code
    });

    it('should handle concurrency correctly', async () => {
        (fetch as any).mockResolvedValue({ ok: true, status: 200 });

        // 10 chunks, concurrency 5
        const largeFile = new File(['a'.repeat(100)], 'concurrency.txt');
        const resultPromise = uploadWithPartialFile(mockUrl, largeFile, {}, 10, 0, 5);

        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.success).toBe(true);
        expect(result.statusCode).toBe(200);
        expect(result.data?.id).toBeDefined();
        expect(fetch).toHaveBeenCalledTimes(10);
    });
});
