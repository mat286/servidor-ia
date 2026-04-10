import React, { useState, useEffect } from 'react';
import ChatComponent from './components/ChatComponent';
import DocumentUploadComponent from './components/DocumentUploadComponent';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function App() {
  const getCurrentView = () => window.location.pathname.startsWith('/documentos') ? 'documentos' : 'chat';

  const [selectedAgent, setSelectedAgent] = useState('auto');
  const [currentView, setCurrentView] = useState(getCurrentView());
  const [uploadSuccess, setUploadSuccess] = useState(null);
  const [agents, setAgents] = useState([]);
  const [loadingAgents, setLoadingAgents] = useState(true);

  useEffect(() => {
    const onPopState = () => setCurrentView(getCurrentView());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateTo = (view) => {
    const nextPath = view === 'documentos' ? '/documentos' : '/';
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    setCurrentView(view);
  };

  // Cargar agentes disponibles desde el backend
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const response = await fetch(`${API_URL}/agentes`);
        const data = await response.json();
        
        // Mapear agentes con iconos y colores
        const agentMap = {
          'conversacional': { icon: '🆔', name: 'conversacional', color: '#f093fb' },
          'documental': { icon: '📄', name: 'Documental', color: '#4facfe' },
          'soporteTecnico': { icon: '🛠️', name: 'Soporte Técnico', color: '#667eea' },
          'general': { icon: '🔒', name: 'Asistente Privado', color: '#43e97b' },
          'editor': { icon: '✍️', name: 'Editor de Documentos', color: '#9b59b6' },
          'bi': { icon: '📈', name: 'BI y Reportes', color: '#ff9f43' },
          'esidif': { icon: '🏛️', name: 'e-SIDIF', color: '#00b894' }
        };

        const formattedAgents = data.agentes.map(agent => ({
          id: agent.nombre,
          name: agentMap[agent.nombre]?.name || agent.nombre,
          icon: agentMap[agent.nombre]?.icon || '🤖',
          color: agentMap[agent.nombre]?.color || '#667eea',
          hasDocuments: agent.info?.tieneDocumentos || false,
          domain: agent.info?.dominio || agent.nombre
        }));

        setAgents(formattedAgents);
      } catch (error) {
        console.error('Error cargando agentes:', error);
        // Fallback a agentes por defecto
        setAgents([
          { id: 'conversacional', name: 'conversacional', icon: '🆔', color: '#f093fb', hasDocuments: false },
          { id: 'documental', name: 'Documental', icon: '📄', color: '#4facfe', hasDocuments: false },
          { id: 'soporteTecnico', name: 'Soporte Técnico', icon: '🛠️', color: '#667eea', hasDocuments: false },
          { id: 'general', name: 'Asistente Privado', icon: '🔒', color: '#43e97b', hasDocuments: false },
          { id: 'editor', name: 'Editor de Documentos', icon: '✍️', color: '#9b59b6', hasDocuments: false },
          { id: 'bi', name: 'BI y Reportes', icon: '📈', color: '#ff9f43', hasDocuments: false },
          { id: 'esidif', name: 'e-SIDIF', icon: '🏛️', color: '#00b894', hasDocuments: false }
        ]);
      } finally {
        setLoadingAgents(false);
      }
    };

    fetchAgents();
  }, []);

  const handleUploadSuccess = (doc) => {
    setUploadSuccess(doc);
    // Recargar agentes para actualizar estado de documentos
    setTimeout(() => {
      setUploadSuccess(null);
      fetch(`${API_URL}/agentes`)
        .then(res => res.json())
        .then(data => {
          const agentMap = {
            'conversacional': { icon: '🆔', name: 'conversacional', color: '#f093fb' },
            'documental': { icon: '📄', name: 'Documental', color: '#4facfe' },
            'soporteTecnico': { icon: '🛠️', name: 'Soporte Técnico', color: '#667eea' },
            'general': { icon: '🔒', name: 'Asistente Privado', color: '#43e97b' },
            'editor': { icon: '✍️', name: 'Editor de Documentos', color: '#9b59b6' },
            'bi': { icon: '📈', name: 'BI y Reportes', color: '#ff9f43' },
            'esidif': { icon: '🏛️', name: 'e-SIDIF', color: '#00b894' }
          };

          const formattedAgents = data.agentes.map(agent => ({
            id: agent.nombre,
            name: agentMap[agent.nombre]?.name || agent.nombre,
            icon: agentMap[agent.nombre]?.icon || '🤖',
            color: agentMap[agent.nombre]?.color || '#667eea',
            hasDocuments: agent.info?.tieneDocumentos || false,
            domain: agent.info?.dominio || agent.nombre
          }));

          setAgents(formattedAgents);
        })
        .catch(console.error);
    }, 3000);
  };

  return (
    <div className="app">
      <div className="app-header">
        <div className="header-content">
          <h1>🤖 Sistema Multi-Agente IA</h1>
          <p>Chat inteligente con agentes especializados y un Asistente Privado para resumir o redactar contenido sensible</p>
        </div>

        <div className="header-actions">
          <div className="top-nav">
            <button
              className={`top-nav-button ${currentView === 'chat' ? 'active' : ''}`}
              onClick={() => navigateTo('chat')}
            >
              💬 Chat
            </button>
            <button
              className={`top-nav-button ${currentView === 'documentos' ? 'active' : ''}`}
              onClick={() => navigateTo('documentos')}
            >
              📂 Documentos
            </button>
          </div>

          <div className="header-status">
            <span className="status-badge">🟢 Conectado</span>
          </div>
        </div>
      </div>

      <div className="app-container">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-section">
            <h3>Agentes Disponibles</h3>
            {loadingAgents ? (
              <div className="loading-agents">Cargando agentes...</div>
            ) : (
              <div className="agents-list">
                {/* Opción Auto */}
                <button
                  className={`agent-button ${selectedAgent === 'auto' ? 'active' : ''}`}
                  onClick={() => setSelectedAgent('auto')}
                  style={{
                    borderLeftColor: selectedAgent === 'auto' ? '#667eea' : 'transparent'
                  }}
                >
                  <span className="agent-icon">🎯</span>
                  <span className="agent-name">Auto (Selección Inteligente)</span>
                  <span className="agent-badge">Nuevo</span>
                </button>

                {/* Lista de agentes */}
                {agents.map(agent => (
                  <button
                    key={agent.id}
                    className={`agent-button ${selectedAgent === agent.id ? 'active' : ''}`}
                    onClick={() => setSelectedAgent(agent.id)}
                    style={{
                      borderLeftColor: selectedAgent === agent.id ? agent.color : 'transparent'
                    }}
                    title={agent.hasDocuments ? 'Tiene documentos cargados' : 'Sin documentos cargados'}
                  >
                    <span className="agent-icon">{agent.icon}</span>
                    <span className="agent-name">{agent.name}</span>
                    {agent.hasDocuments && (
                      <span className="agent-status" title="Tiene documentos">📚</span>
                    )}
                    {!agent.hasDocuments && (
                      <span className="agent-status-empty" title="Sin documentos">⚠️</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="sidebar-divider"></div>

          <div className="sidebar-section">
            <h3>Información</h3>
            <div className="info-box">
              <p>
                <strong>🎯 Modo Auto:</strong> El sistema selecciona automáticamente el agente más apropiado según tu pregunta.
              </p>
            </div>

            <div className="info-box">
              <p>
                <strong>📚 RAG por Dominio:</strong> Cada agente tiene su propia base documental separada.
              </p>
            </div>

            <div className="info-box">
              <p>
                <strong>📝 Citas Obligatorias:</strong> Todas las respuestas incluyen referencias a las fuentes usadas.
              </p>
            </div>

            <div className="info-box">
              <p>
                <strong>⚡ Streaming:</strong> Las respuestas llegan en tiempo real conforme la IA las genera.
              </p>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className={`main-content ${currentView === 'chat' ? 'single-panel' : ''}`}>
          {currentView === 'chat' ? (
            <section className="single-panel-card chat-section">
              <ChatComponent 
                selectedAgent={selectedAgent} 
                agents={agents}
              />
            </section>
          ) : (
            <div className="docs-page">
              <div className="docs-page-header">
                <h2>📂 Gestor de Documentos</h2>
                <p>Área separada para administrar archivos del RAG, dejando el chat principal más amplio y limpio.</p>
              </div>

              <section className="single-panel-card upload-page-card">
                <DocumentUploadComponent
                  onUploadSuccess={handleUploadSuccess}
                  agents={agents}
                />
              </section>
            </div>
          )}
        </main>
      </div>

      <footer className="app-footer">
        <p>
          © 2026 Sistema Multi-Agente IA | Backend en puerto 3000 | Frontend en puerto 3001
        </p>
      </footer>
    </div>
  );
}

export default App;
