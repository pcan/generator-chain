import 'mocha';
import { should, use } from 'chai';
import * as sinonChai from 'sinon-chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';

import * as stackFrameModule from "../src/execution-stack-frame";
import { ChainExecutionStack } from "../src/execution-stack";
import { mockChain, mockInvocation, mockStackFrame } from './test-commons';

use(sinonChai);
use(chaiAsPromised);
should();

describe('Execution Stack', () => {

    let MockStackFrame: sinon.SinonStub;

    beforeEach(() => MockStackFrame = sinon.stub(stackFrameModule, "ChainExecutionStackFrame"));

    afterEach(() => MockStackFrame.restore());

    it('Should throw during creation with empty chain', () => {
        const invocation = mockInvocation([]);
        (() => new ChainExecutionStack(invocation))
            .should.throw('No handlers registered.');
    });

    it('Should create a new stack', () => {
        const frame = mockStackFrame();
        MockStackFrame.returns(frame);
        const invocation = mockInvocation();
        const stack = new ChainExecutionStack(invocation);
        stack.empty.should.be.false;
        stack.offset.should.be.equal(0);
        stack.head.should.be.equal(frame.head);
    });

    it('Should push an element on the stack', () => {
        const frame = mockStackFrame();
        MockStackFrame.returns(frame);
        const invocation = mockInvocation();
        const stack = new ChainExecutionStack(invocation);

        stack.push('foo', false);

        frame.push.should.have.been.calledOnceWith('foo');

        stack.empty.should.be.false;
        stack.head.should.be.equal(frame.head);
    });

    it('Should push multiple elements on the stack', () => {
        const frame = mockStackFrame();
        MockStackFrame.returns(frame);
        const invocation = mockInvocation();
        const stack = new ChainExecutionStack(invocation);

        stack.push('foo', false);
        frame.push.should.have.been.calledWith('foo');
        stack.empty.should.be.false;
        stack.head.should.be.equal(frame.head);

        stack.push('bar', false);
        frame.push.should.have.been.calledWith('bar');
        stack.empty.should.be.false;
        stack.head.should.be.equal(frame.head);
    });

    it('Should pop an element from the stack', () => {
        const frame = mockStackFrame();
        MockStackFrame.returns(frame);
        const invocation = mockInvocation();
        const stack = new ChainExecutionStack(invocation);

        stack.pop();
        stack.empty.should.be.false;
        frame.pop.should.have.been.calledOnce;
        (() => stack.head).should.not.throw();

        stack.pop();
        frame.pop.should.have.been.calledTwice;
        frame.empty = true;
        Object.defineProperty(frame, 'head', { get() { throw new Error() } });

        stack.empty.should.be.true;
        (() => stack.head).should.throw();
    });

    it('Should pop multiple elements from the stack', () => {
        const frame = mockStackFrame();
        MockStackFrame.returns(frame);
        const invocation = mockInvocation();
        const stack = new ChainExecutionStack(invocation);

        stack.pop();

        frame.pop.should.have.been.calledOnce;
        frame.empty = true;
        Object.defineProperty(frame, 'head', { get() { throw new Error() } });

        stack.empty.should.be.true;
        (() => stack.head).should.throw();
    });

    it('Should push a frame on the stack', () => {
        const frame = mockStackFrame();
        MockStackFrame.returns(frame);
        const invocation = mockInvocation();
        const stack = new ChainExecutionStack(invocation);

        const frame2 = mockStackFrame();
        frame.split.returns(frame2);

        stack.push('foo', true);
        frame.push.should.not.have.been.called;
        frame2.push.should.have.been.calledOnceWith('foo');

        stack.empty.should.be.false;
        stack.head.should.be.equal(frame2.head);
    });

    it('Should pop a frame from the stack', () => {
        const frame = mockStackFrame();
        MockStackFrame.returns(frame);
        const invocation = mockInvocation();
        const stack = new ChainExecutionStack(invocation);

        const frame2 = mockStackFrame();
        frame.split.returns(frame2);
        frame2.empty = true;

        stack.push('foo', true);

        stack.head.should.be.equal(frame2.head);

        stack.pop();
        frame.pop.should.not.have.been.called;
        frame2.pop.should.have.been.calledOnce;

        stack.head.should.be.equal(frame.head);
    });

    it('Should delegate a chain to the top frame', () => {
        const frame = mockStackFrame();
        MockStackFrame.returns(frame);
        const invocation = mockInvocation();
        const stack = new ChainExecutionStack(invocation);

        const frame2 = mockStackFrame();
        frame.split.returns(frame2);

        stack.push('foo', true);
        const chain = mockChain();
        stack.delegate(chain);
        frame.delegate.should.not.have.been.called;
        frame2.delegate.should.have.been.calledOnceWith(chain);
    });

    it('Should split a stack', () => {
        const frame = mockStackFrame();
        MockStackFrame.returns(frame);
        const invocation = mockInvocation();
        const stack = new ChainExecutionStack(invocation);

        const frame2 = mockStackFrame();
        frame.split.returns(frame2);

        stack.push('foo', true);
        stack.head.should.be.equal(frame2.head);
        const newStack = stack.split();

        stack.head.should.be.equal(frame.head);
        newStack.head.should.be.equal(frame2.head);
    });

    it('Should split an empty stack', () => {
        const frame = mockStackFrame();
        MockStackFrame.returns(frame);
        const invocation = mockInvocation();
        const stack = new ChainExecutionStack(invocation);

        const newStack = stack.split();

        stack.head.should.be.equal(ChainExecutionStack.__empty.head);
        newStack.head.should.be.equal(frame.head);
    });

    it('Should throw when calling any method on a split stack', () => {
        const frame = mockStackFrame();
        MockStackFrame.returns(frame);
        const invocation = mockInvocation();
        const stack = new ChainExecutionStack(invocation);

        stack.split();
        (() => stack.split()).should.throw('Cannot split an empty execution stack');
        (() => stack.push('foo', false)).should.throw(`'push' operation not supported on empty stack frame`);
        (() => stack.push('foo', true)).should.throw(`'split' operation not supported on empty stack frame`);
        (() => stack.pop()).should.throw(`'pop' operation not supported on empty stack frame`);
        (() => stack.delegate(mockChain())).should.throw(`'delegate' operation not supported on empty stack frame`);

    });

});

