// Registro centralizado de agentes
import { soporteTecnico } from "./soporteTecnico/soporteTecnico.js";
import { general } from "./general/general.js";
import { conversacional } from "./conversacional/conversacional.js";
import { documental } from "./documental/documental.js";
import { bi } from "./BI/bi.js";
import { eSidif } from "./esidif/esidif.js";
import { editor } from "./editor/editor.js";
import { pasaporte } from "./pasaporte/pasaporte.js";
import { atencionDNI } from "./atencionDNI/atencionDNI.js";

/**
 * Registro de todos los agentes disponibles en el sistema
 * Cada agente tiene su propio RAG asociado
 */
export const agentes = {
    conversacional,
    documental,
    soporteTecnico,
    general,
    bi,
    esidif: eSidif,
    editor,
    pasaporte,
    atencionDNI
};

/**
 * Obtiene un agente por nombre
 */
export function getAgente(nombre) {
    return agentes[nombre] || null;
}

/**
 * Lista todos los agentes disponibles
 */
export function listAgentes() {
    return Object.keys(agentes).map(nombre => ({
        nombre,
        info: agentes[nombre].getInfo()
    }));
}


