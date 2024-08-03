import 'mocha';
import { should, use } from 'chai';
import * as sinonChai from 'sinon-chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';

import { chain,  OpaqueHandler, handlerInterceptor } from "../src/index";
import * as executorModule from "../src/chain-executor";
import { interceptorSym } from '../src/chain-commons';


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

        c.handlers.should.have.length(1);
        c.handlers[0].handler.should.be.equal(handler);
        c.handlers[0].name.should.be.equal('h1');

        c.handlers.h1.addInterceptor.should.be.instanceOf(Function);
        c.handlers.h1.removeInterceptor.should.be.instanceOf(Function);
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
        c.handlers.h1.addInterceptor(interceptor);

        c.handlers.should.have.length(2);

        c.handlers[0].handler.should.be.equal(interceptor);
        c.handlers[1].handler.should.be.equal(handler);
    });

    it(`Should remove a handler interceptor`, () => {
        const handler: OpaqueHandler<any> = function* () { };
        const c = chain('test')
            .append('h1', handler)
            .build();

        const interceptor = handlerInterceptor('i1', function* () { });
        c.handlers.h1.addInterceptor(interceptor);

        c.handlers.h1.removeInterceptor(interceptor);

        c.handlers.should.have.length(1);
        c.handlers[0].handler.should.be.equal(handler);
        c.handlers[0].name.should.be.equal('h1');
    });


    it(`Should throw when removing a missing handler interceptor`, () => {
        const handler: OpaqueHandler<any> = function* () { };
        const c = chain('test')
            .append('h1', handler)
            .build();

        const interceptor = handlerInterceptor('i1', function* () { });

        (() => c.handlers.h1.removeInterceptor(interceptor))
            .should.throw('Handler not found.');
    });

});