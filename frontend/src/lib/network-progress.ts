type ProgressListener = (state: { active: number; tick: number }) => void;

let activeRequests = 0;
let tick = 0;
const listeners = new Set<ProgressListener>();

function emit(): void {
  tick += 1;
  const state = { active: activeRequests, tick };
  listeners.forEach((listener) => listener(state));
}

export function subscribeNetworkProgress(listener: ProgressListener): () => void {
  listeners.add(listener);
  listener({ active: activeRequests, tick });
  return () => {
    listeners.delete(listener);
  };
}

export function startNetworkProgress(): void {
  activeRequests += 1;
  emit();
}

export function endNetworkProgress(): void {
  activeRequests = Math.max(0, activeRequests - 1);
  emit();
}

export async function trackedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  startNetworkProgress();
  try {
    return await fetch(input, init);
  } finally {
    endNetworkProgress();
  }
}

