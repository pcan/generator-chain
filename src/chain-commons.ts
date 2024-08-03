export class Proceed<C> {
    constructor(
        public context: OptionalContext<C>,
        public async?: boolean) {
    }
    withContext(context: Context<C>) {
        return new Proceed<C>(context, this.async);
    }
}

export function isProceeding<C>(x: any): x is Proceed<C> {
    return x instanceof Proceed;
}

export class Delegate<T, C> {
    constructor(
        readonly chain: InternalChain<T, C>,
        readonly context: Context<C>,
        readonly async?: boolean) {
    }
    withContext(context: Context<C>) {
        return new Delegate<T, C>(this.chain, context, this.async);
    }
}

export function isDelegating<T, C>(x: any): x is Delegate<T, C> {
    return x instanceof Delegate;
}

export const interceptorSym = Symbol('interceptor');
export interface HandlerInterceptor<T, C> extends Handler<T, C, T> {
    readonly [interceptorSym]: string;
}

export function handlerInterceptor<T, C>(name: string, interceptorFn: Handler<T, C, T>): HandlerInterceptor<T, C> {
    return Object.assign(interceptorFn, { [interceptorSym]: name });
}

type Identity<T> = T extends object ? {} & { [P in keyof T]: T[P] } : T;

export type PromiseOrValue<T> = Promise<T> | T;

export type ChainGenerator<R> = Generator<HandlerYieldRequest, R, HandlerYieldResponse>;

export type HandlerYieldRequest = Proceed<unknown> | Delegate<any, unknown>;
export type HandlerYieldResponse = unknown;
export type HandlerGenerator<T> = ChainGenerator<PromiseOrValue<T>>;

export type Handler<T, C1, U = T, C2 = C1> = (invocation: ChainInvocation<U, C1, C2>) => HandlerGenerator<T>;

export type Handlers = Record<string, OpaqueHandler>;
export type UniqueHandlerName<H extends Handlers, N extends string> = N extends keyof H ? never : N;
type MergedHandlers<H extends Handlers, N extends string, T, C1, U, C2 = C1> = Identity<H & { [key in N]: Handler<T, C1, U, C2> }>

export interface ChainStartBuilder {
    append<N extends string, T, C1, U, C2>(name: N, handler: Handler<T, C1, U, C2>):
        ChainBuilder<T, C1, MergedHandlers<{}, N, T, C1, U, C2>, U, C2>;
}

export interface ChainBuilder<T, C, H extends Handlers, U, D = C> {
    append<N extends string, V>(name: UniqueHandlerName<H, N>, handler: Handler<U, D, V>):
        ChainBuilder<T, C, MergedHandlers<H, N, U, D, V>, V, D>;

    append<N extends string, V, E>(name: UniqueHandlerName<H, N>, adapterHandler: Handler<U, D, V, E>):
        ChainBuilder<T, C, MergedHandlers<H, N, U, D, V, E>, V, E>;

    build(): Chain<T, C, H>;
}

export type InterceptorFor<H> = H extends Handler<infer T, infer C1, any, any> ? HandlerInterceptor<T, C1> : never;

export interface InterceptorOperations<H extends OpaqueHandler> {
    add(interceptor: InterceptorFor<H>): void;
    remove(interceptor: InterceptorFor<H>): void;
}

export type Interceptors<H extends Handlers> = {
    readonly [K in keyof H]: H[K] extends OpaqueHandler ? InterceptorOperations<H[K]> : never
};

export const handlers = Symbol('handlers');

export interface Chain<T, C = unknown, H extends Handlers = Handlers> {
    readonly id: string;
    invoke<U extends T, E extends C>(ctx: E): PromiseOrValue<U>;
    readonly interceptors: Interceptors<H>;
}

export interface InternalChain<T, C = unknown> extends Chain<T, C, Handlers> {
    readonly [handlers]: ReadonlyArray<NamedHandler<T>>;
}

export type OpaqueHandler<T = any> = Handler<T, any, any>;

export type NamedHandler<T = unknown> = { name: string, handler: OpaqueHandler<T> };

export type Context<C> = PromiseOrValue<NonNullable<C>>;
export type OptionalContext<C> = Context<C> | void;

export const chainSym = Symbol('chain');
export const offsetSym = Symbol('offset');
export const createChildInvocation = Symbol('createChildInvocation');

const executionCounter = Symbol('executionCounter');
class _ExecutionId implements ExecutionId {
    private static [executionCounter] = 0;
    private readonly value = _ExecutionId[executionCounter]++;
    toString() {
        return `{executionId:${this.value}}`;
    }
}

export function executionId(): ExecutionId {
    return new _ExecutionId();
}

export interface ExecutionId {
    toString(): string;
}

type NextContext<C1, C2> = C1 extends C2 ? OptionalContext<C2> : Context<C2>;

export interface ChainInvocation<T, C1, C2> {
    readonly executionId: ExecutionId;
    readonly context: C1;
    proceed(context: NextContext<C1, C2>): ChainGenerator<T>;
    proceedAsync(context: NextContext<C1, C2>): ChainGenerator<PromiseOrValue<T>>;
    delegate<X, Y extends X, C>(chain: Chain<X, C>, context: Context<C>): ChainGenerator<Y>;
    delegateAsync<X, Y extends X, C>(chain: Chain<X, C>, context: Context<C>): ChainGenerator<PromiseOrValue<Y>>;
    fork(ctx: C2): PromiseOrValue<T>;
}


export interface ChainInvocationInternal<T, C1, C2> extends ChainInvocation<T, C1, C2> {
    readonly [chainSym]: InternalChain<any>;
    readonly [offsetSym]: number;
    [createChildInvocation](chain: InternalChain<T, C1>, context: C1, offset: number): ChainInvocationInternal<T, C1, C2>;
}

export type ChainInvocationFactory<T, C> =
    (executionId: ExecutionId, chain: Chain<T, C>) => ChainInvocationInternal<T, C, unknown>;