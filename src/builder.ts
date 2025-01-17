import {
    Handlers, Chain, InterceptorOperations,
    NamedHandler, OpaqueHandler, interceptorSym,
    ChainStartBuilder, handlers, InternalChain
} from "./chain-commons";
import { execute } from "./chain-executor";

export function chain(id: string) {
    const namedHandlers: NamedHandler[] = [];

    function append(name: string, handler: OpaqueHandler) {
        namedHandlers.push({ name, handler });
        return builder;
    }

    function build<T, C>(): Chain<T, C, Handlers> {
        type OpaqueInterceptors = Record<string, InterceptorOperations<OpaqueHandler>>;

        const interceptors = Object.freeze(namedHandlers.reduce<OpaqueInterceptors>(
            (obj, namedHandler) => (obj[namedHandler.name] = {
                add: (interceptor) =>
                    namedHandlers.splice(findHandlerIndex(namedHandlers, namedHandler.handler),
                        0, { name: interceptor[interceptorSym], handler: interceptor }),
                remove: (interceptor) =>
                    namedHandlers.splice(findHandlerIndex(namedHandlers, interceptor), 1)
            }, obj), {}
        ));

        function invoke(ctx: C) {
            return execute(chain, ctx);
        }

        const chain = { id, invoke, [handlers]: namedHandlers, interceptors } as InternalChain<T, C>;

        return chain;
    }

    const builder = { build, append };

    return builder as ChainStartBuilder;
}

function findHandlerIndex(handlers: NamedHandler[], target: OpaqueHandler) {
    const idx = handlers.findIndex(h => h.handler === target);
    if (idx < 0) {
        throw new Error('Handler not found.');
    }
    return idx;
}
