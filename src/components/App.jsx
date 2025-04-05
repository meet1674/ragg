// src/components/App.jsx
import React, { useState } from "react";
import Sidebar from "./sidebar";
import ChatWindow from "./ChatWindow";
import SearchWindow from "./SearchWindow";
import useChat from "../hooks/useChat";
import useSearch from "../hooks/useSearch";
import "../styles/App.css";
import "../styles/index.css";

class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Error caught in ErrorBoundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div>
          <h1>Something went wrong.</h1>
          <p>{this.state.error?.toString()}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

const App = () => {
  const [mode, setMode] = useState("chat");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [isTemporary, setIsTemporary] = useState(false);
  const [isDeepSearchEnabled, setIsDeepSearchEnabled] = useState(false);

  const {
    currentChat,
    setCurrentChat,
    previousChats,
    isLoading,
    currentSerialNumber,
    setCurrentSerialNumber,
    handleSendMessage,
    handleNewChat,
    handleSelectChat,
    handleRenameChat,
    handleDeleteChat,
    handleFileUpload,
  } = useChat({ instructions, isTemporary });

  const { filteredChat, setFilteredChat } = useSearch({ previousChats, handleSelectChat });

  const handleToggleInstructions = () => {
    setIsInstructionsOpen(!isInstructionsOpen);
  };

  const handleInstructionsChange = (event) => {
    setInstructions(event.target.value);
  };

  const handleModeSwitch = (newMode) => {
    setMode(newMode);
    setCurrentChat(null);
    setCurrentSerialNumber(null);
  };

  const toggleDeepSearch = () => {
    setIsDeepSearchEnabled(!isDeepSearchEnabled);
    // You can add additional deep search toggle logic here
    console.log(`Deep Search is now ${!isDeepSearchEnabled ? "enabled" : "disabled"}`);
  };

  return (
    <ErrorBoundary>
      <div className="app-container">
        <div className="mode-switch-icons">
          <div className="temporary-chat">
            <label title="Temporary Chat (Not Saved)">
              <input
                type="checkbox"
                checked={isTemporary}
                onChange={(e) => setIsTemporary(e.target.checked)}
              />
              <span className="temporary-chat-icon">⏳</span>
            </label>
          </div>
          <button
            className={`mode-button ${mode === "chat" ? "active" : ""}`}
            onClick={() => handleModeSwitch("chat")}
            title="Chat Mode"
          >
            🗨️
          </button>
          <button
            className={`mode-button ${mode === "search" ? "active" : ""}`}
            onClick={() => handleModeSwitch("search")}
            title="Search Mode"
          >
            🔍
          </button>
          <button
            id="deepSearchBtn"
            className={`deep-search-btn ${isDeepSearchEnabled ? "enabled" : "disabled"}`}
            onClick={toggleDeepSearch}
            title={isDeepSearchEnabled ? "Disable Deep Search" : "Enable Deep Search"}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" 
                fill={isDeepSearchEnabled ? "#fff" : "#aaa"}
              />
            </svg>
            <span>Deep Search</span>
          </button>
        </div>

        {/* Rest of your component remains the same */}
        <button
          className="sidebar-toggle-btn"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        >
          ☰
        </button>
        
        {isSidebarOpen && (
          <div className="sidebar-overlay">
            <Sidebar
              previousChats={previousChats}
              onSelectChat={handleSelectChat}
              onNewChat={handleNewChat}
              activeChat={currentChat}
              onRenameChat={handleRenameChat}
              onDeleteChat={handleDeleteChat}
              isLoading={isLoading}
            />
            <button
              className="close-sidebar-btn"
              onClick={() => setIsSidebarOpen(false)}
            >
              ✕
            </button>
          </div>
        )}

        <div className="main-content">
          <div className="chat-container">
            {mode === "chat" && (
              <div className="system-instructions-toggle">
                <button
                  className="instructions-toggle-btn"
                  onClick={handleToggleInstructions}
                >
                  System Instructions
                  <span className={`arrow ${isInstructionsOpen ? "open" : ""}`}>
                    ▼
                  </span>
                </button>
                {isInstructionsOpen && (
                  <div className="instructions-container">
                    <textarea
                      className="instructions-input"
                      value={instructions}
                      onChange={handleInstructionsChange}
                      placeholder="Enter system instructions..."
                    />
                  </div>
                )}
              </div>
            )}
            {mode === "chat" ? (
              <ChatWindow
                chat={filteredChat || currentChat}
                onSendMessage={handleSendMessage}
                onFileUpload={handleFileUpload}
                serialNumber={currentSerialNumber}
                instructions={instructions}
                isTemporary={isTemporary}
              />
            ) : (
              <SearchWindow
                previousChats={previousChats}
                onSelectChat={handleSelectChat}
                setFilteredChat={setFilteredChat}
              />
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default App;