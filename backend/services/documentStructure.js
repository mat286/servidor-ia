function detectBlockType(text = "") {
    const trimmed = String(text || "").trim();
    if (!trimmed) return "empty";
    if (/^#{1,6}\s+/.test(trimmed)) return "heading";
    if (/^[-•]\s+/.test(trimmed)) return "bullet";
    if (/^\d+[.)]\s+/.test(trimmed)) return "numbered";
    return "paragraph";
}

export function textToStructuredBlocks(content = "") {
    const lines = String(content || "").replace(/\r/g, "").split("\n");
    const blocks = [];
    let paragraphBuffer = [];

    const flushParagraph = () => {
        const text = paragraphBuffer.join(" ").trim();
        paragraphBuffer = [];
        if (!text) return;
        blocks.push({
            id: `b-${blocks.length + 1}`,
            type: "paragraph",
            text,
            style: { preserveFormatting: true }
        });
    };

    for (const line of lines) {
        const trimmed = line.trim();
        const type = detectBlockType(trimmed);

        if (!trimmed) {
            flushParagraph();
            continue;
        }

        if (type === "paragraph") {
            paragraphBuffer.push(trimmed);
            continue;
        }

        flushParagraph();

        const normalizedText = type === "heading"
            ? trimmed.replace(/^#{1,6}\s+/, "")
            : type === "bullet"
                ? trimmed.replace(/^[-•]\s+/, "")
                : type === "numbered"
                    ? trimmed.replace(/^\d+[.)]\s+/, "")
                    : trimmed;

        blocks.push({
            id: `b-${blocks.length + 1}`,
            type,
            text: normalizedText.trim(),
            style: { preserveFormatting: true }
        });
    }

    flushParagraph();
    return blocks;
}

export function applyDocumentOperations(blocks = [], operations = []) {
    const working = Array.isArray(blocks) ? [...blocks] : [];
    const safeOps = Array.isArray(operations) ? operations : [];

    for (const op of safeOps) {
        const action = String(op?.action || "").toLowerCase();
        const index = Number(op?.index);
        const text = String(op?.text || "").trim();
        const type = ["paragraph", "heading", "bullet", "numbered"].includes(op?.type)
            ? op.type
            : "paragraph";

        if (!Number.isInteger(index) || index < 0) continue;

        if (action === "replace" && index < working.length) {
            working[index] = {
                ...working[index],
                type,
                text: text || working[index].text
            };
            continue;
        }

        if (action === "delete" && index < working.length) {
            working.splice(index, 1);
            continue;
        }

        if (action === "insert") {
            const newBlock = {
                id: `b-${Date.now()}-${index}`,
                type,
                text,
                style: { preserveFormatting: true }
            };
            const target = Math.min(index, working.length);
            working.splice(target, 0, newBlock);
        }
    }

    return working;
}

export function structuredBlocksToText(blocks = []) {
    return (Array.isArray(blocks) ? blocks : [])
        .map((block) => {
            const text = String(block?.text || "").trim();
            if (!text) return "";

            if (block.type === "heading") return `# ${text}`;
            if (block.type === "bullet") return `- ${text}`;
            if (block.type === "numbered") return `1. ${text}`;
            return text;
        })
        .filter(Boolean)
        .join("\n\n");
}
