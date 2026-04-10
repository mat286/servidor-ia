import React, { useState } from 'react';
import axios from 'axios';
import './DocumentUploadComponent.css';

const DocumentUploadComponent = ({ onUploadSuccess, agents = [] }) => {
  const [file, setFile] = useState(null);
  const [selectedDomain, setSelectedDomain] = useState('general');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [documents, setDocuments] = useState([]);
  const [error, setError] = useState('');
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const allowedTypes = ['.pdf', '.txt', '.md', '.doc', '.docx'];

  // Mapear dominios disponibles
  const availableDomains = agents.length > 0
    ? agents.map(agent => ({
        id: agent.domain || agent.id,
        name: agent.name,
        icon: agent.icon
      }))
    : [
        { id: 'general', name: 'Asistente Privado', icon: '🔒' },
        { id: 'editor', name: 'Editor de Documentos', icon: '✍️' },
        { id: 'conversacional', name: 'Atención DNI', icon: '🆔' },
        { id: 'documental', name: 'Documental', icon: '📄' },
        { id: 'soporteTecnico', name: 'Soporte Técnico', icon: '🛠️' },
        { id: 'bi', name: 'BI y Reportes', icon: '📈' },
        { id: 'esidif', name: 'e-SIDIF', icon: '🏛️' }
      ];

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];

    if (selectedFile) {
      const fileExtension = '.' + selectedFile.name.split('.').pop().toLowerCase();

      if (!allowedTypes.includes(fileExtension)) {
        setError(`Formato no permitido. Solo: ${allowedTypes.join(', ')}`);
        setFile(null);
        return;
      }

      if (selectedFile.size > 20 * 1024 * 1024) {
        setError('El archivo es muy grande (máximo 20MB)');
        setFile(null);
        return;
      }

      setError('');
      setFile(selectedFile);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();

    if (!file) {
      setError('Por favor selecciona un archivo');
      return;
    }

    if (!selectedDomain) {
      setError('Por favor selecciona un dominio');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Usar el nuevo endpoint con dominio
      const response = await axios.post(
        `${API_URL}/rag/upload/${selectedDomain}`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      setMessage(`✅ ${response.data.message || 'Documento cargado e indexado correctamente'}`);

      // Agregar documento a la lista
      const newDoc = {
        id: Date.now(),
        name: file.name,
        size: (file.size / 1024 / 1024).toFixed(2),
        uploadedAt: new Date().toLocaleString(),
        filename: response.data.file,
        domain: selectedDomain
      };

      setDocuments(prev => [...prev, newDoc]);
      setFile(null);

      // Limpiar input
      const input = document.querySelector('input[type="file"]');
      if (input) input.value = '';

      // Callback al componente padre
      if (onUploadSuccess) {
        onUploadSuccess(newDoc);
      }

      // Limpiar mensaje después de 5 segundos
      setTimeout(() => setMessage(''), 5000);
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      setError(`❌ Error: ${errorMsg}`);
      
      // Si el error menciona dominios disponibles, mostrarlos
      if (err.response?.data?.dominiosDisponibles) {
        setError(`❌ Error: ${errorMsg}\n\nDominios disponibles: ${err.response.data.dominiosDisponibles.join(', ')}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="upload-container">
      <div className="upload-header">
        <h2>📂 Gestor de Documentos</h2>
        <p>Sube archivos PDF, TXT, MD, DOC o DOCX a un dominio específico del sistema RAG</p>
      </div>

      <form className="upload-form" onSubmit={handleUpload}>
        {/* Selector de dominio */}
        <div className="domain-selector">
          <label htmlFor="domain-select" className="domain-label">
            <strong>📁 Seleccionar Dominio:</strong>
          </label>
          <select
            id="domain-select"
            value={selectedDomain}
            onChange={(e) => setSelectedDomain(e.target.value)}
            className="domain-select"
            disabled={loading}
          >
            {availableDomains.map(domain => (
              <option key={domain.id} value={domain.id}>
                {domain.icon} {domain.name}
              </option>
            ))}
          </select>
          <small className="domain-hint">
            Cada dominio tiene su propia base documental separada
          </small>
        </div>

        <div className="file-input-wrapper">
          <label htmlFor="file-input" className="file-label">
            {file ? (
              <>
                <span className="file-icon">✓</span>
                <span className="file-name">{file.name}</span>
                <span className="file-size">
                  ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </span>
              </>
            ) : (
              <>
                <span className="file-icon">📄</span>
                <span className="file-text">
                  Arrastra archivos aquí o haz clic
                </span>
                <span className="file-hint">
                  Soportados: PDF, TXT, MD, DOC, DOCX (máx 20MB)
                </span>
              </>
            )}
          </label>

          <input
            id="file-input"
            type="file"
            onChange={handleFileChange}
            accept=".pdf,.txt,.md,.doc,.docx"
            className="file-input"
            disabled={loading}
          />
        </div>

        {error && <div className="error-message">{error}</div>}

        {message && <div className="success-message">{message}</div>}

        <button
          type="submit"
          disabled={!file || !selectedDomain || loading}
          className="upload-button"
        >
          {loading ? '⏳ Subiendo e indexando...' : `⬆️ Cargar a ${availableDomains.find(d => d.id === selectedDomain)?.name || selectedDomain}`}
        </button>
      </form>

      {documents.length > 0 && (
        <div className="documents-list">
          <h3>📚 Documentos Cargados ({documents.length})</h3>
          <div className="docs-table">
            <div className="docs-header">
              <div className="doc-name">Archivo</div>
              <div className="doc-domain">Dominio</div>
              <div className="doc-size">Tamaño</div>
              <div className="doc-date">Fecha</div>
            </div>

            {documents.map(doc => (
              <div key={doc.id} className="doc-row">
                <div className="doc-name">
                  <span className="doc-type-icon">
                    {doc.filename?.endsWith('.pdf')
                      ? '📕'
                      : doc.filename?.endsWith('.md')
                        ? '📝'
                        : '📄'}
                  </span>
                  {doc.name}
                </div>
                <div className="doc-domain">
                  <span className="domain-badge">
                    {availableDomains.find(d => d.id === doc.domain)?.icon || '📁'} {doc.domain}
                  </span>
                </div>
                <div className="doc-size">{doc.size} MB</div>
                <div className="doc-date">{doc.uploadedAt}</div>
              </div>
            ))}
          </div>

          <div className="docs-info">
            <p>
              💡 Los documentos cargados se indexan automáticamente en el dominio seleccionado.
              Solo el agente correspondiente a ese dominio podrá usar esta información.
            </p>
            <p>
              📝 Cada documento se divide en chunks con metadata (documento, página, ID) para
              permitir citas precisas en las respuestas.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentUploadComponent;
