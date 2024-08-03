import 'mocha';
import { should, use } from 'chai';
import * as sinonChai from 'sinon-chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';

import { execute } from "../src/chain-executor";
import { Delegate, Proceed } from '../src/chain-commons';
import * as stackModule from "../src/execution-stack";
import { mockChain, mockStack } from './test-commons';

use(sinonChai);
use(chaiAsPromised);
should();

describe('Chain Executor', () => {

    let MockStack: sinon.SinonStub;

    beforeEach(() => MockStack = sinon.stub(stackModule, "ChainExecutionStack"));

    afterEach(() => MockStack.restore());

    it(`Should execute one invocation step and return a value`, () => {
        const stack = mockStack();
        const chain = mockChain();
        MockStack.returns(stack);

        stack.emptyStub.onFirstCall().returns(false);
        stack.emptyStub.onSecondCall().returns(true);

        stack.head.next.returns({ value: 2, done: true });

        const result = execute(chain, 1);
        result.should.be.equal(2);

        stack.push.should.have.been.calledOnceWith(1, false)
            .and.calledBefore(stack.head.next);

        stack.head.next.firstCall.args.should.be.empty;
        stack.head.next.should.have.been.calledOnce
            .and.calledBefore(stack.pop);

        stack.pop.should.have.been.calledOnce
            .and.calledAfter(stack.push);
    });

    it(`Should execute one invocation step and return a promise`, async () => {
        const stack1 = mockStack();
        const stack2 = mockStack();
        stack1.split.returns(stack2);
        const chain = mockChain();
        MockStack.returns(stack1);

        stack1.emptyStub.onFirstCall().returns(false);
        stack1.emptyStub.onSecondCall().returns(true);
        stack2.emptyStub.onFirstCall().returns(true);

        stack1.head.next.returns({ value: Promise.resolve(2), done: true });

        const result = execute(chain, 1);
        await result.should.be.eventually.equal(2);

        stack1.push.should.have.been.calledOnceWith(1, false)
            .and.calledBefore(stack1.head.next);

        stack1.head.next.firstCall.args.should.be.empty;
        stack1.head.next.should.have.been.calledOnce
            .and.calledBefore(stack1.split);

        stack1.split.should.have.been.calledOnce
            .and.calledBefore(stack2.pop)

        stack2.pop.should.have.been.calledOnce;
        stack1.pop.should.not.have.been.called;
    });

    it(`Should execute multiple invocation steps and return a value`, () => {
        const stack = mockStack();
        const chain = mockChain();
        MockStack.returns(stack);

        [false, false, false, true]
            .forEach((v, i) => stack.emptyStub.onCall(i).returns(v));

        const next = stack.head.next;

        [
            { value: new Proceed(), done: false },
            { value: 7, done: true },
            { value: 4, done: true },
        ].forEach((v, i) => next.onCall(i).returns(v));

        const result = execute(chain, 1);

        result.should.be.equal(4);

        stack.push.firstCall.should.have.been.calledWith(1, false)
            .and.calledBefore(next.firstCall);

        next.firstCall.args.should.be.empty;
        next.firstCall.should.have.been.calledBefore(stack.push.secondCall);

        stack.push.secondCall.should.have.been.calledWith(1, false)
            .and.calledBefore(next.secondCall);

        next.secondCall.args.should.be.empty;
        next.secondCall.should.have.been.calledBefore(stack.pop.firstCall);

        next.thirdCall.should.have.been.calledWith(7)
            .and.calledBefore(stack.pop.secondCall);

        next.should.have.been.calledThrice;
        stack.push.should.have.been.calledTwice;
        stack.pop.should.have.been.calledTwice;
        stack.head.throw.should.not.have.been.called;
    });

    it(`Should throw when one invocation step throws`, () => {
        const stack = mockStack();
        const chain = mockChain();
        MockStack.returns(stack);

        stack.emptyStub.onFirstCall().returns(false);
        stack.emptyStub.onSecondCall().returns(true);

        stack.head.next.throws(new Error('foobar'));

        (() => execute(chain, 1)).should.throw('foobar');

        stack.push.should.have.been.calledOnceWith(1, false)
            .and.calledBefore(stack.head.next);

        stack.head.next.firstCall.args.should.be.empty;
        stack.head.next.should.have.been.calledOnce
            .and.calledBefore(stack.pop);

        stack.pop.should.have.been.calledOnce;
    });

    it(`Should execute one invocation step and reject`, async () => {
        const stack1 = mockStack();
        const stack2 = mockStack();
        stack1.split.returns(stack2);
        const chain = mockChain();
        MockStack.returns(stack1);

        stack1.emptyStub.onFirstCall().returns(false);
        stack1.emptyStub.onSecondCall().returns(true);
        stack2.emptyStub.onFirstCall().returns(true);

        stack1.head.next.returns({ value: Promise.reject(new Error('foobar')), done: true });

        const result = execute(chain, 1);
        await result.should.eventually.be.rejectedWith('foobar');

        stack1.push.should.have.been.calledOnceWith(1, false)
            .and.calledBefore(stack1.head.next);

        stack1.head.next.firstCall.args.should.be.empty;
        stack1.head.next.should.have.been.calledOnce
            .and.calledBefore(stack1.split);

        stack1.split.should.have.been.calledOnce;

        stack2.pop.should.not.have.been.called;
        stack1.pop.should.not.have.been.called;
    });

    it(`Should execute multiple invocation steps and return a fulfilled promise`, async () => {
        const stack1 = mockStack();
        const stack2 = mockStack();
        stack1.split.returns(stack2);
        const chain = mockChain();
        MockStack.returns(stack1);

        stack1.emptyStub.onFirstCall().returns(false);
        stack1.emptyStub.onSecondCall().returns(true);
        stack2.emptyStub.onFirstCall().returns(false);
        stack2.emptyStub.onSecondCall().returns(true);

        stack1.head.next.returns({
            value: new Proceed(Promise.resolve('foobar')),
            done: false
        });

        stack2.head.next.returns({
            value: 'baz',
            done: true
        });

        const result = execute(chain, 1);

        await result.should.eventually.be.equal('baz');

        stack1.push.should.have.been.calledOnceWith(1, false)
            .and.calledBefore(stack1.head.next);

        stack1.head.next.firstCall.args.should.be.empty;
        stack1.head.next.should.have.been.calledOnce
            .and.calledBefore(stack1.split);

        stack1.split.should.have.been.calledOnce
            .and.calledBefore(stack2.push)

        stack2.push.should.have.been.calledOnceWith('foobar', false)
            .and.calledBefore(stack2.head.next);

        stack2.head.next.firstCall.args.should.be.empty;
        stack2.head.next.should.have.been.calledOnce
            .and.calledBefore(stack2.pop);

        stack2.pop.should.have.been.calledOnce;
        stack1.pop.should.not.have.been.called;
    });

    it(`Should execute multiple invocation steps and return a rejected promise`, async () => {
        const stack1 = mockStack();
        const stack2 = mockStack();
        stack1.split.returns(stack2);
        const chain = mockChain();
        MockStack.returns(stack1);

        stack1.emptyStub.onFirstCall().returns(false);
        stack1.emptyStub.onSecondCall().returns(true);
        stack2.emptyStub.onFirstCall().returns(false);
        stack2.emptyStub.onSecondCall().returns(true);

        stack1.head.next.returns({
            value: new Proceed(Promise.reject('foobar')),
            done: false
        });

        stack2.head.throw.throws(new Error('foobar'));

        const result = execute(chain, 1);

        await result.should.eventually.be.rejectedWith('foobar');

        stack1.push.should.have.been.calledOnceWith(1, false)
            .and.calledBefore(stack1.head.next);

        stack1.head.next.firstCall.args.should.be.empty;
        stack1.head.next.should.have.been.calledOnce
            .and.calledBefore(stack1.split);

        stack1.split.should.have.been.calledOnce
            .and.calledBefore(stack2.head.throw)

        stack2.head.throw.should.have.been.calledOnceWith('foobar')
            .and.calledBefore(stack2.pop);

        stack2.pop.should.have.been.calledOnce;
        stack1.pop.should.not.have.been.called;

        stack2.push.should.not.have.been.called;
        stack2.head.next.should.not.have.been.called;

        stack2.head.throw.should.have.been.calledOnce;
    });

    it(`Should throw for unsupported yield operation`, () => {
        const stack = mockStack();
        const chain = mockChain();
        MockStack.returns(stack);

        stack.emptyStub.onFirstCall().returns(false);
        stack.emptyStub.onSecondCall().returns(true);
        stack.head.next.returns({
            value: '[invalid yield value]',
            done: false
        });

        (() => execute(chain, 1)).should.throw(`Unsupported yield operation: [invalid yield value]`);

    });

    it(`Should execute an invocation step and delegate`, () => {
        const stack = mockStack();
        const chain = mockChain();
        const delegateChain = mockChain();
        MockStack.returns(stack);

        [false, false, false, true]
            .forEach((v, i) => stack.emptyStub.onCall(i).returns(v));

        const next = stack.head.next;

        [
            { value: new Delegate(delegateChain, 99), done: false },
            { value: 7, done: true },
            { value: 4, done: true },
        ].forEach((v, i) => next.onCall(i).returns(v));

        const result = execute(chain, 1);

        result.should.be.equal(4);

        stack.push.firstCall.should.have.been.calledWith(1, false)
            .and.calledBefore(next.firstCall);

        next.firstCall.args.should.be.empty;
        next.firstCall.should.have.been.calledBefore(stack.push.secondCall);

        stack.delegate.should.have.been.calledOnceWith(delegateChain)
            .and.calledBefore(stack.push.secondCall);

        stack.push.secondCall.should.have.been.calledWith(99, false)
            .and.calledBefore(next.secondCall);

        next.secondCall.args.should.be.empty;
        next.secondCall.should.have.been.calledBefore(stack.pop.firstCall);

        next.thirdCall.should.have.been.calledWith(7)
            .and.calledBefore(stack.pop.secondCall);

        next.should.have.been.calledThrice;
        stack.push.should.have.been.calledTwice;
        stack.pop.should.have.been.calledTwice;
        stack.head.throw.should.not.have.been.called;
    });

    it(`Should delegate and return a fulfilled promise`, async () => {
        const stack1 = mockStack();
        const stack2 = mockStack();
        stack1.split.returns(stack2);
        const chain = mockChain();
        const delegateChain = mockChain();
        MockStack.returns(stack1);

        stack1.emptyStub.onFirstCall().returns(false);
        stack1.emptyStub.onSecondCall().returns(true);
        stack2.emptyStub.onFirstCall().returns(false);
        stack2.emptyStub.onSecondCall().returns(true);

        stack1.head.next.returns({
            value: new Delegate(delegateChain, Promise.resolve('foobar')),
            done: false
        });

        stack2.head.next.returns({
            value: 'baz',
            done: true
        });

        const result = execute(chain, 1);

        await result.should.eventually.be.equal('baz');

        stack1.push.should.have.been.calledOnceWith(1, false)
            .and.calledBefore(stack1.head.next);

        stack1.head.next.firstCall.args.should.be.empty;
        stack1.head.next.should.have.been.calledOnce
            .and.calledBefore(stack1.split);

        stack1.split.should.have.been.calledOnce
            .and.calledBefore(stack2.delegate);

        stack2.delegate.should.have.been.calledOnceWith(delegateChain)
            .and.calledBefore(stack2.push);

        stack2.push.should.have.been.calledOnceWith('foobar', false)
            .and.calledBefore(stack2.head.next);

        stack2.head.next.firstCall.args.should.be.empty;
        stack2.head.next.should.have.been.calledOnce
            .and.calledBefore(stack2.pop);

        stack2.pop.should.have.been.calledOnce;
        stack1.pop.should.not.have.been.called;
    });

    it(`Should execute one async invocation step and return a promise`, async () => {
        const stack1 = mockStack(); 
        const chain = mockChain();
        MockStack.returns(stack1);

        stack1.emptyStub.onFirstCall().returns(false);
        stack1.emptyStub.onSecondCall().returns(true);

        stack1.head.next.returns(Promise.resolve({ value: 2, done: true }));

        const result = execute(chain, 1);
        await result.should.be.eventually.equal(2);

        stack1.push.should.have.been.calledOnceWith(1, false)
            .and.calledBefore(stack1.head.next);

        stack1.head.next.firstCall.args.should.be.empty;
        stack1.head.next.should.have.been.calledOnce
            .and.calledBefore(stack1.pop);

        stack1.pop.should.have.been.calledOnce;
    });

    it(`Should execute one async invocation step and reject`, async () => {
        const stack1 = mockStack(); 
        const chain = mockChain();
        MockStack.returns(stack1);

        stack1.emptyStub.onFirstCall().returns(false);
        stack1.emptyStub.onSecondCall().returns(true);

        stack1.head.next.returns(Promise.reject(new Error('foobar')));

        const result = execute(chain, 1);
        await result.should.be.eventually.rejectedWith('foobar');

        stack1.push.should.have.been.calledOnceWith(1, false)
            .and.calledBefore(stack1.head.next);

        stack1.head.next.firstCall.args.should.be.empty;
        stack1.head.next.should.have.been.calledOnce
            .and.calledBefore(stack1.pop);

        stack1.pop.should.have.been.calledOnce;
    });

});
