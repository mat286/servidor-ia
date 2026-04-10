import React, { useState, useRef, useEffect } from 'react';
import './ChatComponent.css';

const MAX_HISTORY_MESSAGES = 12;
const PRIVATE_AGENT_ID = 'general';
const EDITOR_AGENT_ID = 'editor';
const PRIVATE_ALLOWED_TYPES = ['.pdf', '.txt', '.md', '.doc', '.docx'];
const DEFAULT_EDITOR_FORMAT = {
    outputType: 'docx',
    fontFamily: 'Arial',
    fontSize: 12,
    lineSpacing: 1.15,
    firstLineIndentCm: 1.25,
    alignment: 'justify',
    marginTopCm: 2.5,
    marginRightCm: 2,
    marginBottomCm: 2.5,
    marginLeftCm: 3
};
const getHistoryStorageKey = (agentId) => `chat_history_${agentId || 'auto'}`;

const escapeHtml = (text) => String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatInlineMarkdown = (text) => {
    if (!text) return '';

    return escapeHtml(text)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>');
};

const stripReferencesFromText = (text) => String(text ?? '')
    .replace(/\n?\s*---\s*\n?\*{0,2}(Referencias|Fuentes)\*{0,2}:?[\s\S]*$/i, '')
    .trim();

const getCitationInfo = (citation, domain, apiUrl) => {
    const label = typeof citation === 'string'
        ? citation
        : citation?.label || citation?.text || citation?.document || 'Referencia';

    const pageMatch = label.match(/,\s*p[áa]gina\s*(\d+)/i);
    const fileName = label.replace(/,\s*p[áa]gina\s*\d+.*$/i, '').trim();
    const href = fileName && domain
        ? `${apiUrl}/rag/file/${encodeURIComponent(domain)}/${encodeURIComponent(fileName)}${pageMatch ? `#page=${pageMatch[1]}` : ''}`
        : null;

    return { label, href };
};

const formatFileSize = (size = 0) => {
    if (size >= 1024 * 1024) {
        return `${(size / 1024 / 1024).toFixed(2)} MB`;
    }

    return `${(size / 1024).toFixed(1)} KB`;
};

const renderFormattedMessage = (text) => {
    if (!text) return null;

    const lines = text.split('\n').filter(line => line.trim() !== '');

    return lines.map((line, idx) => {
        const trimmed = line.trim();

        if (/^#{1,6}\s/.test(trimmed)) {
            const content = trimmed.replace(/^#{1,6}\s/, '');
            return <h4 key={idx} dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(content) }} />;
        }

        if (/^[-•]\s/.test(trimmed)) {
            const content = trimmed.replace(/^[-•]\s/, '');
            return (
                <div key={idx} className="message-list-item">
                    <span className="message-bullet">•</span>
                    <span dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(content) }} />
                </div>
            );
        }

        if (/^\d+[.)]\s/.test(trimmed)) {
            const number = trimmed.match(/^\d+[.)]/)?.[0] || '';
            const content = trimmed.replace(/^\d+[.)]\s/, '');
            return (
                <div key={idx} className="message-list-item message-list-numbered">
                    <span className="message-bullet">{number}</span>
                    <span dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(content) }} />
                </div>
            );
        }

        return <p key={idx} dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(trimmed) }} />;
    });
};

const buildHistoryPayload = (messages) => {
    return messages
        .filter(msg => (msg.sender === 'user' || msg.sender === 'ai') && msg.text)
        .slice(-8)
        .map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: stripReferencesFromText(String(msg.text)).slice(0, 900)
        }));
};

const buildEditorDocumentRequest = (messages, selectedFileName = '', hasWorkingDraft = false) => {
    const conversationHistory = messages
        .filter(msg => msg.sender === 'user' && msg.text)
        .slice(-10)
        .map(msg => ({
            role: 'user',
            content: stripReferencesFromText(String(msg.text)).slice(0, 1200)
        }));

    const userRequests = conversationHistory
        .filter(item => item.role === 'user' && item.content)
        .map((item, idx) => `${idx + 1}. ${item.content}`)
        .join('\n');

    return {
        conversationHistory,
        hasConversation: conversationHistory.some(item => item.role === 'user' && item.content),
        instructions: userRequests
            ? `Trabajá sobre ${hasWorkingDraft ? 'la última versión ya modificada' : `el archivo ${selectedFileName || 'seleccionado'}`} y aplicá únicamente los pedidos explícitos que surgen del chat. Si hubo preguntas informativas, usalas solo como contexto.\n\nPedidos del usuario:\n${userRequests}`
            : `Trabajá sobre ${hasWorkingDraft ? 'la última versión ya modificada' : `el archivo ${selectedFileName || 'seleccionado'}`} y generá un borrador claro y fiel a lo conversado.`
    };
};

const ChatComponent = ({ selectedAgent = 'auto', agents = [] }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [currentAgentInfo, setCurrentAgentInfo] = useState(null);
    const [historyReady, setHistoryReady] = useState(false);
    const [privateFiles, setPrivateFiles] = useState([]);
    const [privateUploadFile, setPrivateUploadFile] = useState(null);
    const [privateActionLoading, setPrivateActionLoading] = useState(false);
    const [privateActionMessage, setPrivateActionMessage] = useState('');
    const [privateActionError, setPrivateActionError] = useState('');
    const [showPrivatePanel, setShowPrivatePanel] = useState(false);
    const [fileSearchTerm, setFileSearchTerm] = useState('');
    const [selectedEditorFile, setSelectedEditorFile] = useState('');
    const [editorInstructions, setEditorInstructions] = useState('');
    const [editorFormat, setEditorFormat] = useState(DEFAULT_EDITOR_FORMAT);
    const [generatedDocument, setGeneratedDocument] = useState(null);
    const [editorWorkingContent, setEditorWorkingContent] = useState('');
    const [showEditorPreviewModal, setShowEditorPreviewModal] = useState(false);
    const [showDownloadOptions, setShowDownloadOptions] = useState(false);
    const messagesEndRef = useRef(null);
    const privateFileInputRef = useRef(null);
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const isPrivateAssistant = selectedAgent === PRIVATE_AGENT_ID;
    const isEditorAgent = selectedAgent === EDITOR_AGENT_ID;
    const supportsManagedFiles = isPrivateAssistant || isEditorAgent;
    const managedDomain = supportsManagedFiles ? selectedAgent : PRIVATE_AGENT_ID;
    const filteredPrivateFiles = privateFiles.filter(file => {
        const query = fileSearchTerm.trim().toLowerCase();
        if (!query) return true;

        return `${file.originalName || ''} ${file.filename || ''}`.toLowerCase().includes(query);
    });
    const selectedEditorFileInfo = privateFiles.find(file => file.filename === selectedEditorFile) || null;

    const updateEditorFormat = (field, value) => {
        setEditorFormat(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const resetEditorSessionState = () => {
        setGeneratedDocument(null);
        setEditorWorkingContent('');
        setShowEditorPreviewModal(false);
        setShowDownloadOptions(false);
    };

    const handleSelectEditorFile = (fileName, label = '') => {
        setSelectedEditorFile(fileName || '');
        resetEditorSessionState();
        setPrivateActionError('');
        if (fileName) {
            setPrivateActionMessage(`📄 Archivo activo: ${label || fileName}`);
        }
    };

    // Auto-scroll al final cuando hay nuevos mensajes
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        setHistoryReady(false);

        try {
            const saved = localStorage.getItem(getHistoryStorageKey(selectedAgent));
            if (!saved) {
                setMessages([]);
                setHistoryReady(true);
                return;
            }

            const parsed = JSON.parse(saved);
            const hydratedMessages = Array.isArray(parsed)
                ? parsed.map(msg => ({
                    ...msg,
                    timestamp: new Date(msg.timestamp || Date.now())
                }))
                : [];

            setMessages(hydratedMessages);
        } catch (error) {
            console.warn('No se pudo cargar el historial local:', error);
            setMessages([]);
        } finally {
            setHistoryReady(true);
        }
    }, [selectedAgent]);

    useEffect(() => {
        if (!historyReady) return;

        try {
            localStorage.setItem(
                getHistoryStorageKey(selectedAgent),
                JSON.stringify(messages.slice(-MAX_HISTORY_MESSAGES))
            );
        } catch (error) {
            console.warn('No se pudo guardar el historial local:', error);
        }
    }, [messages, selectedAgent, historyReady]);

    const clearHistory = () => {
        setMessages([]);
        localStorage.removeItem(getHistoryStorageKey(selectedAgent));
    };

    const loadPrivateFiles = async () => {
        try {
            const response = await fetch(`${API_URL}/rag/files/${managedDomain}`);
            const data = await response.json().catch(() => ({ files: [] }));

            if (!response.ok) {
                throw new Error(data.error || 'No se pudieron listar los archivos');
            }

            const files = data.files || [];
            setPrivateFiles(files);

            if (isEditorAgent) {
                setSelectedEditorFile(prev => {
                    if (prev && files.some(file => file.filename === prev)) {
                        return prev;
                    }
                    return files[0]?.filename || '';
                });
            }
        } catch (error) {
            console.error('Error cargando archivos privados:', error);
            setPrivateActionError(error.message || 'No se pudieron cargar los archivos');
        }
    };

    useEffect(() => {
        if (!supportsManagedFiles) {
            setShowPrivatePanel(false);
            setPrivateUploadFile(null);
            setPrivateActionMessage('');
            setPrivateActionError('');
            setFileSearchTerm('');
            setSelectedEditorFile('');
            setEditorInstructions('');
            setEditorFormat(DEFAULT_EDITOR_FORMAT);
            setGeneratedDocument(null);
            setEditorWorkingContent('');
            setShowEditorPreviewModal(false);
            setShowDownloadOptions(false);
            return;
        }

        loadPrivateFiles();
    }, [supportsManagedFiles, managedDomain, isEditorAgent]);

    const handlePrivateFileChange = (e) => {
        const selectedFile = e.target.files?.[0];

        if (!selectedFile) {
            setPrivateUploadFile(null);
            return;
        }

        const fileExtension = '.' + selectedFile.name.split('.').pop().toLowerCase();

        if (!PRIVATE_ALLOWED_TYPES.includes(fileExtension)) {
            setPrivateActionError(`Formato no permitido. Solo: ${PRIVATE_ALLOWED_TYPES.join(', ')}`);
            setPrivateUploadFile(null);
            return;
        }

        if (selectedFile.size > 20 * 1024 * 1024) {
            setPrivateActionError('El archivo es muy grande (máximo 20MB)');
            setPrivateUploadFile(null);
            return;
        }

        setPrivateActionError('');
        setPrivateActionMessage('');
        setPrivateUploadFile(selectedFile);
    };

    const handlePrivateUpload = async () => {
        if (!privateUploadFile) {
            setPrivateActionError('Seleccioná un archivo primero');
            return;
        }

        const formData = new FormData();
        formData.append('file', privateUploadFile);

        setPrivateActionLoading(true);
        setPrivateActionError('');
        setPrivateActionMessage('');

        try {
            const response = await fetch(`${API_URL}/rag/upload/${managedDomain}`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || `Error ${response.status}`);
            }

            setPrivateActionMessage(`✅ ${data.message || 'Archivo cargado correctamente'}`);
            setGeneratedDocument(null);
            setPrivateUploadFile(null);
            if (isEditorAgent) {
                handleSelectEditorFile(data.file || '', privateUploadFile.name);
            } else {
                setGeneratedDocument(null);
            }
            if (privateFileInputRef.current) {
                privateFileInputRef.current.value = '';
            }
            await loadPrivateFiles();
        } catch (error) {
            console.error('Error subiendo archivo privado:', error);
            setPrivateActionError(error.message || 'No se pudo subir el archivo');
        } finally {
            setPrivateActionLoading(false);
        }
    };

    const handlePrivateDelete = async (fileName) => {
        const confirmed = window.confirm(`¿Querés borrar el archivo "${fileName}" del servidor?`);
        if (!confirmed) {
            return;
        }

        setPrivateActionLoading(true);
        setPrivateActionError('');
        setPrivateActionMessage('');

        try {
            const response = await fetch(`${API_URL}/rag/files/${managedDomain}/${encodeURIComponent(fileName)}`, {
                method: 'DELETE'
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || `Error ${response.status}`);
            }

            if (isEditorAgent && fileName === selectedEditorFile) {
                setSelectedEditorFile('');
                resetEditorSessionState();
            }

            setPrivateActionMessage(`🗑️ ${data.message || 'Archivo eliminado correctamente'}`);
            await loadPrivateFiles();
        } catch (error) {
            console.error('Error eliminando archivo privado:', error);
            setPrivateActionError(error.message || 'No se pudo eliminar el archivo');
        } finally {
            setPrivateActionLoading(false);
        }
    };

    const handleGenerateDocument = async ({ previewOnly = false, autoDownload = false } = {}) => {
        if (!isEditorAgent) {
            return null;
        }

        if (!selectedEditorFile) {
            setPrivateActionError('Seleccioná primero el archivo con el que querés trabajar');
            return null;
        }

        const editorRequest = buildEditorDocumentRequest(
            messages,
            selectedEditorFileInfo?.originalName || selectedEditorFile,
            Boolean(editorWorkingContent.trim())
        );

        if (!editorRequest.hasConversation && !editorWorkingContent.trim()) {
            setPrivateActionError('Primero hablá con el chat sobre el archivo y después usá “Visualizar” o “Descargar”');
            return null;
        }

        setPrivateActionLoading(true);
        setPrivateActionError('');
        setPrivateActionMessage('');

        try {
            const response = await fetch(`${API_URL}/editor/generar-documento`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: selectedEditorFile,
                    instructions: editorRequest.instructions,
                    conversationHistory: editorRequest.conversationHistory,
                    baseContent: editorWorkingContent,
                    previewOnly,
                    outputType: previewOnly ? 'md' : editorFormat.outputType,
                    formatting: {
                        fontFamily: editorFormat.fontFamily,
                        fontSize: Number(editorFormat.fontSize),
                        lineSpacing: Number(editorFormat.lineSpacing),
                        firstLineIndentCm: Number(editorFormat.firstLineIndentCm),
                        alignment: editorFormat.alignment,
                        marginsCm: {
                            top: Number(editorFormat.marginTopCm),
                            right: Number(editorFormat.marginRightCm),
                            bottom: Number(editorFormat.marginBottomCm),
                            left: Number(editorFormat.marginLeftCm)
                        }
                    }
                })
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || `Error ${response.status}`);
            }

            setGeneratedDocument(data);
            setEditorWorkingContent(data.workingContent || data.preview || '');
            setShowEditorPreviewModal(true);

            if (previewOnly) {
                setPrivateActionMessage('👁️ Vista previa actualizada');
            } else {
                setPrivateActionMessage(`✅ ${data.message || 'Documento generado correctamente'}`);
                if (autoDownload && data.downloadUrl) {
                    window.open(`${API_URL}${data.downloadUrl}`, '_blank', 'noopener,noreferrer');
                }
            }

            return data;
        } catch (error) {
            console.error('Error generando documento:', error);
            setPrivateActionError(error.message || 'No se pudo generar el archivo');
            return null;
        } finally {
            setPrivateActionLoading(false);
        }
    };

    const handlePreviewDocument = async () => {
        setShowDownloadOptions(false);
        await handleGenerateDocument({ previewOnly: true });
    };

    const handleOpenDownloadOptions = async () => {
        if (!generatedDocument?.preview) {
            const preview = await handleGenerateDocument({ previewOnly: true });
            if (!preview) {
                return;
            }
        } else {
            setShowEditorPreviewModal(true);
        }

        setShowDownloadOptions(true);
    };

    // Función para streaming con nuevo sistema multi-agente
    const handleStreamingChat = async (prompt) => {
        const history = buildHistoryPayload(messages);
        const tempMessageId = Date.now();
        const newMessage = {
            id: tempMessageId,
            text: prompt,
            sender: 'user',
            timestamp: new Date()
        };
        const effectivePrompt = isEditorAgent && selectedEditorFile
            ? `Archivo activo para esta conversación: ${selectedEditorFileInfo?.originalName || selectedEditorFile}.\nUsá ese archivo como referencia principal. Si el usuario pide cambios, tomalos como instrucciones para la próxima versión del documento.\n\nMensaje del usuario:\n${prompt}`
            : prompt;

        if (isEditorAgent) {
            setGeneratedDocument(null);
            setShowDownloadOptions(false);
        }

        setMessages(prev => [...prev, newMessage]);
        setInput('');
        setLoading(true);
        setCurrentAgentInfo(null);

        try {
            const endpoint = selectedAgent === 'auto'
                ? `${API_URL}/agente/auto`
                : `${API_URL}/agente/${selectedAgent}`;

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "text/event-stream"
                },
                body: JSON.stringify({
                    prompt: effectivePrompt,
                    history,
                    stream: true
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
                throw new Error(errorData.error || `Error ${response.status}`);
            }

            if (!response.body) {
                throw new Error('No response body');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            const aiMessage = {
                id: Date.now() + 1,
                text: '',
                sender: 'ai',
                timestamp: new Date(),
                citations: [],
                agent: null,
                sinInformacion: false
            };

            setMessages(prev => [...prev, aiMessage]);

            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;

                    const data = line.slice(6).trim();
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);

                        if (parsed.type === 'meta') {
                            setCurrentAgentInfo({
                                agent: parsed.agente || selectedAgent,
                                dominio: parsed.dominio || null
                            });
                            continue;
                        }

                        if (parsed.type === 'chunk') {
                            setMessages(prev => {
                                const lastMsg = prev[prev.length - 1];
                                if (lastMsg.sender === 'ai') {
                                    return [
                                        ...prev.slice(0, -1),
                                        { ...lastMsg, text: lastMsg.text + (parsed.content || '') }
                                    ];
                                }
                                return prev;
                            });
                            continue;
                        }

                        if (parsed.type === 'done') {
                            setMessages(prev => {
                                const lastMsg = prev[prev.length - 1];
                                if (lastMsg.sender === 'ai') {
                                    return [
                                        ...prev.slice(0, -1),
                                        {
                                            ...lastMsg,
                                            citations: parsed.citas || [],
                                            agent: parsed.agente || selectedAgent,
                                            dominio: parsed.dominio || null,
                                            sinInformacion: parsed.sinInformacion || false
                                        }
                                    ];
                                }
                                return prev;
                            });

                            setCurrentAgentInfo({
                                agent: parsed.agente || selectedAgent,
                                dominio: parsed.dominio || null
                            });
                            continue;
                        }
                    } catch {
                        setMessages(prev => {
                            const lastMsg = prev[prev.length - 1];
                            if (lastMsg.sender === 'ai') {
                                return [
                                    ...prev.slice(0, -1),
                                    { ...lastMsg, text: lastMsg.text + data }
                                ];
                            }
                            return prev;
                        });
                    }
                }
            }

            setLoading(false);
        } catch (error) {
            console.error('Error en streaming:', error);
            setMessages(prev => [
                ...prev,
                {
                    id: Date.now() + 2,
                    text: `❌ Error: ${error.message}`,
                    sender: 'error',
                    timestamp: new Date()
                }
            ]);
            setLoading(false);
        }
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();

        if (!input.trim()) return;

        await handleStreamingChat(input.trim());
    };

    // Obtener nombre del agente para mostrar
    const getAgentDisplayName = () => {
        if (selectedAgent === 'auto') {
            return currentAgentInfo 
                ? `🎯 Auto → ${currentAgentInfo.agent || 'Seleccionando...'}`
                : '🎯 Auto (Selección Inteligente)';
        }
        
        const agent = agents.find(a => a.id === selectedAgent);
        return agent ? `${agent.icon} ${agent.name}` : selectedAgent;
    };

    return (
        <div className="chat-container">
            <div className="chat-header">
                <div className="chat-header-top">
                    <div>
                        <h2>💬 Chat IA</h2>
                        <p className="agent-display">{getAgentDisplayName()}</p>
                        {currentAgentInfo && currentAgentInfo.dominio && (
                            <small className="domain-info">Dominio: {currentAgentInfo.dominio}</small>
                        )}
                    </div>

                    <div className="chat-header-actions">
                        {supportsManagedFiles && (
                            <button
                                type="button"
                                className="private-panel-toggle"
                                onClick={() => setShowPrivatePanel(prev => !prev)}
                            >
                                {showPrivatePanel
                                    ? '✖️ Cerrar panel'
                                    : isEditorAgent
                                        ? '📎 Archivos del editor'
                                        : '📎 Archivos privados'}
                            </button>
                        )}

                        <button type="button" className="clear-history-button" onClick={clearHistory}>
                            🗑️ Limpiar historial
                        </button>
                    </div>
                </div>
            </div>

            {supportsManagedFiles && showPrivatePanel && (
                <button
                    type="button"
                    className="private-panel-backdrop"
                    aria-label="Cerrar panel de archivos"
                    onClick={() => setShowPrivatePanel(false)}
                />
            )}

            {supportsManagedFiles && (
                <aside className={`private-side-panel ${showPrivatePanel ? 'open' : ''}`}>
                    <div className="private-assistant-tools">
                        <div className="private-tools-header">
                            <strong>{isEditorAgent ? '✍️ Editor de Documentos' : '🔒 Asistente Privado'}</strong>
                            <small>
                                {isEditorAgent
                                    ? 'Subí o elegí un archivo activo. Después conversá con el chat, visualizá el borrador y recién al final descargalo en `.docx`.'
                                    : 'Subí archivos solo para este agente, abrilos o borralos del servidor cuando quieras.'}
                            </small>
                        </div>

                        <div className="private-upload-row">
                            <input
                                ref={privateFileInputRef}
                                type="file"
                                accept=".pdf,.txt,.md,.doc,.docx"
                                onChange={handlePrivateFileChange}
                                disabled={privateActionLoading}
                                className="private-file-input"
                            />
                            <button
                                type="button"
                                className="private-upload-button"
                                onClick={handlePrivateUpload}
                                disabled={!privateUploadFile || privateActionLoading}
                            >
                                {privateActionLoading ? '⏳ Procesando...' : '⬆️ Subir archivo'}
                            </button>
                        </div>

                        {privateUploadFile && (
                            <div className="private-selected-file">
                                Archivo listo: <strong>{privateUploadFile.name}</strong>
                            </div>
                        )}

                        {privateActionError && <div className="private-file-error">❌ {privateActionError}</div>}
                        {privateActionMessage && <div className="private-file-success">{privateActionMessage}</div>}

                        <div className="private-filter-row">
                            <input
                                type="text"
                                value={fileSearchTerm}
                                onChange={(e) => setFileSearchTerm(e.target.value)}
                                placeholder="Buscar archivo..."
                                className="private-search-input"
                            />
                        </div>

                        <div className="private-files-list">
                            <div className="private-files-title">
                                📎 Archivos cargados ({filteredPrivateFiles.length}/{privateFiles.length})
                            </div>

                            {privateFiles.length === 0 ? (
                                <small className="private-files-empty">
                                    {isEditorAgent
                                        ? 'Todavía no hay archivos cargados para el editor.'
                                        : 'Todavía no hay archivos cargados para este asistente.'}
                                </small>
                            ) : filteredPrivateFiles.length === 0 ? (
                                <small className="private-files-empty">No se encontraron archivos con ese filtro.</small>
                            ) : (
                                filteredPrivateFiles.map(file => (
                                    <div key={file.filename} className={`private-file-item ${isEditorAgent && selectedEditorFile === file.filename ? 'active' : ''}`}>
                                        <div>
                                            <div className="private-file-name">{file.originalName || file.filename}</div>
                                            <small className="private-file-meta">
                                                {formatFileSize(file.size)} • {new Date(file.uploadedAt).toLocaleString()}
                                            </small>
                                        </div>

                                        <div className="private-file-actions">
                                            {isEditorAgent && (
                                                <button
                                                    type="button"
                                                    className="private-file-use"
                                                    onClick={() => handleSelectEditorFile(file.filename, file.originalName || file.filename)}
                                                    disabled={privateActionLoading}
                                                >
                                                    {selectedEditorFile === file.filename ? '✅ En uso' : 'Usar'}
                                                </button>
                                            )}
                                            <a
                                                href={`${API_URL}${file.url}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="private-file-link"
                                            >
                                                Abrir
                                            </a>
                                            <button
                                                type="button"
                                                className="private-file-delete"
                                                onClick={() => handlePrivateDelete(file.filename)}
                                                disabled={privateActionLoading}
                                            >
                                                Borrar
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {isEditorAgent && (
                            <div className="editor-generator-box">
                                <div className="editor-generator-title">🧭 Flujo del editor</div>

                                <label className="editor-label">Archivo activo en el chat</label>
                                <select
                                    value={selectedEditorFile}
                                    onChange={(e) => {
                                        const nextFile = privateFiles.find(file => file.filename === e.target.value);
                                        handleSelectEditorFile(e.target.value, nextFile?.originalName || e.target.value);
                                    }}
                                    className="editor-select"
                                    disabled={privateActionLoading || privateFiles.length === 0}
                                >
                                    <option value="">Seleccioná un archivo</option>
                                    {privateFiles.map(file => (
                                        <option key={file.filename} value={file.filename}>
                                            {file.originalName || file.filename}
                                        </option>
                                    ))}
                                </select>

                                <small className="editor-format-help">
                                    1. Elegí un archivo. 2. Conversá con la IA en el chat. 3. Usá <strong>Visualizar</strong> para ver el borrador. 4. Desde ahí descargalo en Word con el formato que quieras.
                                </small>
                            </div>
                        )}
                    </div>
                </aside>
            )}

            {isEditorAgent && (
                <div className="editor-chat-toolbar">
                    <div className="editor-active-file">
                        <strong>📄 Archivo activo: {selectedEditorFileInfo?.originalName || 'ninguno seleccionado'}</strong>
                        <small>
                            {selectedEditorFile
                                ? 'Hablá con el chat sobre este archivo, pedí cambios y después usá “Visualizar”.'
                                : 'Abrí el panel de archivos para subir o elegir el documento con el que querés trabajar.'}
                        </small>
                    </div>

                    <div className="editor-toolbar-actions">
                        <button
                            type="button"
                            className="editor-secondary-button"
                            onClick={handlePreviewDocument}
                            disabled={!selectedEditorFile || privateActionLoading}
                        >
                            {privateActionLoading ? '⏳ Procesando...' : '👁️ Visualizar'}
                        </button>
                        <button
                            type="button"
                            className="editor-primary-button"
                            onClick={handleOpenDownloadOptions}
                            disabled={!selectedEditorFile || privateActionLoading}
                        >
                            ⬇️ Descargar
                        </button>
                    </div>
                </div>
            )}

            <div className="messages-container">
                {messages.length === 0 && (
                    <div className="empty-state">
                        <p>👋 ¡Hola! Comienza una conversación</p>
                        <small>
                            {selectedAgent === 'auto'
                                ? 'El sistema seleccionará automáticamente el agente más apropiado'
                                : selectedAgent === PRIVATE_AGENT_ID
                                    ? 'Usá el botón “Archivos privados” para cargar documentos y pedir resúmenes o redacción.'
                                    : selectedAgent === EDITOR_AGENT_ID
                                        ? 'Subí un archivo, conversá con la IA sobre ese contenido y luego usá “Visualizar” para armar el borrador final.'
                                        : 'Las respuestas se mostrarán en tiempo real con citas'}
                        </small>
                    </div>
                )}

                {messages.map(msg => (
                    <div key={msg.id} className={`message message-${msg.sender}`}>
                        <div className="message-content">
                            <div className="message-text">
                                {renderFormattedMessage(msg.text)}
                            </div>

                            {/* Mostrar citas si existen */}
                            {msg.citations && msg.citations.length > 0 && (
                                <details className="message-citations-details">
                                    <summary className="message-citations-summary">
                                        📚 Referencias ({msg.citations.length})
                                    </summary>
                                    <ul className="message-citations-list">
                                        {msg.citations.map((citation, idx) => {
                                            const { label, href } = getCitationInfo(
                                                citation,
                                                msg.dominio || currentAgentInfo?.dominio || selectedAgent,
                                                API_URL
                                            );

                                            return (
                                                <li key={idx}>
                                                    {href ? (
                                                        <a
                                                            href={href}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="message-citations-link"
                                                            title="Abrir documento fuente"
                                                        >
                                                            {label}
                                                        </a>
                                                    ) : (
                                                        <span>{label}</span>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </details>
                            )}

                            {/* Advertencia si no hay información */}
                            {msg.sinInformacion && (
                                <div className="message-warning">
                                    ⚠️ No hay información suficiente en la base documental para responder esta pregunta.
                                </div>
                            )}

                            {/* Info del agente usado (solo en modo auto) */}
                            {selectedAgent === 'auto' && msg.agent && (
                                <div className="message-agent-info">
                                    <small>Agente usado: {msg.agent}</small>
                                </div>
                            )}

                            <small className="message-time">
                                {msg.timestamp.toLocaleTimeString()}
                            </small>
                        </div>
                    </div>
                ))}

                {loading && (
                    <div className="message message-ai loading">
                        <div className="message-content">
                            <div className="typing-indicator">
                                <span></span>
                                <span></span>
                                <span></span>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {isEditorAgent && showEditorPreviewModal && (
                <>
                    <button
                        type="button"
                        className="editor-modal-backdrop"
                        aria-label="Cerrar vista previa"
                        onClick={() => setShowEditorPreviewModal(false)}
                    />

                    <div className="editor-preview-modal">
                        <div className="editor-preview-card">
                            <div className="editor-preview-header">
                                <div>
                                    <strong>👁️ Vista previa del documento</strong>
                                    <small>{selectedEditorFileInfo?.originalName || selectedEditorFile || 'Sin archivo seleccionado'}</small>
                                </div>
                                <button
                                    type="button"
                                    className="editor-close-button"
                                    onClick={() => setShowEditorPreviewModal(false)}
                                >
                                    ✖
                                </button>
                            </div>

                            <div className="editor-preview-body">
                                {generatedDocument?.preview ? (
                                    <div className="editor-preview-content">
                                        {renderFormattedMessage(generatedDocument.preview)}
                                    </div>
                                ) : (
                                    <div className="editor-preview-empty">
                                        {privateActionLoading ? 'Generando vista previa...' : 'Todavía no hay una vista previa disponible.'}
                                    </div>
                                )}
                            </div>

                            <div className="editor-preview-actions">
                                <button
                                    type="button"
                                    className="editor-secondary-button"
                                    onClick={() => setShowEditorPreviewModal(false)}
                                >
                                    Cerrar
                                </button>
                                <button
                                    type="button"
                                    className="editor-primary-button"
                                    onClick={() => setShowDownloadOptions(prev => !prev)}
                                >
                                    {showDownloadOptions ? 'Ocultar descarga' : '⬇️ Descargar'}
                                </button>
                            </div>

                            {showDownloadOptions && (
                                <div className="editor-download-panel">
                                    <div className="editor-generator-title">Formato del Word final</div>

                                    <div className="editor-format-grid">
                                        <div className="editor-format-field">
                                            <label className="editor-label">Formato</label>
                                            <select
                                                value={editorFormat.outputType}
                                                onChange={(e) => updateEditorFormat('outputType', e.target.value)}
                                                className="editor-select"
                                                disabled={privateActionLoading}
                                            >
                                                <option value="docx">Word (.docx)</option>
                                            </select>
                                        </div>

                                        <div className="editor-format-field">
                                            <label className="editor-label">Fuente</label>
                                            <select
                                                value={editorFormat.fontFamily}
                                                onChange={(e) => updateEditorFormat('fontFamily', e.target.value)}
                                                className="editor-select"
                                                disabled={privateActionLoading}
                                            >
                                                <option value="Arial">Arial</option>
                                                <option value="Calibri">Calibri</option>
                                                <option value="Times New Roman">Times New Roman</option>
                                            </select>
                                        </div>

                                        <div className="editor-format-field">
                                            <label className="editor-label">Tamaño (pt)</label>
                                            <input
                                                type="number"
                                                min="8"
                                                max="24"
                                                step="1"
                                                value={editorFormat.fontSize}
                                                onChange={(e) => updateEditorFormat('fontSize', e.target.value)}
                                                className="editor-input-small"
                                                disabled={privateActionLoading}
                                            />
                                        </div>

                                        <div className="editor-format-field">
                                            <label className="editor-label">Sangría 1° línea (cm)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                max="5"
                                                step="0.1"
                                                value={editorFormat.firstLineIndentCm}
                                                onChange={(e) => updateEditorFormat('firstLineIndentCm', e.target.value)}
                                                className="editor-input-small"
                                                disabled={privateActionLoading}
                                            />
                                        </div>

                                        <div className="editor-format-field">
                                            <label className="editor-label">Interlineado</label>
                                            <select
                                                value={editorFormat.lineSpacing}
                                                onChange={(e) => updateEditorFormat('lineSpacing', e.target.value)}
                                                className="editor-select"
                                                disabled={privateActionLoading}
                                            >
                                                <option value="1">1.0</option>
                                                <option value="1.15">1.15</option>
                                                <option value="1.5">1.5</option>
                                                <option value="2">2.0</option>
                                            </select>
                                        </div>

                                        <div className="editor-format-field">
                                            <label className="editor-label">Alineación</label>
                                            <select
                                                value={editorFormat.alignment}
                                                onChange={(e) => updateEditorFormat('alignment', e.target.value)}
                                                className="editor-select"
                                                disabled={privateActionLoading}
                                            >
                                                <option value="justify">Justificado</option>
                                                <option value="left">Izquierda</option>
                                                <option value="center">Centrado</option>
                                                <option value="right">Derecha</option>
                                            </select>
                                        </div>

                                        <div className="editor-format-field">
                                            <label className="editor-label">Margen sup. (cm)</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="5"
                                                step="0.1"
                                                value={editorFormat.marginTopCm}
                                                onChange={(e) => updateEditorFormat('marginTopCm', e.target.value)}
                                                className="editor-input-small"
                                                disabled={privateActionLoading}
                                            />
                                        </div>

                                        <div className="editor-format-field">
                                            <label className="editor-label">Margen der. (cm)</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="5"
                                                step="0.1"
                                                value={editorFormat.marginRightCm}
                                                onChange={(e) => updateEditorFormat('marginRightCm', e.target.value)}
                                                className="editor-input-small"
                                                disabled={privateActionLoading}
                                            />
                                        </div>

                                        <div className="editor-format-field">
                                            <label className="editor-label">Margen inf. (cm)</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="5"
                                                step="0.1"
                                                value={editorFormat.marginBottomCm}
                                                onChange={(e) => updateEditorFormat('marginBottomCm', e.target.value)}
                                                className="editor-input-small"
                                                disabled={privateActionLoading}
                                            />
                                        </div>

                                        <div className="editor-format-field">
                                            <label className="editor-label">Margen izq. (cm)</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="5"
                                                step="0.1"
                                                value={editorFormat.marginLeftCm}
                                                onChange={(e) => updateEditorFormat('marginLeftCm', e.target.value)}
                                                className="editor-input-small"
                                                disabled={privateActionLoading}
                                            />
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        className="editor-primary-button"
                                        onClick={() => handleGenerateDocument({ previewOnly: false, autoDownload: true })}
                                        disabled={privateActionLoading}
                                    >
                                        {privateActionLoading ? '⏳ Generando Word...' : 'Generar y descargar .docx'}
                                    </button>

                                    {generatedDocument?.downloadUrl && generatedDocument.outputType === 'docx' && (
                                        <a
                                            href={`${API_URL}${generatedDocument.downloadUrl}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="generated-file-link"
                                        >
                                            ⬇️ Descargar nuevamente {generatedDocument.generatedFile || 'resultado.docx'}
                                        </a>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

            <form className="chat-input-form" onSubmit={handleSendMessage}>
                <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder={
                        selectedAgent === 'auto'
                            ? "Escribe tu pregunta (el sistema seleccionará el agente)..."
                            : selectedAgent === EDITOR_AGENT_ID
                                ? "Preguntá sobre el archivo activo o pedí cambios para la próxima versión..."
                                : "Escribe tu pregunta..."
                    }
                    disabled={loading}
                    className="chat-input"
                />
                <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="send-button"
                >
                    {loading ? '⏳' : '➤'}
                </button>
            </form>
        </div>
    );
};

export default ChatComponent;
