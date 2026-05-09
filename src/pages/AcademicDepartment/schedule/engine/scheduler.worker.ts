import { runSchedulingEngine, SchedulingEngineInput, SchedulingEngineProgress } from './schedulerEngine';

type WorkerRequest = {
    type: 'run';
    payload: SchedulingEngineInput;
};

type WorkerResponse =
    | { type: 'progress'; payload: SchedulingEngineProgress }
    | { type: 'success'; payload: ReturnType<typeof runSchedulingEngine> }
    | { type: 'error'; error: string };

const ctx = self as any;

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
