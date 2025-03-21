import { FetchDecorator, FetchInit, FetchInput, FetchReturn } from "./types";

export const withShortCircuit = ({
    failureThreshold = 5,
    resetTimeoutMs = 30000,
}: {
    failureThreshold?: number;
    resetTimeoutMs?: number;
}): FetchDecorator =>
(fetchFn) => {
    let failureCount = 0;
    let isOpen = false;
    let lastFailureTime = 0;

    return async (input: FetchInput, init?: FetchInit): FetchReturn => {
        const now = Date.now();

        if (isOpen) {
            if (now - lastFailureTime >= resetTimeoutMs) {
                isOpen = false;
                failureCount = 0;
            } else {
                throw new Error(
                    "Circuit breaker open: service temporarily unavailable",
                );
            }
        }

        try {
            const response = await fetchFn(input, init);
            if (!response.ok) {
                failureCount++;
                if (failureCount >= failureThreshold) {
                    isOpen = true;
                    lastFailureTime = now;
                    throw new Error("Circuit breaker tripped");
                }
            } else {
                failureCount = Math.max(0, failureCount - 1);
            }
            return response;
        } catch (error) {
            failureCount++;
            if (failureCount >= failureThreshold) {
                isOpen = true;
                lastFailureTime = now;
                throw new Error("Circuit breaker tripped");
            }
            throw error;
        }
    };
};
