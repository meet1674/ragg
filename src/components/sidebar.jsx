// src/components/Sidebar.jsx
import React, { useState, useEffect } from "react";
import { deleteChat, getChatHistory } from "../services/api"; // Assume getChatHistory fetches chathistory.json

const Sidebar = ({
  onSelectChat,
  onNewChat,
  activeChat,
  onRenameChat,
  onDeleteChat,
  isLoading,
}) => {
  const [menuOpen, setMenuOpen] = useState(null);
  const [chatHistory, setChatHistory] = useState({
    today: [],
    yesterday: [],
    last7Days: [],
  });

  // Fetch chat history on mount
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const history = await getChatHistory();
        const chats = history.file ? JSON.parse(history.file).chats : [];
        organizeChatsByDate(chats);
      } catch (error) {
        console.error("Error fetching chat history:", error);
      }
    };
    fetchHistory();
  }, []);

  // Organize chats into today, yesterday, and last 7 days
  const organizeChatsByDate = (chats) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);

    const todayChats = [];
    const yesterdayChats = [];
    const last7DaysChats = [];

    chats.forEach((chat) => {
      const chatDate = new Date(chat.timestamp);
      const chatObj = {
        id: chat.serial_number, // Use serial_number from backend
        title: chat.chat_name || "Untitled Chat",
        timestamp: chat.timestamp,
        lastMessage: chat.messages.length > 0 ? chat.messages[chat.messages.length - 1].content : "",
      };

      if (chatDate.toDateString() === today.toDateString()) {
        todayChats.push(chatObj);
      } else if (chatDate.toDateString() === yesterday.toDateString()) {
        yesterdayChats.push(chatObj);
      } else if (chatDate >= sevenDaysAgo) {
        last7DaysChats.push(chatObj);
      }
    });

    setChatHistory({
      today: todayChats.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)), // Sort by recency
      yesterday: yesterdayChats.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
      last7Days: last7DaysChats.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
    });
  };

  const toggleMenu = (chatId) => {
    setMenuOpen(menuOpen === chatId ? null : chatId);
  };

  const handleSelectChat = (chat) => {
    if (onSelectChat) {
      onSelectChat(chat); // Pass chat object with id (serial_number)
    }
  };

  const handleDeleteChat = async (chat) => {
    try {
      await deleteChat(chat.id); // Call backend DELETE /deleteChat
      onDeleteChat(chat);
      setChatHistory((prev) => ({
        today: prev.today.filter((c) => c.id !== chat.id),
        yesterday: prev.yesterday.filter((c) => c.id !== chat.id),
        last7Days: prev.last7Days.filter((c) => c.id !== chat.id),
      }));
    } catch (error) {
      console.error("Error deleting chat:", error);
    }
  };

  const renderChatList = (chats) => {
    return chats.map((chat) => (
      <li
        key={chat.id}
        className={activeChat?.id === chat.id ? "active" : ""}
        onClick={() => handleSelectChat(chat)}
        title={chat.lastMessage} // Hover to show last message
      >
        <span>{chat.title}</span>
        <span className="timestamp">
          {new Date(chat.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        <button
          className="menu-btn"
          onClick={(e) => {
            e.stopPropagation();
            toggleMenu(chat.id);
          }}
        >
          ⋯
        </button>
        {menuOpen === chat.id && (
          <div className="chat-menu">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRenameChat(chat);
                setMenuOpen(null);
              }}
            >
              Rename
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteChat(chat);
                setMenuOpen(null);
              }}
            >
              Delete
            </button>
          </div>
        )}
      </li>
    ));
  };

  if (isLoading) {
    return <div className="sidebar">Loading chat history...</div>;
  }

  return (
    <div className="sidebar">
      <h2>Chat History</h2>
      <button className="new-chat-btn" onClick={onNewChat}>
        + New Chat
      </button>
      {chatHistory.today.length === 0 &&
      chatHistory.yesterday.length === 0 &&
      chatHistory.last7Days.length === 0 ? (
        <p>No previous chats found.</p>
      ) : (
        <>
          {chatHistory.today.length > 0 && (
            <>
              <h3>Today</h3>
              <ul className="chat-list">{renderChatList(chatHistory.today)}</ul>
            </>
          )}
          {chatHistory.yesterday.length > 0 && (
            <>
              <h3>Yesterday</h3>
              <ul className="chat-list">{renderChatList(chatHistory.yesterday)}</ul>
            </>
          )}
          {chatHistory.last7Days.length > 0 && (
            <>
              <h3>Last 7 Days</h3>
              <ul className="chat-list">{renderChatList(chatHistory.last7Days)}</ul>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default Sidebar;