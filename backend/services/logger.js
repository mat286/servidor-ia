function log(level, component, message, meta = {}) {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        component,
        message,
        ...meta
    };

    const serialized = JSON.stringify(entry);
    if (level === "error" || level === "warn") {
        console.error(serialized);
        return;
    }

    console.log(serialized);
}

export const logger = {
    info(component, message, meta = {}) {
        log("info", component, message, meta);
    },
    warn(component, message, meta = {}) {
        log("warn", component, message, meta);
    },
    error(component, message, meta = {}) {
        log("error", component, message, meta);
    },
    // Métodos de dominio específicos
    rag(action, data = {}) {
        log("info", "rag", action, data);
    },
    llm(action, data = {}) {
        log("info", "llm", action, data);
    },
    agent(action, data = {}) {
        log("info", "agent", action, data);
    }
};
