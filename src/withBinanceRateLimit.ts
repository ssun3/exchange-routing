import { FetchFn, FetchInit, FetchInput, FetchReturn } from "./types";

type WindowState = {
    count: number;
    lastReset: number;
};

type RateLimitState = Record<string, WindowState>;

type RateLimitConfig = {
    limit: number;
    intervalMs: number;
    type: "REQUEST_WEIGHT" | "ORDERS" | "RAW_REQUESTS";
};

const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
    requestWeight: {
        limit: 6000,
        intervalMs: 60 * 1000,
        type: "REQUEST_WEIGHT",
    },
    orders10s: { limit: 100, intervalMs: 10 * 1000, type: "ORDERS" },
    orders1d: {
        limit: 200000,
        intervalMs: 24 * 60 * 60 * 1000,
        type: "ORDERS",
    },
    rawRequests: {
        limit: 61000,
        intervalMs: 5 * 60 * 1000,
        type: "RAW_REQUESTS",
    },
} as const;

const estimateCost = (url: string) => ({
    requestWeight: url.includes("/api/v3/depth")
        ? (parseInt(url.match(/limit=(\d+)/)?.[1] || "0", 10) <= 100 ? 5 : 25)
        : 1,
    orders10s: url.includes("/api/v3/order") ? 1 : 0,
    orders1d: url.includes("/api/v3/order") ? 1 : 0,
    rawRequests: 1,
});

const intervalToMs = (intervalNum: number, intervalLetter: string) => {
    const multipliers: Record<string, number> = {
        S: 1000,
        M: 60 * 1000,
        H: 60 * 60 * 1000,
        D: 24 * 60 * 60 * 1000,
    };
    return intervalNum * (multipliers[intervalLetter] || 0);
};

const parseRateLimitHeaders = (headers: Headers) => {
    const headerPattern = /^x-mbx-(used-weight|order-count)-(\d+)([SMHD])$/i;
    const result: Record<string, { count: number; intervalMs: number }> = {};

    for (const [name, value] of headers.entries()) {
        const match = name.match(headerPattern);
        if (match) {
            const [, type, intervalNum, intervalLetter] = match;
            const key = type === "used-weight" ? "REQUEST_WEIGHT" : "ORDERS";
            result[key + `-${intervalNum}${intervalLetter}`] = {
                count: parseInt(value, 10),
                intervalMs: intervalToMs(
                    parseInt(intervalNum, 10),
                    intervalLetter.toUpperCase(),
                ),
            };
        }
    }
    return result;
};

const updateStateFromResponse = (
    state: RateLimitState,
    url: string,
    response: Response,
    limits: Record<string, RateLimitConfig>,
) => {
    const newState = { ...state };
    const headerData = parseRateLimitHeaders(response.headers);
    const costs = estimateCost(url);
    for (const [key, config] of Object.entries(limits)) {
        if (config.type === "RAW_REQUESTS") {
            newState[key].count += costs[key as keyof typeof costs] || 0;
        } else {
            const headerKey = Object.keys(headerData).find((hk) =>
                hk.startsWith(config.type) &&
                headerData[hk].intervalMs === config.intervalMs
            );
            newState[key].count = headerKey
                ? headerData[headerKey].count
                : newState[key].count + (costs[key as keyof typeof costs] || 0);
        }
    }
    return newState;
};

const resetIfExpired = (state: WindowState, intervalMs: number, now: number) =>
    now - state.lastReset >= intervalMs ? { count: 0, lastReset: now } : state;

const calculateDelay = (
    state: WindowState,
    cost: number,
    limit: number,
    intervalMs: number,
    now: number,
) => state.count + cost > limit ? intervalMs - (now - state.lastReset) : 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const withBinanceRateLimit = (
    fetchFn: FetchFn,
    customLimits?: Record<string, RateLimitConfig>,
) => {
    const limits = { ...DEFAULT_LIMITS, ...customLimits };
    const initialState: RateLimitState = Object.fromEntries(
        Object.entries(limits).map((
            [key],
        ) => [key, { count: 0, lastReset: Date.now() }]),
    );
    let state = { ...initialState };

    return async (input: FetchInput, init?: FetchInit): FetchReturn => {
        const url = input.toString();
        const now = Date.now();
        const costs = estimateCost(url);

        // Reset expired windows
        state = Object.fromEntries(
            Object.entries(state).map(([key, windowState]) => [
                key,
                resetIfExpired(windowState, limits[key].intervalMs, now),
            ]),
        );

        // Calculate delays based on current state + estimated cost
        const delays = Object.entries(limits).map(([key, config]) =>
            calculateDelay(
                state[key],
                costs[key as keyof typeof costs] || 0,
                config.limit,
                config.intervalMs,
                now,
            )
        );
        const maxDelay = Math.max(...delays);

        if (maxDelay > 0) {
            await sleep(maxDelay);
            // Reset all windows after delay
            state = Object.fromEntries(
                Object.entries(limits).map((
                    [key],
                ) => [key, { count: 0, lastReset: Date.now() }]),
            );
        }

        // Execute fetch and update state with actual response
        const response = await fetchFn(input, init);
        state = updateStateFromResponse(state, url, response, limits);
        return response;
    };
};

// withTokenBucket
// withSlidingWindow
// withCallCounter
// withFixedWindow
