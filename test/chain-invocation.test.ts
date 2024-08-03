import 'mocha';
import { should, use } from 'chai';
import * as sinonChai from 'sinon-chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';

import * as executorModule from "../src/chain-executor";
import { execute } from "../src/chain-executor";
import { ChainInvocationInternal, Delegate, Proceed, chainSym, createChildInvocation, offsetSym } from '../src/chain-commons';
import * as stackModule from "../src/execution-stack";
import { mockChain, mockStack } from './test-commons';

use(sinonChai);
use(chaiAsPromised);
should();

describe('Chain Invocation', () => {

    let MockStack: sinon.SinonStub;
    let ExecutorSpy: sinon.SinonSpy;

    beforeEach(() => {
        MockStack = sinon.stub(stackModule, "ChainExecutionStack");
        ExecutorSpy = sinon.spy(executorModule, "execute");
    });

    afterEach(() => {
        MockStack.restore();
        ExecutorSpy.restore();
    });

    it(`Should return Proceed and Delegate generators`, () => {

        const stack = mockStack();
        const chain = mockChain();
        const delegateChain = mockChain();
        let invocation!: ChainInvocationInternal<any, any, any>;
        MockStack.callsFake(function (i) {
            invocation = i;
            return stack;
        });
        stack.emptyStub.returns(true);

        execute(chain, 1);

        invocation.proceed(1).next().should.be.deep.equal({
            value: new Proceed(1), done: false
        });

        invocation.proceedAsync(2).next().should.be.deep.equal({
            value: new Proceed(2, true), done: false
        });

        invocation.delegate(delegateChain, 3).next().should.be.deep.equal({
            value: new Delegate(delegateChain, 3), done: false
        });

        invocation.delegateAsync(delegateChain, 4).next().should.be.deep.equal({
            value: new Delegate(delegateChain, 4, true), done: false
        });

        MockStack.should.have.been.calledOnce;
    });

    it(`Should fork the execution`, () => {
        const stack = mockStack();
        const chain = mockChain();
        let invocation1!: ChainInvocationInternal<any, any, any>;
        let invocation2!: ChainInvocationInternal<any, any, any>;
        MockStack.callsFake(function (i) {
            invocation1 = i;
            return stack;
        });
        stack.emptyStub.returns(true);

        execute(chain, 1);
        MockStack.should.have.been.calledOnce;

        MockStack.callsFake(function (i) {
            invocation2 = i;
            return stack;
        });

        invocation1.fork(1);

        MockStack.should.have.been.calledTwice;

        invocation2.should.be.equal(invocation1);

    });

    it(`Should create a child invocation`, () => {
        const stack = mockStack();
        const chain = mockChain();
        const delegateChain = mockChain();
        let invocation!: ChainInvocationInternal<any, any, any>;
        MockStack.callsFake(function (i) {
            invocation = i;
            return stack;
        });
        stack.emptyStub.returns(true);

        execute(chain, 1);

        const child = invocation[createChildInvocation](delegateChain, 2, 3);
        child.should.not.be.equal(invocation);
        child[chainSym].should.be.equal(delegateChain);
        child[offsetSym].should.be.equal(3);
        child.executionId.should.be.equal(invocation.executionId);
        child.executionId.toString().should.match(/^\{executionId:\d+\}$/);
    });

});