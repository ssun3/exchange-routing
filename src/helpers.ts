import { FetchDecorator, FetchFn } from "./types";

export type resolveValue = <V>(
    value: V,
    ...args: V extends (...args: infer P) => any ? P : never[]
) => V extends (...args: any[]) => infer R ? R : V;

export const resolveValue: resolveValue = (
    value,
    ...args
) => typeof value === "function" ? (value as any)(...args) : value;

export const pipe =
    (...fns: FetchDecorator[]) => (initialFn: FetchFn): FetchFn =>
        fns.reduce((v, f) => f(v), initialFn);
