import { AlignmentType, Document, Packer, Paragraph, TextRun } from "docx";

export function clampNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
}

export function cmToTwip(value = 0) {
    return Math.round(Number(value || 0) * 567);
}

export function ptToTwip(value = 0) {
    return Math.round(Number(value || 0) * 20);
}

export function ptToHalfPoint(value = 12) {
    return Math.round(Number(value || 12) * 2);
}

export function sanitizeDocText(text = "") {
    return String(text ?? "")
        .replace(/\r/g, "")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/`(.*?)`/g, "$1");
}

export function normalizeDocumentFormat(formatting = {}, outputType = "docx") {
    const safeFormatting = formatting && typeof formatting === "object" ? formatting : {};
    const safeMargins = safeFormatting.marginsCm && typeof safeFormatting.marginsCm === "object"
        ? safeFormatting.marginsCm
        : {};

    return {
        outputType: outputType === "txt" ? "txt" : outputType === "md" ? "md" : "docx",
        fontFamily: String(safeFormatting.fontFamily || "Arial").trim().slice(0, 60) || "Arial",
        fontSize: clampNumber(safeFormatting.fontSize, 8, 24, 12),
        lineSpacing: clampNumber(safeFormatting.lineSpacing, 1, 3, 1.15),
        firstLineIndentCm: clampNumber(safeFormatting.firstLineIndentCm, 0, 5, 1.25),
        alignment: ["left", "center", "right", "justify"].includes(String(safeFormatting.alignment || "").toLowerCase())
            ? String(safeFormatting.alignment).toLowerCase()
            : "justify",
        spaceAfterPt: clampNumber(safeFormatting.spaceAfterPt, 0, 24, 6),
        marginsCm: {
            top: clampNumber(safeMargins.top, 1, 5, 2.5),
            right: clampNumber(safeMargins.right, 1, 5, 2),
            bottom: clampNumber(safeMargins.bottom, 1, 5, 2.5),
            left: clampNumber(safeMargins.left, 1, 5, 3)
        }
    };
}

export function parseDocxAlignment(alignment = "justify") {
    switch (String(alignment || "").toLowerCase()) {
        case "left":   return AlignmentType.LEFT;
        case "center": return AlignmentType.CENTER;
        case "right":  return AlignmentType.RIGHT;
        default:       return AlignmentType.JUSTIFIED;
    }
}

export function buildDocxParagraphs(content, formatting) {
    const paragraphs = [];
    const lines = sanitizeDocText(content).split("\n");
    let paragraphBuffer = [];

    const flushParagraphBuffer = () => {
        if (!paragraphBuffer.length) return;
        const paragraphText = paragraphBuffer.join(" ").trim();
        paragraphBuffer = [];
        if (!paragraphText) return;
        paragraphs.push(new Paragraph({
            children: [new TextRun({
                text: paragraphText,
                font: formatting.fontFamily,
                size: ptToHalfPoint(formatting.fontSize)
            })],
            alignment: parseDocxAlignment(formatting.alignment),
            indent: { firstLine: cmToTwip(formatting.firstLineIndentCm) },
            spacing: {
                line: Math.round(formatting.lineSpacing * 240),
                after: ptToTwip(formatting.spaceAfterPt)
            }
        }));
    };

    for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed) {
            flushParagraphBuffer();
            continue;
        }

        if (/^#{1,6}\s+/.test(trimmed)) {
            flushParagraphBuffer();
            const headingText = trimmed.replace(/^#{1,6}\s+/, "").trim();
            paragraphs.push(new Paragraph({
                children: [new TextRun({
                    text: headingText,
                    bold: true,
                    font: formatting.fontFamily,
                    size: ptToHalfPoint(formatting.fontSize + 2)
                })],
                alignment: parseDocxAlignment(formatting.alignment),
                spacing: { before: ptToTwip(6), after: ptToTwip(6) }
            }));
            continue;
        }

        if (/^[-•]\s+/.test(trimmed)) {
            flushParagraphBuffer();
            const bulletText = trimmed.replace(/^[-•]\s+/, "").trim();
            paragraphs.push(new Paragraph({
                children: [new TextRun({
                    text: bulletText,
                    font: formatting.fontFamily,
                    size: ptToHalfPoint(formatting.fontSize)
                })],
                bullet: { level: 0 },
                alignment: parseDocxAlignment(formatting.alignment),
                spacing: {
                    line: Math.round(formatting.lineSpacing * 240),
                    after: ptToTwip(4)
                }
            }));
            continue;
        }

        if (/^\d+[.)]\s+/.test(trimmed)) {
            flushParagraphBuffer();
            paragraphs.push(new Paragraph({
                children: [new TextRun({
                    text: trimmed,
                    font: formatting.fontFamily,
                    size: ptToHalfPoint(formatting.fontSize)
                })],
                alignment: parseDocxAlignment(formatting.alignment),
                indent: { left: cmToTwip(0.8) },
                spacing: {
                    line: Math.round(formatting.lineSpacing * 240),
                    after: ptToTwip(4)
                }
            }));
            continue;
        }

        paragraphBuffer.push(trimmed);
    }

    flushParagraphBuffer();

    if (!paragraphs.length) {
        paragraphs.push(new Paragraph({
            children: [new TextRun({
                text: "",
                font: formatting.fontFamily,
                size: ptToHalfPoint(formatting.fontSize)
            })]
        }));
    }

    return paragraphs;
}

export async function createDocxBuffer(content, formatting, metadata = {}) {
    const document = new Document({
        creator: "Servidor IA",
        title: metadata.title || "Documento generado",
        description: metadata.description || "Documento generado por el editor documental",
        sections: [{
            properties: {
                page: {
                    margin: {
                        top: cmToTwip(formatting.marginsCm.top),
                        right: cmToTwip(formatting.marginsCm.right),
                        bottom: cmToTwip(formatting.marginsCm.bottom),
                        left: cmToTwip(formatting.marginsCm.left)
                    }
                }
            },
            children: buildDocxParagraphs(content, formatting)
        }]
    });

    return Packer.toBuffer(document);
}
