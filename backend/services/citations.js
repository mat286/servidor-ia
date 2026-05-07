// Sistema de citas obligatorias para respuestas RAG

/**
 * Genera formato de cita a partir de metadata del chunk
 */
export function formatCitation(chunk) {
    const parts = [];

    if (chunk.document) {
        parts.push(chunk.document);
    }

    if (chunk.page !== null && chunk.page !== undefined) {
        parts.push(`página ${chunk.page}`);
    }

    if (chunk.section) {
        parts.push(`sección ${chunk.section}`);
    }

    return parts.length > 0 ? parts.join(", ") : chunk.documentId || "documento";
}

/**
 * Genera lista de citas únicas a partir de chunks
 */
export function generateCitations(chunks) {
    if (!chunks || chunks.length === 0) {
        return [];
    }

    // Agrupar por documento y página para evitar duplicados
    const citationMap = new Map();

    chunks.forEach(chunk => {
        const key = `${chunk.documentId}_${chunk.page || 'no_page'}`;

        if (!citationMap.has(key)) {
            citationMap.set(key, {
                document: chunk.document || chunk.documentId,
                page: chunk.page,
                section: chunk.section,
                documentId: chunk.documentId
            });
        }
    });

    return Array.from(citationMap.values())
        .map(citation => formatCitation(citation))
        .filter(citation => citation.length > 0);
}

/**
 * Formatea el contexto con citas para el prompt del LLM
 * Optimizado para RAG con referencias explícitas
 */
export function formatContextWithCitations(chunks) {
    if (!chunks || chunks.length === 0) {
        return "No hay información documental disponible.";
    }

    return chunks
        .map((chunk, index) => {
            const source = chunk.document || chunk.source || chunk.documentId || "Documento sin nombre";
            const page = chunk.page ? `, pág. ${chunk.page}` : "";
            const section = chunk.section ? `, sección ${chunk.section}` : "";
            const domain = chunk.domain ? `, dominio: ${chunk.domain}` : "";

            return `
[Fuente ${index + 1}]
Origen real: ${source}${page}${section}${domain}
Fragmento:
${chunk.text.trim()}
`;
        })
        .join("\n---\n");
}

/**
 * Genera instrucciones de citas para el system prompt
 */
export function getCitationInstructions() {
    return `Basate ÚNICAMENTE en el contexto. Respondé en español claro. No inventes datos ni referencias.`;
}

/**
 * Extrae y valida citas de una respuesta del LLM
 */
export function extractCitationsFromResponse(response) {
    // Buscar patrones de citas en la respuesta
    const citationPattern = /\[Fuente[^\]]*\]/gi;
    const matches = response.match(citationPattern) || [];
    return matches;
}
