import { FetchFn } from "./types";

export const combineSignals = (...signals: AbortSignal[]): AbortSignal => {
    const controller = new AbortController();
    const abort = () => controller.abort();

    signals.forEach((signal) => {
        if (signal.aborted) abort();
        else signal.addEventListener("abort", abort, { once: true });
    });

    return controller.signal;
};

export const isNonEmpty = <T>(value: T | null | undefined): value is T => {
    return value !== null && value !== undefined;
};

export const withTimeout = (timeout: number) => (fetchFn: FetchFn) => {
    return (
        input: Parameters<FetchFn>[0],
        init: Parameters<FetchFn>[1] = {},
    ): ReturnType<FetchFn> => {
        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => timeoutController.abort(), timeout);

        const requestSignal = input instanceof Request ? input.signal : null;
        const signals = [
            requestSignal,
            init.signal,
            timeoutController.signal,
        ].filter(isNonEmpty);
        const signal = combineSignals(...signals);
        return fetchFn(input, { ...init, signal }).finally(() =>
            clearTimeout(timeoutId)
        );
    };
};
