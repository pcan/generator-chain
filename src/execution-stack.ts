import {
    ChainInvocationInternal, Handlers,
    InternalChain,
    chainSym, handlers, offsetSym
} from "./chain-commons";

import { ChainExecutionStackFrame } from './execution-stack-frame';

export class ChainExecutionStack<T, C> implements ChainExecutionStack<T, C> {

    static readonly __empty = emptyStackFrame();

    private readonly frames: ChainExecutionStackFrame<T, C>[];

    constructor(
        private readonly invocation: ChainInvocationInternal<T, C, unknown>,
        chain = invocation[chainSym],
        readonly offset = invocation[offsetSym]
    ) {
        if (chain[handlers].length === 0) {
            throw new Error('No handlers registered.');
        }
        this.frames = [new ChainExecutionStackFrame<T, C>([chain], invocation, offset)];
    }

    get empty() {
        return this.frames.length === 1 && this.topFrame.empty;
    }

    get head() {
        return this.topFrame.head;
    }

    split() {
        if (this.topFrame === ChainExecutionStack.__empty) {
            throw new Error('Cannot split an empty execution stack');
        }
        const frame = this.frames.pop()!;
        const asyncStack = new ChainExecutionStack(this.invocation, frame.topChain);
        asyncStack.frames.push(frame);

        if (this.frames.length === 0) {
            this.frames.push(ChainExecutionStack.__empty);
        }
        return asyncStack;
    }

    push(ctx: C, async: boolean) {
        if (async) {
            this.frames.push(this.topFrame.split());
        }
        this.topFrame.push(ctx);
    }

    delegate(chain: InternalChain<T, Handlers, C>) {
        this.topFrame.delegate(chain);
    }

    pop() {
        const frame = this.topFrame;
        frame.pop();
        if (frame.empty && this.frames.length > 1) {
            this.frames.pop();
        }
    }

    private get topFrame() {
        return this.frames[this.frames.length - 1];
    }
}


function emptyStackFrame() {

    type EmptyFrame = ChainExecutionStackFrame<any, any>;

    const emptyStackFrame = {
        empty: true,
        head: Object.freeze({}),
    } as EmptyFrame;

    (['split', 'push', 'pop', 'delegate'] as const)
        .reduce((obj, op) => (obj[op] = () => {
            throw new Error(`'${op}' operation not supported on empty stack frame`);
        }, obj), emptyStackFrame);

    return Object.freeze(emptyStackFrame) as EmptyFrame;
}