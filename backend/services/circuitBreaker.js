/**
 * Circuit Breaker para Ollama
 * Previene cascadas de fallos en el LLM detectando errores consecutivos
 */

export class CircuitBreaker {
    constructor(options = {}) {
        this.failureThreshold = options.failureThreshold || 5;      // Fallos consecutivos antes de abrir
        this.successThreshold = options.successThreshold || 2;      // Éxitos para cerrar desde half-open
        this.timeout = options.timeout || 30000;                    // Tiempo en ms antes de probar half-open
        
        this.state = "CLOSED";    // CLOSED, OPEN, HALF_OPEN
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = null;
    }

    async execute(fn) {
        if (this.state === "OPEN") {
            if (Date.now() - this.lastFailureTime > this.timeout) {
                this.state = "HALF_OPEN";
                this.successCount = 0;
            } else {
                const err = new Error("Circuit breaker is OPEN");
                err.code = "CIRCUIT_BREAKER_OPEN";
                throw err;
            }
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    onSuccess() {
        this.failureCount = 0;

        if (this.state === "HALF_OPEN") {
            this.successCount++;
            if (this.successCount >= this.successThreshold) {
                this.state = "CLOSED";
                console.log("✅ Circuit breaker CLOSED (recovered)");
            }
        }
    }

    onFailure() {
        this.lastFailureTime = Date.now();
        this.failureCount++;

        if (this.failureCount >= this.failureThreshold) {
            this.state = "OPEN";
            console.warn(`⚠️  Circuit breaker OPEN (${this.failureCount} consecutive failures)`);
        }

        if (this.state === "HALF_OPEN") {
            this.state = "OPEN";
            console.warn("⚠️  Circuit breaker OPEN again (recovery failed)");
        }
    }

    getState() {
        return { state: this.state, failureCount: this.failureCount };
    }

    reset() {
        this.state = "CLOSED";
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = null;
    }
}

export default CircuitBreaker;
