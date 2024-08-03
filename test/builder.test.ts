import 'mocha';
import { should, use } from 'chai';
import * as sinonChai from 'sinon-chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';

import { chain, OpaqueHandler, handlerInterceptor } from "../src/index";
import * as executorModule from "../src/chain-executor";
import { InternalChain, handlers, interceptorSym } from '../src/chain-commons';
import { cast } from './test-commons';


use(sinonChai);
use(chaiAsPromised);
should();

describe('Chain Builder', () => {

    let mockExecute: sinon.SinonStub;

    before(() => mockExecute = sinon.stub(executorModule, "execute"));

    after(() => mockExecute.restore());

    it(`Should create a chain with a handler`, () => {
        const handler: OpaqueHandler<any> = function* () { };
        const c = chain('test')
            .append('h1', handler)
            .build();

        const internalChain = cast<InternalChain<any>>(c);

        internalChain[handlers].should.have.length(1);
        internalChain[handlers][0].handler.should.be.equal(handler);
        internalChain[handlers][0].name.should.be.equal('h1');

        c.interceptors.h1.add.should.be.instanceOf(Function);
        c.interceptors.h1.remove.should.be.instanceOf(Function);
    });

    it(`Should invoke a chain`, () => {
        const handler: OpaqueHandler<any> = function* () { };
        const c = chain('test')
            .append('h1', handler)
            .build();
        c.invoke(3);
        mockExecute.should.have.been.calledWith(c, 3);
    });

    it(`Should add a handler interceptor`, () => {
        const handler: OpaqueHandler<any> = function* () { };
        const c = chain('test')
            .append('h1', handler)
            .build();

        const interceptor = handlerInterceptor('i1', function* () { });
        interceptor[interceptorSym].should.be.equal('i1');
        c.interceptors.h1.add(interceptor);

        const internalChain = cast<InternalChain<any>>(c);

        internalChain[handlers].should.have.length(2);
        internalChain[handlers][0].handler.should.be.equal(interceptor);
        internalChain[handlers][1].handler.should.be.equal(handler);
    });

    it(`Should remove a handler interceptor`, () => {
        const handler: OpaqueHandler<any> = function* () { };
        const c = chain('test')
            .append('h1', handler)
            .build();

        const interceptor = handlerInterceptor('i1', function* () { });
        c.interceptors.h1.add(interceptor);

        c.interceptors.h1.remove(interceptor);
        
        const internalChain = cast<InternalChain<any>>(c);

        internalChain[handlers].should.have.length(1);
        internalChain[handlers][0].name.should.be.equal('h1');
        internalChain[handlers][0].handler.should.be.equal(handler);
    });


    it(`Should throw when removing a missing handler interceptor`, () => {
        const handler: OpaqueHandler<any> = function* () { };
        const c = chain('test')
            .append('h1', handler)
            .build();

        const interceptor = handlerInterceptor('i1', function* () { });

        (() => c.interceptors.h1.remove(interceptor))
            .should.throw('Handler not found.');
    });

});