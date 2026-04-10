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
    return `
REGLAS DE CITACIÓN OBLIGATORIAS:
1. Toda respuesta DEBE basarse ÚNICAMENTE en el contexto proporcionado.
2. Si mencionas una fuente dentro del texto, usa solo marcadores como [Fuente 1] o [Fuente 2].
3. NO inventes URLs, links Markdown, nombres de documentos ni una sección manual de referencias; el sistema agrega las referencias reales al final.
4. Si el contexto no contiene información suficiente, di explícitamente: "No hay información suficiente en la base documental para responder esta pregunta."
5. NUNCA inventes datos, fechas, números, menús o pasos que no estén en el contexto.
6. Priorizá claridad, respuesta breve y pasos numerados cuando el usuario pregunte cómo hacer algo.
`;
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
