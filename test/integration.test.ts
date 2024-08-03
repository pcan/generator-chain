import 'mocha';
import { should, use } from 'chai';
import * as sinonChai from 'sinon-chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';

import {
    Handler, handlerInterceptor, chain,
    ChainBuilder
} from '../src/index';

use(sinonChai);
use(chaiAsPromised);
should();

describe('Integration', () => {

    it(`Should create a chain with one handler`, () => {
        const h = function* () { return 1 };
        const c = chain('testChain').append('h', h).build();
        c.invoke({}).should.be.equal(1);
    });

    it(`Should create a chain with multiple handlers`, () => {
        const h1: Handler<number, object> = function* ({ proceed }) { return yield* proceed(); };
        const h2: Handler<number, object> = function* ({ proceed }) { return yield* proceed(); };
        const h3: Handler<number, object> = function* () { return 1 };
        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .append('h3', h3)
            .build();
        c.invoke({}).should.be.equal(1);
    });

    it(`Should create a chain with multiple handlers having different return types`, () => {
        const h1: Handler<number, object, boolean> = function* ({ proceed }) {
            return (yield* proceed()) === true ? 1 : 0;
        };
        const h2: Handler<boolean, object, string> = function* ({ proceed }) {
            return (yield* proceed()) === 'true';
        };
        const h3: Handler<string, object, void> = function* () {
            return 'true'
        };
        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .append('h3', h3)
            .build();
        c.invoke({}).should.be.equal(1);
    });

    it(`Should throw for handlers yielding an unsupported value`, () => {
        function* fakeProceed(): Generator<object, number, number> {
            return yield ({ toString() { return 'foobar' } });
        }
        const h1: Handler<number, object> = function* ({ proceed }) {
            return yield* (fakeProceed() as ReturnType<typeof proceed>);
        };
        const c = chain('testChain')
            .append('h1', h1)
            .build();
        (() => c.invoke({})).should.throw('Unsupported yield operation: foobar');
    });

    it(`Should allow handlers to process the returned value`, () => {
        const h1: Handler<number, object> = function* ({ proceed }) { return 1 + (yield* proceed()); };
        const h2: Handler<number, object> = function* ({ proceed }) { return 2 * (yield* proceed()); };
        const h3: Handler<number, object> = function* () { return 3 };
        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .append('h3', h3)
            .build();
        c.invoke({}).should.be.equal(7);
    });

    it(`Should allow handlers to process the context`, () => {
        const h1: Handler<number, { x: number }> = function* ({ proceed, context: { x } }) {
            return yield* proceed({ x: x * 2 });
        };
        const h2: Handler<number, { x: number }> = function* ({ proceed, context: { x } }) {
            return yield* proceed({ x: x + 1 });
        };
        const h3: Handler<number, { x: number }> = function* ({ context: { x } }) { return x };
        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .append('h3', h3)
            .build();
        c.invoke({ x: 3 }).should.be.equal(7);
    });

    it(`Should throw when there are no further handlers`, () => {
        const h1: Handler<number, object> = function* ({ proceed }) { return yield* proceed(); };
        const h2: Handler<number, object> = function* ({ proceed }) { return yield* proceed(); };
        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .build();
        (() => c.invoke({})).should.throw('No further handlers registered.');
    });

    it(`Should rethrow the error thrown by handlers`, () => {
        const h1: Handler<number, object> = function* ({ proceed }) { return yield* proceed(); };
        const h2: Handler<number, object> = function* () { throw new Error('foobar') };
        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .build();
        (() => c.invoke({})).should.throw('foobar');
    });

    it(`Should allow handlers to catch errors thrown by nested handlers`, () => {
        const h1: Handler<number, object> = function* ({ proceed }) { return yield* proceed(); };
        const h2: Handler<number, object> = function* ({ proceed }) {
            try {
                return yield* proceed();
            } catch (e: any) {
                return e.message.length;
            }
        };
        const h3: Handler<number, object> = function* () { throw new Error('foobar') };
        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .append('h3', h3)
            .build();
        c.invoke({}).should.be.equal(6);
    });

    it(`Should allow handlers to catch errors thrown by nested handlers and rethrow`, async () => {
        const h1: Handler<number, object> = function* ({ proceed }) { return yield* proceed(); };
        const h2: Handler<number, object> = function* ({ proceed }) {
            try {
                return yield* proceed();
            } catch (e: any) {
                throw new Error(e.message + 'baz');
            }
        };
        const h3: Handler<number, object> = function* () { throw new Error('foobar') };
        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .append('h3', h3)
            .build();
        (() => c.invoke({})).should.throw('foobarbaz');
    });

    it(`Should handle a rejected promise`, async () => {
        const h1: Handler<number, { x: number }> = function* ({ proceed }) {
            return yield* proceed();
        };
        const h2: Handler<number, { x: number }> = function* ({ proceed, context: { x } }) {
            try {
                return yield* proceed(Promise.reject(new Error('foobar')));
            } catch {
                return 1;
            }
        };
        const h3: Handler<number, { x: number }> = function* ({ context: { x } }) { return x + 2; };
        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .append('h3', h3)
            .build();
        const result = c.invoke({ x: 2 });
        result.should.be.instanceOf(Promise);
        await result.should.eventually.be.equal(1);
    })

    it(`Should create a chain with an adapter and a handler`, () => {
        const a: Handler<number, { x: number }, number, { y: number }> = function* ({ proceed, context: { x } }) {
            return yield* proceed({ y: x });
        };
        const h: Handler<number, { y: number }> = function* ({ context: { y } }) {
            return y;
        };
        const c = chain('testChain')
            .append('a', a).append('h', h).build();
        c.invoke({ x: 2 }).should.be.equal(2);
    });

    it(`Should create a chain with multiple adapters and handlers`, () => {
        const a1: Handler<number, { x: number }, number, { y: number }> = function* ({ proceed, context: { x } }) {
            return yield* proceed({ y: x });
        };
        const a2: Handler<number, { y: number }, number, { z: number }> = function* ({ proceed, context: { y } }) {
            return yield* proceed({ z: y });
        };
        const h1: Handler<number, { x: number }> = function* ({ proceed }) {
            return yield* proceed();
        };
        const h2: Handler<number, { y: number }> = function* ({ proceed }) {
            return yield* proceed();
        };
        const h3: Handler<number, { z: number }> = function* ({ context: { z } }) {
            return z;
        };
        const c = chain('testChain')
            .append('h1', h1)
            .append('a1', a1)
            .append('h2', h2)
            .append('a3', a2)
            .append('h3', h3)
            .build();
        c.invoke({ x: 2 }).should.be.equal(2);
    });

    it(`Should delegate the execution to another chain`, () => {
        const h1: Handler<number, { x: number }> = function* ({ proceed }) { return yield* proceed(); };
        const h2: Handler<number, { x: number }> = function* ({ proceed }) { return yield* proceed(); };
        const h3: Handler<number, { x: number }, { y: number }> = function* ({ delegate, context: { x } }) {
            return yield* delegate(c2, { y: x * 2 });
        };
        const c1 = chain('testChain1')
            .append('h1', h1).append('h2', h2).append('h3', h3).build();

        const h4: Handler<number, { y: number }> = function* ({ proceed }) { return yield* proceed(); };
        const h5: Handler<number, { y: number }> = function* ({ context, delegate }) { return yield* delegate(c3, context); };
        const c2 = chain('testChain2')
            .append('h1', h4).append('h2', h5).build();

        const h6: Handler<number, { y: number }> = function* ({ context: { y } }) { return y + 1; };
        const c3 = chain('testChain2')
            .append('h1', h6).build();

        c1.invoke({ x: 3 }).should.be.equal(7);
    });

    it(`Should propagate errors thrown by delegate chain execution`, () => {
        const h1: Handler<number, object> = function* ({ proceed }) { return yield* proceed(); };
        const h2: Handler<number, object> = function* ({ proceed }) { return yield* proceed(); };
        const h3: Handler<number, object> = function* ({ delegate, context }) {
            return yield* delegate(c2, context);
        };
        const c1 = chain('testChain1')
            .append('h1', h1).append('h2', h2).append('h3', h3).build();

        const h4: Handler<number, object> = function* ({ proceed }) { return yield* proceed(); };
        const h5: Handler<number, object> = function* ({ proceed }) { return yield* proceed(); };
        const h6: Handler<number, object> = function* () { throw new Error('foobar') };
        const c2 = chain('testChain2')
            .append('h1', h4).append('h2', h5).append('h3', h6).build();

        (() => c1.invoke({})).should.throw('foobar');
    });

    it(`Should pass the invocation object to the handler`, () => {
        const spy1 = sinon.spy<Handler<number, object>>(function* ({ context, delegate }) {
            return yield* delegate(c2, context);
        });
        const spy2 = sinon.spy<Handler<number, object>>(function* () { return 1; });
        const c1 = chain('testChain1').append('h', spy1).build();
        const c2 = chain('testChain2').append('h', spy2).build();
        c1.invoke({ x: 'foobar' });
        spy1.should.have.been.calledWithMatch({
            context: { x: 'foobar' },
            executionId: sinon.match.object
                .and(sinon.match(x => x.toString().match(/^\{executionId:\d+\}$/)))
        });
        spy2.should.have.been.calledWithMatch({
            context: { x: 'foobar' },
            executionId: sinon.match.object
                .and(sinon.match(x => x.toString().match(/^\{executionId:\d+\}$/)))
        });
    });

    it(`Should create a chain with a handler yielding a promise to proceed`, async () => {
        const h1: Handler<number, { x: number }> = function* ({ context, proceed }) {
            return yield* proceed(Promise.resolve(context));
        };
        const h2: Handler<number, { x: number }> = function* ({ proceed, context: { x } }) {
            return yield* proceed(Promise.resolve({ x: x + 2 }));
        };
        const h3: Handler<number, { x: number }> = function* ({ context: { x } }) { return x; };
        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .append('h3', h3).build();
        const result = c.invoke({ x: 1 });
        result.should.be.instanceOf(Promise);
        await result.should.eventually.be.equal(3);
    });

    it(`Should create a chain with a handler yielding a promise to delegate`, async () => {
        const h1: Handler<number, { x: number }> = function* ({ delegate, context: { x } }) {
            return yield* delegate(c2, Promise.resolve({ x: x + 2 }));
        };
        const h2: Handler<number, { x: number }> = function* ({ context, delegate }) {
            return yield* delegate(c3, Promise.resolve(context));
        };
        const h3: Handler<number, { x: number }> = (function* ({ context: { x } }) { return x; });
        const c1 = chain('testChain1')
            .append('h1', h1).build();

        const c2 = chain('testChain2')
            .append('h2', h2).build();

        const c3 = chain('testChain3')
            .append('h3', h3).build();

        const result = c1.invoke({ x: 1 });
        result.should.be.instanceOf(Promise);
        await result.should.eventually.be.equal(3);
    });

    it(`Should add a handler interceptor`, () => {
        const h1 = sinon.spy<Handler<number, { x: number }>>(function* ({ proceed, context: { x } }) {
            return yield* proceed({ x: x * 3 });
        });
        const h2 = sinon.spy<Handler<number, { x: number }>>(function* ({ context: { x } }) { return x + 1 });
        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .build();

        const interceptorSpy = sinon.spy<Handler<number, { x: number }>>(function* ({ proceed, context: { x } }) {
            return yield* proceed({ x: x * 2 });
        });

        const interceptor = handlerInterceptor('i', interceptorSpy);

        c.interceptors.h2.add(interceptor);

        c.invoke({ x: 2 }).should.be.equal(13);
        h1.should.have.been.calledBefore(interceptorSpy);
        h2.should.have.been.calledAfter(interceptorSpy);
    });


    it(`Should remove a handler interceptor`, () => {
        const h1 = sinon.spy<Handler<number, { x: number }>>(function* ({ proceed, context: { x } }) {
            return yield* proceed({ x: x * 3 });
        });
        const h2 = sinon.spy<Handler<number, { x: number }>>(function* ({ context: { x } }) { return x + 1 });
        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .build();

        const interceptorSpy = sinon.spy<Handler<number, { x: number }>>(function* ({ proceed, context: { x } }) {
            return yield* proceed({ x: x * 2 });
        });

        const interceptor = handlerInterceptor('i', interceptorSpy);

        c.interceptors.h2.add(interceptor);
        c.invoke({ x: 3 });

        c.interceptors.h2.remove(interceptor);
        c.invoke({ x: 2 }).should.be.equal(7);

        interceptor.should.have.been.calledOnce.and.calledWithMatch({ context: { x: 9 } });
    });


    it(`Should throw when removing a missing interceptor`, () => {
        const h = function* () { return 1 };

        const c = chain('testChain')
            .append('h', h).build();

        const interceptor = handlerInterceptor<number, unknown>('i', function* ({ proceed }) {
            return yield* proceed();
        });

        (() => c.interceptors.h.remove(interceptor))
            .should.throw('Handler not found.');
        c.invoke({}).should.be.equal(1);
    });


    it(`Should return a promise from handler`, async () => {
        const h1: Handler<number, { x: number }> = function* ({ proceed, context: { x } }) {
            return yield* proceed({ x: x + 3 });
        };
        const h2: Handler<number, { x: number }> = function* ({ context: { x } }) { return Promise.resolve(x * 2); };
        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .build();
        const result = c.invoke({ x: 2 });
        result.should.be.instanceOf(Promise);
        await result.should.eventually.be.equal(10);
    });

    it(`Should handle a rejected promise from handler`, async () => {
        const h1: Handler<number, { x: number }> = function* ({ proceed, context: { x } }) {
            try {
                return yield* proceed({ x: x + 3 });
            } catch {
                return 1;
            }
        };
        const h2: Handler<number, { x: number }> = function* () { return Promise.reject(new Error('foobar')); };
        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .build();
        const result = c.invoke({ x: 2 });
        result.should.be.instanceOf(Promise);
        await result.should.eventually.be.equal(1);
    });

    it(`Should throw a rejected promise from handler`, async () => {
        const h1: Handler<number, { x: number }> = function* ({ proceed, context: { x } }) {
            return yield* proceed({ x: x + 3 });
        };
        const h2: Handler<number, { x: number }> = function* () { return Promise.reject(new Error('foobar')); };
        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .build();
        const result = c.invoke({ x: 2 });
        result.should.be.instanceOf(Promise);
        await result.should.eventually.be.rejectedWith('foobar');
    });

    it(`Should obtain a promise after yield with proceedAsync`, async () => {
        const h1: Handler<number, { x: number }> = function* ({ proceedAsync, context: { x } }) {
            return yield* proceedAsync({ x: x + 3 });
        };
        const h2: Handler<number, { x: number }> = function* ({ context: { x }, proceed }) {
            return yield* proceed(Promise.resolve({ x: x * 2 }));
        };
        const h3 = sinon.spy<Handler<number, { x: number }>>(function* ({ context }) {
            return context.x + 1;
        });
        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .append('h3', h3)
            .build();
        const result = c.invoke({ x: 2 });
        result.should.be.instanceOf(Promise);
        h3.should.not.have.been.called;
        await result.should.eventually.be.equal(11);
        h3.should.have.been.calledOnce;
    });

    it(`Should obtain a value after yield with proceedAsync`, async () => {
        const h1: Handler<number, { x: number }> = function* ({ proceedAsync, context: { x } }) {
            const val = yield* proceedAsync({ x: x + 3 });
            return val;
        };
        const h2: Handler<number, { x: number }> = function* ({ context: { x }, proceed }) {
            return yield* proceed({ x: x * 2 });
        };
        const h3 = sinon.spy<Handler<number, { x: number }>>(function* ({ context }) {
            return context.x + 1;
        });
        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .append('h3', h3)
            .build();
        const result = c.invoke({ x: 2 });
        result.should.be.equal(11);
    });

    it(`Should obtain a promise after yield with proceedAsync and a value after yield with proceed`, async () => {
        const h1: Handler<number, { x: number }> = function* ({ proceed, proceedAsync, context: { x } }) {
            const promise = yield* proceedAsync({ x: x + 3 });
            const value2 = yield* proceed({ x: x + 2 });
            return Promise.resolve(promise).then(value1 => value1 + value2);
        };

        const h2: StubFor<Handler<number, { x: number }>> = sinon.stub();

        h2.onFirstCall().callsFake(function* ({ context: { x }, proceed }) {
            return yield* proceed(Promise.resolve({ x: x * 2 }));
        }).onSecondCall().callsFake(function* ({ context: { x }, proceed }) {
            return yield* proceed({ x: x * 2 });
        });

        const h3 = sinon.spy<Handler<number, { x: number }>>(function* ({ context }) {
            return context.x + 1;
        });

        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .append('h3', h3)
            .build();

        const result = c.invoke({ x: 2 });
        result.should.be.instanceOf(Promise);
        h3.should.have.been.calledOnce.and.calledWithMatch({ context: { x: 8 } });
        await result.should.eventually.be.equal(20);
        h3.should.have.been.calledTwice;
    });

    it(`Should run handlers in parallel after yield with proceedAsync`, async () => {
        const h1: Handler<number, { x: number }> = function* ({ proceedAsync, context: { x } }) {
            const promises = [];
            for (let i = 1; i <= 3; i++) {
                promises.push(yield* proceedAsync({ x: x + i }));
            }
            return Promise.all(promises).then(arr => arr.reduce((sum, v) => sum + v, 0));
        };
        const h2 = sinon.spy<Handler<number, { x: number }>>(function* h2({ context: { x }, proceed }) {
            return yield* proceed(Promise.resolve({ x: x * 2 }));
        });
        const h3 = sinon.spy<Handler<number, { x: number }>>(function* h3({ context }) {
            return context.x + 1;
        });
        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .append('h3', h3)
            .build();
        const result = c.invoke({ x: 2 });
        result.should.be.instanceOf(Promise);
        h2.should.have.been.calledThrice;
        h3.should.not.have.been.called;
        await result.should.eventually.be.equal(27);
        h3.should.have.been.calledThrice;
    });

    it(`Should reject after yield with proceedAsync`, async () => {
        const h1: Handler<number, { x: number }> = function* ({ proceedAsync, context: { x } }) {
            return yield* proceedAsync({ x: x + 3 });
        };
        const h2: Handler<number, { x: number }> = function* ({ context: { x }, proceed }) {
            return yield* proceed(Promise.resolve({ x: x * 2 }));
        };
        const h3: Handler<number, { x: number }> = function* () {
            throw new Error('foobar')
        };
        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .append('h3', h3)
            .build();
        const result = c.invoke({ x: 2 });
        result.should.be.instanceOf(Promise);
        await result.should.eventually.be.rejectedWith('foobar');
    });


    it(`Should obtain a promise returned by handler after yield with proceedAsync`, async () => {
        const spy1 = sinon.spy(),
            spy2 = sinon.spy();

        const h1: Handler<number, { x: number }> = function* ({ proceedAsync, context: { x } }) {
            const promise = yield* proceedAsync({ x: x + 3 });
            spy1(promise);
            return promise;
        };
        const h2: Handler<number, { x: number }> = function* ({ context: { x }, proceed }) {
            const value = yield* proceed({ x: x * 2 });
            spy2(value);
            return value;
        };
        const h3: Handler<number, { x: number }> = function* ({ context }) {
            return Promise.resolve(context.x + 1);
        };
        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .append('h3', h3)
            .build();
        const result = c.invoke({ x: 2 });
        result.should.be.instanceOf(Promise);
        spy1.should.have.been.calledWithMatch(sinon.match.instanceOf(Promise));
        spy2.should.not.have.been.called;
        await result.should.eventually.be.equal(11);
        spy2.should.have.been.calledOnce;
    });

    it(`Should catch a context promise rejected by handler after yield with proceedAsync`, async () => {
        const h1: Handler<number, { x: number }> = function* ({ proceedAsync, context: { x } }) {
            return yield* proceedAsync({ x: x + 3 });
        };

        const h2: Handler<number, { x: number }> = function* ({ proceed }) {
            try {
                return yield* proceed(Promise.reject());
            } catch {
                return 77;
            }
        };

        const h3 = sinon.spy<Handler<number, { x: number }>>(function* ({ context }) {
            return Promise.resolve(context.x + 1);
        });

        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .append('h3', h3)
            .build();
        const result = c.invoke({ x: 2 });
        result.should.be.instanceOf(Promise);
        await result.should.eventually.be.equal(77);
        h3.should.not.have.been.called;
    });

    it(`Should catch a value promise rejected by handler after yield with proceedAsync`, async () => {
        const h1: Handler<number, { x: number }> = function* ({ proceedAsync, context: { x } }) {
            return yield* proceedAsync({ x: x + 3 });
        };

        const h2: Handler<number, { x: number }> = function* ({ context: { x }, proceed }) {
            try {
                return yield* proceed({ x: x * 2 });
            } catch {
                return 77;
            }
        };

        const h3: Handler<number, { x: number }> = function* ({ context }) {
            return Promise.reject();
        };

        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .append('h3', h3)
            .build();
        const result = c.invoke({ x: 2 });
        result.should.be.instanceOf(Promise);
        await result.should.eventually.be.equal(77);
    });

    it(`Should obtain a promise after yield with multiple proceedAsync`, async () => {
        const h1: Handler<number, { x: number }> = function* ({ proceedAsync, context: { x } }) {
            const val = yield* proceedAsync({ x: x + 3 });
            return val
        };
        const h2: Handler<number, { x: number }> = function* ({ proceedAsync, context: { x } }) {
            const val = yield* proceedAsync(Promise.resolve({ x: x * 2 }));
            return val
        };
        const h3: Handler<number, { x: number }> = function* ({ proceedAsync, context: { x } }) {
            const val = yield* proceedAsync({ x: x + 6 });
            return val
        };
        const h4 = sinon.spy<Handler<number, { x: number }>>(function* ({ context }) {
            return context.x * context.x;
        });
        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .append('h3', h3)
            .append('h4', h4)
            .build();
        const result = c.invoke({ x: 2 });
        result.should.be.instanceOf(Promise);
        h4.should.not.have.been.called;
        await result.should.eventually.be.equal(256);
        h4.should.have.been.calledOnce;
    });

    it(`Should obtain a promise after yield with delegateAsync`, async () => {
        const h1: Handler<number, { x: number }> = function* ({ proceed, context: { x } }) {
            return yield* proceed({ x: x + 3 });
        };
        const h2: Handler<number, { x: number }> = function* ({ delegateAsync, context: { x } }) {
            return yield* delegateAsync(c2, { x: x * 2 });
        };
        const h3: Handler<number, { x: number }> = function* ({ proceed, context: { x } }) {
            return yield* proceed(Promise.resolve({ x: x * 3 }));
        };
        const h4 = sinon.spy<Handler<number, { x: number }>>(function* ({ context }) {
            return context.x + 1;
        });

        const c1 = chain('testChain1')
            .append('h1', h1)
            .append('h2', h2)
            .build();

        const c2 = chain('testChain2')
            .append('h3', h3)
            .append('h4', h4)
            .build();

        const result = c1.invoke({ x: 2 });
        result.should.be.instanceOf(Promise);
        h4.should.not.have.been.called;
        await result.should.eventually.be.equal(31);
        h4.should.have.been.calledOnce;
    });

    it(`Should obtain a promise after yield with delegateAsync and proceedAsync`, async () => {
        const h1: Handler<number, { x: number }> = function* ({ proceed, context: { x } }) {
            return yield* proceed({ x: x + 3 });
        };
        const h2: Handler<number, { x: number }> = function* ({ delegateAsync, context: { x } }) {
            return yield* delegateAsync(c2, { x: x * 2 });
        };
        const h3: Handler<number, { x: number }> = function* ({ proceed, context: { x } }) {
            return yield* proceed(Promise.resolve({ x: x + 3 }));
        };
        const h4: Handler<number, { x: number }> = function* ({ proceedAsync, context: { x } }) {
            return yield* proceedAsync({ x: x * 2 });
        };
        const h5 = sinon.spy<Handler<number, { x: number }>>(function* ({ context }) {
            return Promise.resolve(context.x + 1);
        });

        const c1 = chain('testChain1')
            .append('h1', h1)
            .append('h2', h2)
            .build();

        const c2 = chain('testChain2')
            .append('h3', h3)
            .append('h4', h4)
            .append('h5', h5)
            .build();

        const result = c1.invoke({ x: 2 });
        result.should.be.instanceOf(Promise);
        h5.should.not.have.been.called;
        await result.should.eventually.be.equal(27);
        h5.should.have.been.calledOnce;
    });

    it(`Should obtain a promise after yield with nested delegateAsync and proceedAsync`, async () => {
        const h1: Handler<number, { x: number }> = function* ({ proceed, context: { x } }) {
            return yield* proceed({ x: x + 3 });
        };
        const h2: Handler<number, { x: number }> = function* ({ delegateAsync, context: { x } }) {
            return yield* delegateAsync(c2, { x: x * 2 });
        };
        const h3: Handler<number, { x: number }> = function* ({ proceed, context: { x } }) {
            return yield* proceed(Promise.resolve({ x: x + 3 }));
        };
        const h4: Handler<number, { x: number }> = function* ({ proceedAsync, context: { x } }) {
            return yield* proceedAsync({ x: x * 2 });
        };

        const h5: StubFor<Handler<number, { x: number }>> = sinon.stub();

        h5.onFirstCall().callsFake(function* ({ delegate, context: { x } }) {
            return yield* delegate(c1, Promise.resolve({ x: x + 3 }));
        }).onSecondCall().callsFake(function* ({ delegateAsync, context: { x } }) {
            return yield* delegateAsync(c1, { x: x + 4 });
        }).onThirdCall().callsFake(function* ({ context: { x } }) {
            return x + 1;
        });

        const c1 = chain('testChain1')
            .append('h1', h1)
            .append('h2', h2)
            .build();

        const c2 = chain('testChain2')
            .append('h3', h3)
            .append('h4', h4)
            .append('h5', h5)
            .build();

        const result = c1.invoke({ x: 2 });
        result.should.be.instanceOf(Promise);
        h5.should.not.have.been.called;
        await result.should.eventually.be.equal(571);
        h5.getCall(0).should.have.been.calledWithMatch({ context: { x: 26 } });
        h5.getCall(1).should.have.been.calledWithMatch({ context: { x: 134 } });
        h5.getCall(2).should.have.been.calledWithMatch({ context: { x: 570 } });
    });

    it(`Should fork the execution synchronously`, () => {
        const h1: Handler<number, object> = function* ({ proceed }) { return yield* proceed(); };
        const h2: Handler<number, object> = function* ({ context, fork }) { return fork(context); };
        const h3: Handler<number, object> = function* () { return 1 };
        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .append('h3', h3)
            .build();
        c.invoke({}).should.be.equal(1);
    });

    it(`Should fork the execution asynchronously`, async () => {
        const h1: Handler<number, object> = function* ({ proceed }) { return yield* proceed(); };
        const h2: Handler<number, object> = function* ({ context, fork }) { return Promise.resolve().then(() => fork(context)); };
        const h3: Handler<number, object> = function* () { return 1 };
        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .append('h3', h3)
            .build();
        await c.invoke({}).should.be.eventually.equal(1);
    });

    it(`Should create a chain with sync and async handlers`, async () => {
        const h1: Handler<number, object> = function* ({ proceed }) { return yield* proceed(); };
        const h2: Handler<number, object> = async function* ({ proceed }) {
            await Promise.resolve();
            const res = yield* proceed();
            await Promise.resolve();
            return res;
        };
        const h3: Handler<number, object> = function* () { return 1 };
        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .append('h3', h3)
            .build();
        await c.invoke({}).should.eventually.be.equal(1);
    });

    it(`Should rethrow the error thrown by async handlers`, async () => {
        const h1: Handler<number, object> = function* ({ proceed }) { return yield* proceed(); };
        const h2: Handler<number, object> = async function* () {
            await Promise.resolve();
            throw new Error('foo');
        };
        const c = chain('testChain')
            .append('h1', h1)
            .append('h2', h2)
            .build();
        await c.invoke({}).should.eventually.be.rejectedWith('foo');
    });

    it(`Should create a chain with 20000 handlers`, () => {

        const handlers = new Array(20000).fill(null)
            .map<Handler<number, object>>((_, idx, arr) => function* ({ proceed }) {
                return idx === arr.length - 1 ? 123 : yield* proceed();
            })

        const builder = chain('testChain') as ChainBuilder<number, object, {}>;

        const c = handlers.reduce((_, h, idx) => builder.append('h' + idx, h), builder).build();

        c.invoke({}).should.be.equal(123);
    });

    it(`Should create a chain with 20000 async handlers`, async () => {

        const handlers = new Array(20000).fill(null)
            .map<Handler<number, object>>((_, idx, arr) => async function* ({ proceed }) {
                await Promise.resolve();
                return idx === arr.length - 1 ? 123 : yield* proceed();
            })

        const builder = chain('testChain') as ChainBuilder<number, object, {}>;

        const c = handlers.reduce((_, h, idx) => builder.append('h' + idx, h), builder).build();

        await c.invoke({}).should.eventually.be.equal(123);
    });

});

type StubFor<H extends Handler<any, any>> = sinon.SinonStub<Parameters<H>, ReturnType<H>>;