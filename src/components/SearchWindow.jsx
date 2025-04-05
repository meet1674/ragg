// src/components/SearchWindow.jsx
import React from "react";
import useSearch from "../hooks/useSearch";
import "../styles/SearchWindow.css";

const SearchWindow = ({ previousChats, onSelectChat, setFilteredChat }) => {
  const {
    firstInput,
    setFirstInput,
    searchType,
    setSearchType,
    naturalQuery,
    setNaturalQuery,
    summary,
    filteredChats,
    chatMessages,
    chatInput,
    setChatInput,
    searchResults,
    isLoading,
    searchContext,
    chatHistoryRef,
    handleStructuredSearch,
    handleNaturalSearch,
    handleChatPrompt,
  } = useSearch({ previousChats, handleSelectChat: (chat) => {
    onSelectChat(chat);
    setFilteredChat(chat);
  } });

  const handleStructuredSubmit = (e) => {
    e.preventDefault();
    handleStructuredSearch(e);
  };

  const handleChatSubmit = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleChatPrompt();
    }
  };

  return (
    <div className="search-container">
      {/* Structured Search */}
      <form onSubmit={handleStructuredSubmit} className="search-bar structured-search">
        <input
          type="text"
          placeholder="Structured Search (e.g., 'thermodynamics' or '17th March')"
          value={firstInput}
          onChange={(e) => setFirstInput(e.target.value)}
        />
        <select value={searchType} onChange={(e) => setSearchType(e.target.value)}>
          <option value="content">Search By Content</option>
          <option value="chat_name">Search By Chat Name</option>
          <option value="date">Search By Date</option>
          <option value="system_instructions">Search By System Instructions</option>
        </select>
        <button type="submit" disabled={isLoading}>
          {isLoading ? "Searching..." : "Search"}
        </button>
      </form>

      {/* Natural Search */}
      <div className="natural-search">
        <input
          type="text"
          placeholder="Ask naturally (e.g., 'Chats about chemistry', 'Chats from 17th March')..."
          value={naturalQuery}
          onChange={(e) => setNaturalQuery(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && handleNaturalSearch()}
        />
        <button onClick={handleNaturalSearch} disabled={isLoading}>
          {isLoading ? "Searching..." : "Natural Search"}
        </button>
      </div>

      {/* Summary and Context */}
      {summary && <div className="summary">{summary}</div>}
      {searchContext && <div className="search-context">{searchContext}</div>}

      {/* Chat Interface */}
      <div className="chat-interface">
        <div className="chat-history" ref={chatHistoryRef}>
          {chatMessages.map((msg, index) => (
            <div key={index} className={`chat-message ${msg.role.toLowerCase()}`}>
              <div className="message-content">
                <strong>{msg.role}:</strong> {msg.message}
              </div>
            </div>
          ))}
        </div>
        <div className="chat-input">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleChatSubmit}
            placeholder="Type a prompt to search chats..."
          />
          <button onClick={handleChatPrompt} disabled={isLoading}>Send</button>
        </div>
      </div>

      {/* Search Results */}
      <div className="search-results">
        {filteredChats.length > 0 ? (
          <ul>
            {filteredChats.map((chat) => (
              <li key={chat.id} onClick={() => onSelectChat(chat)}>
                <strong>{chat.title}</strong> (ID: {chat.id}, Timestamp: {chat.timestamp})
                <p><em>System Instructions:</em> {chat.system_instructions || "None"}</p>
                {chat.duplicates && chat.duplicates.length > 0 && (
                  <div>
                    <em>Also found in:</em>
                    <ul>
                      {chat.duplicates.map((dup) => (
                        <li key={dup.id}>
                          ID: {dup.id}, Timestamp: {dup.timestamp}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <ul>
                  {chat.messages.map((msg, index) => (
                    <li key={index}>
                      <strong>{msg.role}:</strong> {msg.message} (at {msg.timestamp})
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p>{searchContext ? "No results found for your query." : "Enter a query to search chats."}</p>
        )}
      </div>

      {/* Raw Search Results */}
      <div className="search-window">
        <div className="search-results">
          {searchResults.length > 0 ? (
            searchResults.map((chat, index) => (
              <div
                key={index}
                className="search-result-item"
                onClick={() => onSelectChat({
                  id: chat.serial_number,
                  title: chat.chat_name,
                  timestamp: chat.timestamp,
                  system_instructions: chat.system_instructions,
                  messages: chat.messages,
                })}
              >
                <h4>{chat.chat_name}</h4>
                <p>{chat.timestamp}</p>
                <p>{chat.system_instructions || "No system instructions"}</p>
                <ul>
                  {chat.messages.slice(0, 3).map((msg, idx) => (
                    <li key={idx}>
                      <strong>{msg.role}:</strong> {msg.message}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default SearchWindow;