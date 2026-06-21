import { runSchedulingEngine, SchedulingEngineInput, SchedulingEngineProgress } from './schedulerEngine';

type WorkerRequest = {
    type: 'run';
    payload: SchedulingEngineInput;
};

export type WorkerResponse =
    | { type: 'progress'; payload: SchedulingEngineProgress }
    | { type: 'success'; payload: ReturnType<typeof runSchedulingEngine> }
    | { type: 'error'; error: string };

// `self` inside a dedicated worker is a DedicatedWorkerGlobalScope, but this
// project's tsconfig only includes the DOM lib (not "webworker", which would
// conflict with DOM's own `self`/`postMessage` typings). Narrow to just the
// shape this file actually uses instead of casting to `any`.
type WorkerContext = {
    onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
    postMessage: (message: WorkerResponse) => void;
};
const ctx = self as unknown as WorkerContext;

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
    if (event.data?.type !== 'run') return;

    try {
        const result = runSchedulingEngine(event.data.payload, (progress) => {
            ctx.postMessage({ type: 'progress', payload: progress } satisfies WorkerResponse);
        });
        ctx.postMessage({ type: 'success', payload: result } satisfies WorkerResponse);
    } catch (error) {
        ctx.postMessage({
            type: 'error',
            error: error instanceof Error ? error.message : String(error)
        } satisfies WorkerResponse);
    }
};

export {};
