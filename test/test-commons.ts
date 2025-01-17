import sinon = require("sinon");
import {
    Chain,
    ChainInvocationInternal, HandlerGenerator, InternalChain, NamedHandler,
    chainSym, createChildInvocation, executionId, handlers, offsetSym
} from "../src/chain-commons";

type Invocation = ChainInvocationInternal<any, any, any> & { stub: sinon.SinonStub<any, Invocation> }
const id = ((i = 0) => () => i++)();

export function mockInvocation(handlers = [mockHandler()]) {
    const stub = sinon.stub();
    return cast<Invocation>({
        executionId: executionId(),
        [chainSym]: mockChain(handlers),
        [offsetSym]: 0,
        [createChildInvocation]: stub,
        stub
    });
}

export function mockStackFrame() {
    return {
        id: id(),
        split: sinon.mock(),
        delegate: sinon.spy(),
        push: sinon.spy(),
        pop: sinon.spy(),
        empty: false,
        head: mockGenerator() as HandlerGenerator<any> | undefined
    }
}

export function mockStack() {
    return {
        id: id(),
        get empty() { return this.emptyStub() },
        emptyStub: sinon.stub(),
        push: sinon.stub(),
        pop: sinon.stub(),
        delegate: sinon.stub(),
        split: sinon.stub(),
        head: {
            next: sinon.stub(),
            throw: sinon.stub(),
        }
    };
}

export function mockGenerator(): HandlerGenerator<any> {
    return cast<HandlerGenerator<any>>({
        id: id(),
        next: sinon.stub(),
        return: sinon.stub(),
        throw: sinon.stub(),
        [Symbol.iterator]: mockGenerator
    });
}

export function mockChain(mockHandlers = [mockHandler()]): InternalChain<any> {
    return cast<InternalChain<any>>({
        id: id(),
        [handlers]: mockHandlers
    });
}

export function mockHandler(): NamedHandler & { handler: sinon.SinonStub } {
    return { name: 'mock' + id(), handler: sinon.stub() };
}

export function cast<T>(x: any): T {
    return x;
}

