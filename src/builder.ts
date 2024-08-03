import {
    ChainBuilder, Handlers, Chain, HandlerOperations,
    NamedHandler, OpaqueHandler, interceptorSym, ChainStartBuilder
} from "./chain-commons";
import { execute } from "./chain-executor";

export {

} from "./chain-commons";

export function chain(id: string) {
    const namedHandlers: NamedHandler[] = [];

    function append(name: string, handler: OpaqueHandler) {
        namedHandlers.push({ name, handler });
        return builder;
    }

    function build<T, C>(): Chain<T, Handlers, C> {
        const initialHandlers = Object.create(namedHandlers)
        const handlers = Object.freeze(Object.assign(initialHandlers, namedHandlers.reduce(
            (obj, namedHandler) => (obj[namedHandler.name] = {
                addInterceptor: (interceptor) =>
                    namedHandlers.splice(findHandlerIndex(namedHandlers, namedHandler.handler),
                        0, { name: interceptor[interceptorSym], handler: interceptor }),
                removeInterceptor: (interceptor) =>
                    namedHandlers.splice(findHandlerIndex(namedHandlers, interceptor), 1)

            }, obj),
            {} as { [k: string]: HandlerOperations<OpaqueHandler> } & ReadonlyArray<NamedHandler<T>>
        )));

        function invoke(ctx: C) {
            return execute(chain, ctx);
        }

        const chain = { id, invoke, handlers } as Chain<T, Handlers, C>;

        return chain;
    }

    const builder = { build, append };

    return { append } as ChainStartBuilder;
}

function findHandlerIndex(handlers: NamedHandler[], target: OpaqueHandler) {
    const idx = handlers.findIndex(h => h.handler === target);
    if (idx < 0) {
        throw new Error('Handler not found.');
    }
    return idx;
}
