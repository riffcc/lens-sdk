import { debounceAccumulator } from '@peerbit/time';

export const debouncedAccumulatorMap = <T>(
    fn: (args: Map<string, T>) => unknown,
    delay: number,
    merge?: (into: T, from: T) => void,
) => {
    return debounceAccumulator<
        string,
        { key: string; value: T },
        Map<string, T>
    >(
        fn,
        () => {
            const map = new Map();
            const add = merge
                ? (props: { key: string; value: T }) => {
                    const prev = map.get(props.key);
                    if (prev != null) {
                        merge(prev, props.value);
                    } else {
                        map.set(props.key, props.value);
                    }
                }
                : (props: { key: string; value: T }) => {
                    map.set(props.key, props.value);
                };
            return {
                add,
                delete: (key: string) => map.delete(key),
                size: () => map.size,
                value: map,
                clear: () => map.clear(),
                has: (key: string) => map.has(key),
            };
        },
        delay,
    );
};

export type DebouncedAccumulatorMap<T> = ReturnType<
    typeof debouncedAccumulatorMap<T>
>;
