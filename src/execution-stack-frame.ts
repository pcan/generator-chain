import {
    Chain, ChainInvocationInternal, HandlerGenerator,
    Handlers, createChildInvocation
} from "./chain-commons";

export class ChainExecutionStackFrame<T, C> {
    private readonly callStacks: HandlerGenerator<T>[][] = [[]];

    constructor(
        private readonly chains: Chain<T, Handlers, C>[],
        private readonly invocation: ChainInvocationInternal<T, C, unknown>,
        private readonly offset: number = 0
    ) { }

    get empty() {
        return this.callStacks.length === 1 && this.callStacks[0].length === 0;
    }

    get head() {
        const callStack = this.topCallStack;
        const head = callStack[callStack.length - 1];
        if (!head) {
            throw new Error('Cannot access head for empty callstack.');
        }
        return head;
    }

    split() {
        const frame = new ChainExecutionStackFrame<T, C>([this.topChain], this.invocation, this.nextHandlerIndex);
        this.trimTop();
        return frame;
    }

    push(ctx: C) {
        const chain = this.topChain;
        const index = this.nextHandlerIndex;
        if (index >= chain.handlers.length) {
            throw new Error('No further handlers registered.');
        }
        const invocation = this.invocation[createChildInvocation](chain, ctx, index + 1);
        this.topCallStack.push(chain.handlers[index].handler(invocation));
    }

    delegate(chain: Chain<T, Handlers, C>) {
        this.chains.push(chain);
        this.callStacks.push([]);
    }

    pop() {
        if (!this.topCallStack.pop()) {
            throw new Error('Cannot pop an empty callstack.');
        }
        this.trimTop();
    }

    private trimTop() {
        if (this.topCallStack.length === 0 && this.callStacks.length > 1) {
            this.callStacks.pop();
            this.chains.pop();
        }
    }

    private get nextHandlerIndex() {
        return this.topCallStack.length + (this.callStacks.length > 1 ? 0 : this.offset);
    }

    private get topCallStack() {
        return this.callStacks[this.callStacks.length - 1];
    }

    get topChain() {
        return this.chains[this.callStacks.length - 1];
    }

}
