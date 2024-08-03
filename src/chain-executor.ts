import {
    Chain, Handlers, PromiseOrValue, HandlerYieldRequest, isDelegating, isProceeding, ChainInvocationInternal,
    chainSym, Context, ChainGenerator, Delegate, OptionalContext, Proceed, createChildInvocation, executionId, offsetSym, ExecutionId
} from "./chain-commons";
import { ChainExecutionStack } from "./execution-stack";

type Mutable<T> = { -readonly [P in keyof T]: T[P]; }

class ChainInvocation<T, C1, C2> implements ChainInvocationInternal<T, C1, C2> {

    readonly context!: C1;
    readonly [offsetSym]: number = 0;
    readonly [chainSym]: Chain<any>;

    private static lazyForkGetter = {
        get<T, C1, C2>(this: ChainInvocation<T, C1, C2> & { boundFork: Function }) {
            return this.boundFork ??= ChainInvocation.prototype.fork.bind(this);
        }
    };

    constructor(
        readonly executionId: ExecutionId,
        chain: Chain<any>
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

    * delegate<U, C>(chain: Chain<U, Handlers, C>, context: Context<C>): ChainGenerator<U> {
        return (yield new Delegate(chain, context)) as U;
    }

    * delegateAsync<U, C>(chain: Chain<U, Handlers, C>, context: Context<C>): ChainGenerator<PromiseOrValue<U>> {
        return (yield new Delegate(chain, context, true)) as PromiseOrValue<U>;
    }

    fork(ctx: C2): PromiseOrValue<T> {
        return execute.call<ChainInvocation<T, any, any>, [Chain<T, Handlers, any>, C2], PromiseOrValue<T>>(
            this, this[chainSym], ctx
        );
    }

    [createChildInvocation](chain: Chain<T, Handlers, C1>, context: C1, offset: number) {
        const invocation = new ChainInvocation(this.executionId, chain) as Mutable<this>;
        invocation.context = context;
        invocation[offsetSym] = offset;
        return invocation;
    }

}


export function execute<T, C>(this: ChainInvocation<T, C, any> | void, chain: Chain<T, Handlers, C>, ctx: C): PromiseOrValue<T> {
    const invocation = this ?? new ChainInvocation<T, C, any>(executionId(), chain);
    const stack = new ChainExecutionStack(invocation);
    return new ChainExecutor(stack).run(ctx);
}

enum ExecutionStatus {
    Entering,
    Returning,
    Throwing
}

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

                const { value, done } = this.step();

                if (done) { // generator is returning
                    const asyncReturn = isPromise(value);
                    const result = asyncReturn ? this.scheduleReturn(value, ctx) : value;
                    this.return(result, asyncReturn);
                } else { // generator is yielding
                    if (isPromise(value.context)) {
                        const result = this.scheduleEnter(value, ctx);
                        this.return(result, true);
                    } else {
                        ctx = this.enter(value, ctx);
                    }
                }

            } catch (err) {
                this.throw(err);
            }
        }

        return this.result();
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
