import { RetryableError, withRetries } from "./withRetries";

export interface HttpError extends RetryableError {
    status: number;
    headers?: Headers;
}

const isBinanceRetryableError = (error: RetryableError): boolean => {
    const httpError = error as HttpError;
    if (httpError.status) {
        return (
            httpError.status === 429 || // Rate limited
            httpError.status === 418 || // IP ban
            httpError.status >= 500 // Server errors
        );
    }
    // Handle non-HTTP errors (e.g., network issues)
    return ["ETIMEDOUT", "ECONNRESET"].includes(httpError.code || "");
};

const getBinanceRetryDelay = (
    error: RetryableError,
    attempt: number,
): number => {
    const httpError = error as HttpError;
    if (httpError.status === 429 || httpError.status === 418) {
        const retryAfter = parseInt(
            httpError.headers?.get("Retry-After") || "1",
            10,
        );
        return retryAfter * 1000;
    }
    const baseBackoff = 200;
    return baseBackoff * Math.pow(2, attempt - 1);
};

export const withBinanceRetries = withRetries({
    retries: 3,
    shouldRetry: isBinanceRetryableError,
    getRetryDelay: getBinanceRetryDelay,
    maxDelay: 60 * 1000, // 1 minute max
});
