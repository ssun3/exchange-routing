export interface RedisClient {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string, ...args: any[]) => Promise<string>;
    del: (key: string) => Promise<number>;
    quit: () => Promise<void>;
    mockClear?: () => void;
}

class MockRedisClient implements RedisClient {
    private store: Map<string, string>;

    constructor() {
        this.store = new Map();
    }

    async get(key: string): Promise<string | null> {
        return this.store.get(key) ?? null;
    }

    async set(key: string, value: string, ...args: any[]): Promise<string> {
        // Handle optional Redis arguments like 'EX' (expire in seconds)
        if (args[0] === "EX") {
            const ttl = parseInt(args[1], 10);
            setTimeout(() => this.store.delete(key), ttl * 1000);
        }
        this.store.set(key, value);
        return "OK";
    }

    async del(key: string): Promise<number> {
        const existed = this.store.has(key) ? 1 : 0;
        this.store.delete(key);
        return existed;
    }

    async quit(): Promise<void> {
        this.store.clear();
    }

    mockClear(): void {
        this.store.clear();
    }
}

export const createRedisMock = (): RedisClient => new MockRedisClient();
