import 'mocha';
import { should, use } from 'chai';
import * as sinonChai from 'sinon-chai';
import * as chaiAsPromised from 'chai-as-promised';

import { ChainExecutionStackFrame } from "../src/execution-stack-frame";
import { mockChain, mockGenerator, mockHandler, mockInvocation } from './test-commons';

use(sinonChai);
use(chaiAsPromised);
should();

describe('Execution Stack Frame', () => {

    it('Should create a new stack frame', () => {
        const invocation = mockInvocation();
        const chain = mockChain();
        const frame = new ChainExecutionStackFrame([chain], invocation);
        frame.empty.should.be.true;
        (() => frame.head).should.throw('Cannot access head for empty callstack.');
        frame.topChain.should.be.equal(chain);
    });

    it('Should push an element on the stack frame', () => {
        const invocation = mockInvocation();
        const handler = mockHandler();
        const generator = mockGenerator();
        handler.handler.returns(generator);

        const chain = mockChain([handler]);

        const frame = new ChainExecutionStackFrame([chain], invocation);

        frame.push({});
        frame.empty.should.be.false;
        handler.handler.should.have.been.calledOnce;
        frame.head.should.be.equal(generator);
    });

    it('Should push nultiple element on the stack frame', () => {
        const rootInvocation = mockInvocation();
        const invocation1 = mockInvocation();
        const invocation2 = mockInvocation();
        rootInvocation.stub.onFirstCall().returns(invocation1);
        rootInvocation.stub.onSecondCall().returns(invocation2);

        const [handler1, handler2] = [mockHandler(), mockHandler()];
        const [generator1, generator2] = [mockGenerator(), mockGenerator()];
        handler1.handler.returns(generator1);
        handler2.handler.returns(generator2);

        const chain = mockChain([handler1, handler2]);

        const frame = new ChainExecutionStackFrame([chain], rootInvocation);

        frame.push('a');
        frame.empty.should.be.false;
        frame.head.should.be.equal(generator1);
        handler1.handler.should.have.been.calledOnceWith(invocation1);
        handler2.handler.should.not.have.been.called;
        rootInvocation.stub.firstCall.should.have.been.calledWith(chain, 'a', 1);

        frame.push('b');
        frame.empty.should.be.false;
        frame.head.should.be.equal(generator2);
        handler1.handler.should.have.been.calledOnceWith(invocation1);
        handler2.handler.should.have.been.calledOnceWith(invocation2);
        rootInvocation.stub.secondCall.should.have.been.calledWith(chain, 'b', 2);
    });

    it('Should push an element on the stack frame using handlers from a given offset', () => {
        const invocation = mockInvocation();
        const handlers = [mockHandler(), mockHandler(), mockHandler()];
        const generators = [mockGenerator(), mockGenerator(), mockGenerator()];
        handlers.forEach((h, i) => h.handler.returns(generators[i]));

        const chain = mockChain(handlers);

        const frame = new ChainExecutionStackFrame([chain], invocation, 2);

        frame.push({});
        frame.empty.should.be.false;
        handlers[0].handler.should.not.have.been.called;
        handlers[1].handler.should.not.have.been.called;
        handlers[2].handler.should.have.been.calledOnce;
        frame.head.should.be.equal(generators[2]);
    });

    it('Should pop an element from the stack frame', () => {
        const invocation = mockInvocation();
        const handler = mockHandler();
        const generator = mockGenerator();
        handler.handler.returns(generator);

        const chain = mockChain([handler]);

        const frame = new ChainExecutionStackFrame([chain], invocation);

        frame.push({});

        frame.pop();

        frame.empty.should.be.true;
        handler.handler.should.have.been.calledOnce;
        (() => frame.head).should.throw();
    });

    it('Should pop multiple elements from the stack frame', () => {
        const invocation = mockInvocation();
        const [handler1, handler2] = [mockHandler(), mockHandler()];
        const [generator1, generator2] = [mockGenerator(), mockGenerator()];
        handler1.handler.returns(generator1);
        handler2.handler.returns(generator2);

        const chain = mockChain([handler1, handler2]);

        const frame = new ChainExecutionStackFrame([chain], invocation);

        frame.push('a');
        frame.push('b');

        frame.head.should.be.equal(generator2);

        frame.pop();
        frame.head.should.be.equal(generator1);

        frame.pop();
        frame.empty.should.be.true;
        (() => frame.head).should.throw();
    });

    it('Should throw when there are no further handlers', () => {

        const invocation = mockInvocation();
        const chain = mockChain();

        const frame = new ChainExecutionStackFrame([chain], invocation);

        frame.push('a');

        (() => frame.push('b')).should.throw('No further handlers registered.');
    });

    it('Should delegate the execution to a new chain', () => {
        const invocation = mockInvocation();
        const [handler1, handler2] = [mockHandler(), mockHandler()];
        const [generator1, generator2] = [mockGenerator(), mockGenerator()];
        handler1.handler.returns(generator1);
        handler2.handler.returns(generator2);

        const chain1 = mockChain([handler1]);
        const chain2 = mockChain([handler2]);

        const frame = new ChainExecutionStackFrame([chain1], invocation);
        frame.push('a');
        frame.topChain.should.be.equal(chain1);
        frame.head.should.be.equal(generator1);
        invocation.stub.firstCall.should.have.been.calledWith(chain1, 'a', 1);

        frame.delegate(chain2);
        frame.push('b');

        frame.topChain.should.be.equal(chain2);
        frame.head.should.be.equal(generator2);
        invocation.stub.secondCall.should.have.been.calledWith(chain2, 'b', 1);
    });

    it('Should throw when popping after delegate', () => {
        const invocation = mockInvocation();

        const chain1 = mockChain();
        const chain2 = mockChain();

        const frame = new ChainExecutionStackFrame([chain1], invocation);
        frame.push('a');

        frame.delegate(chain2);

        (() => frame.pop()).should.throw('Cannot pop an empty callstack.');

    });

    it('Should pop after delegate and push', () => {
        const invocation = mockInvocation();
        const [handler1, handler2] = [mockHandler(), mockHandler()];
        const [generator1, generator2] = [mockGenerator(), mockGenerator()];
        handler1.handler.returns(generator1);
        handler2.handler.returns(generator2);

        const chain1 = mockChain([handler1]);
        const chain2 = mockChain([handler2]);

        const frame = new ChainExecutionStackFrame([chain1], invocation);
        frame.push('a');

        frame.delegate(chain2);

        frame.push('b');

        frame.pop();

        frame.topChain.should.be.equal(chain1);
        frame.head.should.be.equal(generator1);
    });

    it('Should split to a new frame', () => {
        const invocation = mockInvocation();
        const [handler1, handler2] = [mockHandler(), mockHandler()];
        const [generator1, generator2] = [mockGenerator(), mockGenerator()];
        handler1.handler.returns(generator1);
        handler2.handler.returns(generator2);
        const chain = mockChain([handler1, handler2]);

        const frame1 = new ChainExecutionStackFrame([chain], invocation);
        frame1.push('a'); 
        invocation.stub.firstCall.should.have.been.calledWith(chain, 'a', 1);

        const frame2 = frame1.split();
        frame2.push('b');
        invocation.stub.secondCall.should.have.been.calledWith(chain, 'b', 2);

        frame1.head.should.be.equal(generator1);
        frame2.head.should.be.equal(generator2);
    });

});
