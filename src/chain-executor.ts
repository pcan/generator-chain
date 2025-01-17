import {
    PromiseOrValue, HandlerYieldRequest, isDelegating,
    isProceeding, ChainInvocationInternal,
    chainSym, Context, ChainGenerator, Delegate, OptionalContext,
    Proceed, createChildInvocation, executionId, offsetSym,
    ExecutionId, InternalChain
} from "./chain-commons";
import { ChainExecutionStack } from "./execution-stack";

type Mutable<T> = { -readonly [P in keyof T]: T[P]; }

class ChainInvocation<T, C1, C2> implements ChainInvocationInternal<T, C1, C2> {

    readonly context!: C1;
    readonly [offsetSym]: number = 0;
    readonly [chainSym]: InternalChain<any>;

    private static readonly lazyForkGetter = {
        get<T, C1, C2>(this: ChainInvocation<T, C1, C2> & { boundFork: Function }) {
            return this.boundFork ??= ChainInvocation.prototype.fork.bind(this);
        }
    };

    constructor(
        readonly executionId: ExecutionId,
        chain: InternalChain<any>
    ) {
        this[chainSym] = chain;

        // optimization: the following property definition allows destructuring
        // of `this`, by instantiating a new bound function only when needed, 
        // to avoid overhead at each stackFrame.push()
        Object.defineProperty(this, 'fork', ChainInvocation.lazyForkGetter);
    }

    * proceed(context: OptionalContext<C2>): ChainGenerator<T> {
        return (yield new Proceed(context)) as T;
    }

    * proceedAsync(context: OptionalContext<C2>): ChainGenerator<PromiseOrValue<T>> {
        return (yield new Proceed(context, true)) as PromiseOrValue<T>;
    }

    * delegate<X, Y extends X, C>(chain: InternalChain<X, C>, context: Context<C>): ChainGenerator<Y> {
        return (yield new Delegate(chain, context)) as Y;
    }

    * delegateAsync<X, Y extends X, C>(chain: InternalChain<X, C>, context: Context<C>): ChainGenerator<PromiseOrValue<Y>> {
        return (yield new Delegate(chain, context, true)) as PromiseOrValue<Y>;
    }

    fork(ctx: C2): PromiseOrValue<T> {
        return execute.call<ChainInvocation<T, any, any>, [InternalChain<T, any>, C2], PromiseOrValue<T>>(
            this, this[chainSym], ctx
        );
    }

    [createChildInvocation](chain: InternalChain<T, C1>, context: C1, offset: number) {
        const invocation = new ChainInvocation(this.executionId, chain) as Mutable<this>;
        invocation.context = context;
        invocation[offsetSym] = offset;
        return invocation;
    }

}


export function execute<T, C>(this: ChainInvocation<T, C, any> | void, chain: InternalChain<T, C>, ctx: C): PromiseOrValue<T> {
    const invocation = this ?? new ChainInvocation<T, C, any>(executionId(), chain);
    const stack = new ChainExecutionStack(invocation);
    return new ChainExecutor(stack).run(ctx);
}

enum ExecutionStatus {
    Entering,
    Returning,
    Throwing
}

type StepExecutionResult<T> = IteratorResult<HandlerYieldRequest, PromiseOrValue<T>>;

class ChainExecutor<T, C> {
    private chainResult!: PromiseOrValue<T>;
    private error: unknown;
    private status = ExecutionStatus.Entering;

    constructor(private readonly stack: ChainExecutionStack<T, C>) { }

    run(ctx: C): PromiseOrValue<T> {
        this.status = ExecutionStatus.Entering;
        this.stack.push(ctx, false);
        return this.invokeHandlers(ctx);
    }

    private invokeHandlers(ctx: C): PromiseOrValue<T> {
        while (!this.stack.empty) {
            try {
                const stepExecutionResult = this.step();
                if (isPromise(stepExecutionResult)) { // async generator
                    return stepExecutionResult.then(
                        r => this.invokeHandlers(this.dispatchResult(r, ctx)),
                        err => (this.throw(err), this.invokeHandlers(ctx))
                    );
                } else { // sync generator
                    ctx = this.dispatchResult(stepExecutionResult, ctx);
                }

            } catch (err) {
                this.throw(err);
            }
        }

        return this.result();
    }

    private dispatchResult({ value, done }: StepExecutionResult<T>, ctx: C): C {
        if (done) { // generator is returning
            const isPromiseResult = isPromise(value);
            const result = isPromiseResult ? this.scheduleReturn(value, ctx) : value;
            this.return(result, isPromiseResult);
        } else { // generator is yielding
            if (isPromise(value.context)) {
                const result = this.scheduleEnter(value, ctx);
                this.return(result, true);
            } else {
                ctx = this.enter(value, ctx);
            }
        }
        return ctx;
    }

    private async scheduleEnter(value: HandlerYieldRequest, ctx: C) {
        const executor = new ChainExecutor(this.stack.split());
        try {
            const context = await (value.context as Promise<NonNullable<C>>);
            return executor.resumeEnter(value.withContext(context), ctx);
        } catch (err) {
            return executor.resumeThrow(err, ctx);
        }
    }

    private resumeEnter(value: HandlerYieldRequest, ctx: C) {
        ctx = this.enter(value, ctx);
        return this.invokeHandlers(ctx);
    }

    private async scheduleReturn(value: Promise<T>, ctx: C) {
        const executor = new ChainExecutor(this.stack.split());
        try {
            return executor.resumeReturn(await value, ctx);
        } catch (err) {
            return executor.resumeThrow(err, ctx);
        }
    }

    private resumeReturn(value: T, ctx: C) {
        this.return(value, false);
        return this.invokeHandlers(ctx);
    }

    private resumeThrow(err: unknown, ctx: C) {
        this.error = err;
        this.status = ExecutionStatus.Throwing;
        return this.invokeHandlers(ctx);
    }

    private return(value: PromiseOrValue<T>, asyncReturn: boolean) {
        this.chainResult = value;
        this.status = ExecutionStatus.Returning;
        if (!asyncReturn) {
            this.stack.pop();
        }
    }

    private enter(value: HandlerYieldRequest, ctx: C): C {
        if (isDelegating<T, C>(value)) {
            // generator is yielding a delegate(), switching to a new chain 
            this.stack.delegate(value.chain);
        } else if (!isProceeding<C>(value)) {
            // should never get here
            throw new Error(`Unsupported yield operation: ${value}`);
        }
        ctx = value.context as C ?? ctx;
        this.status = ExecutionStatus.Entering;
        this.stack.push(ctx, !!value.async);
        return ctx;
    }

    private throw(err: unknown) {
        this.error = err;
        this.status = ExecutionStatus.Throwing;
        this.stack.pop();
    }

    private step() {
        switch (this.status) {
            case ExecutionStatus.Entering:
                return this.stack.head.next();
            case ExecutionStatus.Returning:
                return this.stack.head.next(this.chainResult);
            case ExecutionStatus.Throwing:
                return this.stack.head.throw(this.error);
        }
    }

    private result() {
        if (this.status === ExecutionStatus.Throwing) {
            throw this.error;
        }
        return this.chainResult;
    }
}

function isPromise<T>(x: any): x is Promise<T> {
    return typeof x === 'object' && typeof x.then === 'function';
}
