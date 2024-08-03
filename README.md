# @pcan/generator-chain

An implementation of the [Chain of responsibility](https://en.wikipedia.org/wiki/Chain-of-responsibility_pattern) pattern that supports both synchronous and asynchronous processing, through the same API.

## Example

A basic usage with synchronous handlers:

```Typescript
import { chain, ChainInvocation } from '@pcan/generator-chain';

type GreetingInvocation = ChainInvocation<string, { name: string }>;

function* greetingHandler({ proceed }: GreetingInvocation) {
    const hours = new Date().getHours();
    const hello = hours > 6 && hours < 11 ? 'Good morning, ' : 'hello, ';
    const nextValue = yield* proceed();
    return hello + nextValue;
}

function* nameHandler({ context, proceed }: GreetingInvocation) {
    const nextValue = yield* proceed();
    return context.name + nextValue;
}

function* emojiHandler() {
    return ' ' + (Math.random() > .5 ? '😄' : '😉');
}

const greetingChain = chain('my-greeting-chain')
    .append('greetingHandler', greetingHandler)
    .append('nameHandler', nameHandler)
    .append('emojiHandler', emojiHandler)
    .build()

const greeting = greetingChain.invoke({ name: 'pcan' });
console.log(greeting);
```

Output:
```Plaintext
Good morning, pcan 😄
```
 
## Motivation

Generally speaking, the classical Chain of Responsibility pattern implementation is constrained by the stack size, which has a fixed limit. Creating a chain with many handlers (or handlers taking many parameters) may result in `Maximum call stack size exceeded` errors. Adding extension points (interceptors) can exacerbate the problem, thus impairing customizability.

This library overcomes such limitations by moving the stack management to the heap, using an execution engine that coordinates the execution of handlers (implemented as generator functions).

## How it works

Chain handlers are [generator functions](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*) that utilize the `yield` instruction to pass execution control to the next handler (or delegate it to another chain).  
In order to do so, the values a handler `yield`s can be instances of `Proceed()` or `Delegate()`. These command objects instruct the execution engine to schedule the next handlers' execution, passing the provided context (or the current one, if none specified).  
When a handler `return`s, the control is passed back to the previous handler in the chain, restarting its execution immediately after the last `yield`.  
The execution engine implements a call stack in the heap to keep track of the current generator instances and their relative order. It also detects whether the return value types are `Promise` instances or not, to behave synchronously or asynchronously based on the handlers' return types. 
To maintain the same API, the chain execution returns a `PromiseOrValue<T>` instance, which represents either normal `Promise<T>` or the immediate execution result `T` if the execution is fully synchronous. In case there's at least one asynchronous handler (implemented as async generator function), the chain will always return a `Promise<T>`.


## Features

Coming soon!
