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
        readonly chain: Chain<T, Handlers, C>,
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
export interface HandlerInterceptor<T, C> extends Handler<T, C> {
    readonly [interceptorSym]: string;
}

export function handlerInterceptor<T, C>(name: string, interceptorFn: Handler<T, C>): HandlerInterceptor<T, C> {
    return Object.assign(interceptorFn, { [interceptorSym]: name });
}

type Identity<T> = T extends object ? {} & { [P in keyof T]: T[P] } : T;

export type PromiseOrValue<T> = Promise<T> | T;

export type ChainGenerator<R> = Generator<HandlerYieldRequest, R, HandlerYieldResponse>;

export type HandlerYieldRequest = Proceed<unknown> | Delegate<any, unknown>;
export type HandlerYieldResponse = unknown;
export type HandlerGenerator<T> = ChainGenerator<PromiseOrValue<T>>;

export type Handler<T, C1, C2 = C1> = (invocation: ChainInvocation<T, C1, C2>) => HandlerGenerator<T>;

export type Handlers = { [k: string]: OpaqueHandler };
export type ValidHandlerName<H extends Handlers, N extends string> = H[N] extends OpaqueHandler ? never : N;
type MergedHandlers<H extends Handlers, N extends string, T, C1, C2 = C1> = Identity<H & { [key in N]: Handler<T, C1, C2> }>

export interface ChainBuilder<T, H extends Handlers, C, D = C> {
    append<N extends string>(name: ValidHandlerName<H, N>, handler: Handler<T, D>):
        ChainBuilder<T, MergedHandlers<H, N, T, D>, C, D>;

    append<N extends string, E>(name: ValidHandlerName<H, N>, adapterHandler: Handler<T, D, E>):
        ChainBuilder<T, MergedHandlers<H, N, T, D, E>, C, E>;

    build(): Chain<T, H, C>;
}

export type InterceptorFor<H> = H extends Handler<infer T, infer C1, any> ? HandlerInterceptor<T, C1> : never;

export interface HandlerOperations<H extends OpaqueHandler> {
    addInterceptor(interceptor: InterceptorFor<H>): void;
    removeInterceptor(interceptor: InterceptorFor<H>): void;
}

export type HandlerArray<T, H> = {
    readonly [K in keyof H]: H[K] extends OpaqueHandler ? HandlerOperations<H[K]> : never
} & ReadonlyArray<NamedHandler<T>>;

export const handlersSym = Symbol('handlers');

export interface Chain<T, H extends Handlers = Handlers, C = unknown> {
    readonly id: string;
    invoke<U extends T, E extends C>(ctx: E): PromiseOrValue<U>;
    readonly handlers: HandlerArray<T, H>;
}

export type OpaqueHandler<T = any> = Handler<T, any>;

export type NamedHandler<T = unknown> = { name: string, handler: OpaqueHandler<T> };

export type Context<C> = PromiseOrValue<NonNullable<C>>;
export type OptionalContext<C> = Context<C> | void;

export const chainSym = Symbol('chain');
export const offsetSym = Symbol('offset');
export const createChildInvocation = Symbol('createChildInvocation');

const executionCounter = Symbol('executionCounter');
export class ExecutionId {
    private static [executionCounter] = 0;
    private readonly value = ExecutionId[executionCounter]++;
    toString() {
        return `{executionId:${this.value}}`;
    }
}


export interface ChainInvocation<T, C1, C2> {
    readonly executionId: ExecutionId;
    readonly context: C1;
    proceed(context: OptionalContext<C2>): ChainGenerator<T>;
    proceedAsync(context: OptionalContext<C2>): ChainGenerator<PromiseOrValue<T>>;
    delegate<U, C>(chain: Chain<U, Handlers, C>, context: Context<C>): ChainGenerator<U>;
    delegateAsync<U, C>(chain: Chain<U, Handlers, C>, context: Context<C>): ChainGenerator<PromiseOrValue<U>>;
    fork(ctx: C2): PromiseOrValue<T>;
}


export interface ChainInvocationInternal<T, C1, C2> extends ChainInvocation<T, C1, C2> {
    readonly [chainSym]: Chain<any>;
    readonly [offsetSym]: number;
    [createChildInvocation](chain: Chain<T, Handlers, C1>, context: C1, offset: number): ChainInvocationInternal<T, C1, C2>;
}

export type ChainInvocationFactory<T, C> =
    (executionId: ExecutionId, chain: Chain<T, Handlers, C>) => ChainInvocationInternal<T, C, unknown>;