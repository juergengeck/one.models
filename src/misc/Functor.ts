/**
 * This interface just tells typescript, that you now can directly call the class like a function.
 */
export interface Functor<T extends (...arg: any) => any> {
    (...args: Parameters<T>): ReturnType<T>;
}

/**
 * This class is for overriding the parenthesis operator "()" of a class.
 *
 * Javascript / typescript don't support overriding operators. But you can use a trick by creating a function when 'new'
 * is called and making the original class a prototype of the returned function.
 *
 * Deriving from 'Function' is not really required, but with it you get all the members of a function object.
 *
 * Note: This redefines the prototype of a function with setPrototypeOf. According to MDN this might come with severe
 * speed penalties, because this will disable some optimizations in certain runtimes.
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/setPrototypeOf
 */
export class Functor<T extends (...arg: any) => any> extends Function  {

    /**
     * Constructs the callable class.
     *
     * @param f - The function that is invoked when the () operator is invoked. If you use an arrow function in the
     *            derived class you can safely use 'this'.
     */
    constructor(f: (...args: Parameters<T>) => any) {
        super();
        return Object.setPrototypeOf(f, new.target.prototype);
    }
}

