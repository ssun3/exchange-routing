// withAgent (custom http or https agent) to set keepAlive, maxSocket, maxFreeSockets

import { FetchFn, FetchInit, FetchInput, FetchReturn } from "./types";

export const withConcurrencyLimit = (maxConcurrent: number) => {
    let active = 0;
    const queue: {
        fn: () => Promise<Response>;
        resolve: (value: Response) => void;
        reject: (reason: any) => void;
    }[] = [];

    return (fetchFn: FetchFn) => {
        return (input: FetchInput, init: FetchInit = {}): FetchReturn => {
            return new Promise((resolve, reject) => {
                const executeFetch = () => {
                    active++;
                    const fetchPromise = fetchFn(input, init);

                    fetchPromise
                        .then((result) => {
                            active--;
                            resolve(result);
                            if (queue.length) {
                                const next = queue.shift()!;
                                next.fn().then(next.resolve, next.reject);
                            }
                        })
                        .catch((error) => {
                            active--;
                            reject(error);
                            if (queue.length) {
                                const next = queue.shift()!;
                                next.fn().then(next.resolve, next.reject);
                            }
                        });

                    return fetchPromise;
                };

                if (active < maxConcurrent) {
                    executeFetch();
                } else {
                    queue.push({
                        fn: executeFetch,
                        resolve,
                        reject,
                    });
                }
            });
        };
    };
};
