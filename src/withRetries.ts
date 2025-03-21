import { FetchFn, FetchInit, FetchInput, FetchReturn } from "./types";

export interface RetryableError extends Error {
    [key: string]: any;
}

export interface RetryOptions {
    retries?: number;
    shouldRetry: (error: RetryableError) => boolean;
    getRetryDelay: (error: RetryableError, attempt: number) => number;
    maxDelay?: number;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const withRetries = (options: RetryOptions) => (fetchFn: FetchFn) => {
    const {
        retries = 3,
        shouldRetry,
        getRetryDelay = (_, attempt) => 200 * Math.pow(2, attempt - 1),
        maxDelay = 30 * 1000,
    } = options;

    return (input: FetchInput, init?: FetchInit): FetchReturn => {
        const attempt = async (currentAttempt: number): FetchReturn => {
            try {
                return await fetchFn(input, init);
            } catch (error) {
                const retryableError = error as RetryableError;
                if (currentAttempt > retries || !shouldRetry(retryableError)) {
                    throw error;
                }
                const delayMs = Math.min(
                    getRetryDelay(retryableError, currentAttempt),
                    maxDelay,
                );
                console.log(
                    `Attempt ${currentAttempt} failed: ${retryableError.message} ` +
                        `(status: ${retryableError.status || "N/A"}, code: ${
                            retryableError.code || "N/A"
                        }), ` +
                        `retrying in ${delayMs}ms`,
                );
                await delay(delayMs); // Use the custom delay function
                return attempt(currentAttempt + 1);
            }
        };
        return attempt(1);
    };
};
