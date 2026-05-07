const domainQueues = new Map();

/**
 * Ejecuta tareas de indexación en serie por dominio para evitar carreras
 */
export async function enqueueIndexingTask(domain, task) {
    const key = String(domain || "general");
    const previous = domainQueues.get(key) || Promise.resolve();

    const current = previous
        .catch(() => undefined)
        .then(async () => task());

    domainQueues.set(key, current.finally(() => {
        if (domainQueues.get(key) === current) {
            domainQueues.delete(key);
        }
    }));

    return current;
}

export function getQueueSize() {
    return domainQueues.size;
}
