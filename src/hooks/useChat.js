// src/hooks/useChat.js
import { useState, useEffect } from "react";
import { sendMessage, deleteChat, uploadFile } from "../services/api";

const useChat = ({ instructions, isTemporary }) => {
  const [currentChat, setCurrentChat] = useState(null);
  const [previousChats, setPreviousChats] = useState({
    today: [],
    yesterday: [],
    last7Days: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [currentSerialNumber, setCurrentSerialNumber] = useState(null);

  useEffect(() => {
    const fetchChatHistory = async () => {
      setIsLoading(true);
      try {
        const response = await fetch("http://127.0.0.1:8000/chathistory.json", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Server error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const parsedData = JSON.parse(data.file);
        if (parsedData.error) {
          console.error("Backend error:", parsedData.error);
          setPreviousChats({ today: [], yesterday: [], last7Days: [] });
        } else if (!parsedData.chats || !Array.isArray(parsedData.chats)) {
          console.warn("Unexpected chat history format:", parsedData);
          setPreviousChats({ today: [], yesterday: [], last7Days: [] });
        } else {
          const today = [];
          const yesterday = [];
          const last7Days = [];

          const now = new Date();
          const todayDate = now.toISOString().split("T")[0];
          const yesterdayDate = new Date(now.setDate(now.getDate() - 1)).toISOString().split("T")[0];

          parsedData.chats.forEach((chat) => {
            if (!chat.serial_number || !chat.chat_name || !chat.timestamp || !Array.isArray(chat.messages)) {
              console.warn(`Invalid chat format:`, chat);
              return;
            }

            const chatDate = chat.timestamp.split(" ")[0];
            const formattedChat = {
              id: chat.serial_number,
              title: chat.chat_name,
              timestamp: chat.timestamp,
              system_instructions: chat.system_instructions || "",
              messages: chat.messages.map((msg) => ({
                role: msg.role.toUpperCase(),
                message: msg.message,
                timestamp: msg.timestamp,
              })),
            };

            if (chatDate === todayDate) {
              today.push(formattedChat);
            } else if (chatDate === yesterdayDate) {
              yesterday.push(formattedChat);
            } else {
              last7Days.push(formattedChat);
            }
          });

          setPreviousChats({
            today: today.sort((a, b) => (b.id || 0) - (a.id || 0)),
            yesterday: yesterday.sort((a, b) => (b.id || 0) - (a.id || 0)),
            last7Days: last7Days.sort((a, b) => (b.id || 0) - (a.id || 0)),
          });
        }
      } catch (error) {
        console.error("❌ Fetch error:", error.message);
        setPreviousChats({ today: [], yesterday: [], last7Days: [] });
        alert("Failed to connect to the backend. Please ensure the server is running.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchChatHistory();
  }, []);

  const createNewChat = (title = "New Chat", initialMessage = null) => {
    setCurrentSerialNumber(null);
    const newChat = {
      id: null,
      title,
      messages: initialMessage ? [initialMessage] : [],
    };

    setPreviousChats((prev) => ({
      ...prev,
      today: [newChat, ...prev.today.filter((c) => c.id !== null)],
    }));

    setCurrentChat(newChat);
  };

  const handleSendMessage = async (message) => {
    try {
      const response = await sendMessage({
        user_input: message.user_input,
        user_name: message.user_name || "Anonymous",
        serial_number: currentSerialNumber,
        system_instructions: instructions,
        is_temporary: isTemporary,
        stream: message.stream,
        pdf_extractions: message.pdf_extractions,
        selected_pdfs: message.selected_pdfs,
        select_all: message.select_all,
      });

      const userInput = message.user_input;
      let botOutput = response.output;

      if (message.stream) {
        if (currentSerialNumber === null) {
          const chatTitle = response.chat_title || userInput;
          const newChat = {
            id: null,
            title: chatTitle,
            messages: [
              { role: "USER", message: userInput },
              { role: "BOT", message: botOutput },
            ],
          };
          setCurrentChat(newChat);
          setPreviousChats((prev) => ({
            ...prev,
            today: [
              newChat,
              ...prev.today.filter((c) => c.id !== null && c.title !== chatTitle),
            ].sort((a, b) => (b.id || 0) - (a.id || 0)),
          }));
        } else {
          const updatedChat = {
            ...currentChat,
            id: currentSerialNumber,
            title: currentChat.title,
            messages: [
              ...currentChat.messages.filter((msg) => msg.role !== "BOT" || msg.message !== botOutput),
              { role: "USER", message: userInput },
              { role: "BOT", message: botOutput },
            ],
          };
          setCurrentChat(updatedChat);
          setPreviousChats((prev) => {
            const updateChatList = (list) =>
              list.map((chat) =>
                chat.id === currentSerialNumber ? updatedChat : chat
              );
            return {
              today: updateChatList(prev.today).sort((a, b) => (b.id || 0) - (a.id || 0)),
              yesterday: updateChatList(prev.yesterday).sort((a, b) => (b.id || 0) - (a.id || 0)),
              last7Days: updateChatList(prev.last7Days).sort((a, b) => (b.id || 0) - (a.id || 0)),
            };
          });
        }

        const finalResponse = await sendMessage({
          user_input: message.user_input,
          user_name: message.user_name || "Anonymous",
          serial_number: currentSerialNumber,
          system_instructions: instructions,
          is_temporary: isTemporary,
          stream: false,
          pdf_extractions: message.pdf_extractions,
          selected_pdfs: message.selected_pdfs,
          select_all: message.select_all,
        });

        if (currentSerialNumber === null) {
          setCurrentSerialNumber(finalResponse.serial_number);
          setCurrentChat((prev) => ({ ...prev, id: finalResponse.serial_number }));
          setPreviousChats((prev) => ({
            ...prev,
            today: prev.today.map((c) =>
              c.id === null && c.title === chatTitle ? { ...c, id: finalResponse.serial_number } : c
            ).sort((a, b) => (b.id || 0) - (a.id || 0)),
          }));
        }
        return finalResponse;
      } else {
        const botMessage = { role: "BOT", message: botOutput };
        if (currentSerialNumber === null) {
          const chatTitle = response.chat_title || userInput;
          const newChat = {
            id: response.serial_number,
            title: chatTitle,
            messages: [{ role: "USER", message: userInput }, botMessage],
          };
          setPreviousChats((prev) => ({
            ...prev,
            today: [
              newChat,
              ...prev.today.filter((c) => c.id !== newChat.id && c.title !== chatTitle),
            ].sort((a, b) => (b.id || 0) - (a.id || 0)),
          }));
          setCurrentChat(newChat);
          setCurrentSerialNumber(response.serial_number);
        } else {
          const updatedChat = {
            ...currentChat,
            id: currentSerialNumber,
            title: currentChat.title,
            messages: [...currentChat.messages, { role: "USER", message: userInput }, botMessage],
          };
          setCurrentChat(updatedChat);

          setPreviousChats((prev) => {
            const updateChatList = (list) =>
              list.map((chat) =>
                chat.id === currentSerialNumber ? updatedChat : chat
              );
            return {
              today: updateChatList(prev.today).sort((a, b) => (b.id || 0) - (a.id || 0)),
              yesterday: updateChatList(prev.yesterday).sort((a, b) => (b.id || 0) - (a.id || 0)),
              last7Days: updateChatList(prev.last7Days).sort((a, b) => (b.id || 0) - (a.id || 0)),
            };
          });
        }
        return response;
      }
    } catch (error) {
      console.error("❌ Failed to send message:", error);
      const errorMessage = error.message || "An error occurred while sending the message.";
      setCurrentChat((prev) => ({
        ...prev,
        messages: [...(prev?.messages || []), { role: "BOT", message: errorMessage }],
      }));
      return { output: errorMessage };
    }
  };

  const handleNewChat = () => {
    if (currentChat) {
      setPreviousChats((prev) => ({
        ...prev,
        today: [
          currentChat,
          ...prev.today.filter((c) => c.id !== currentChat.id && c.title !== currentChat.title),
        ].sort((a, b) => (b.id || 0) - (a.id || 0)),
      }));
    }

    createNewChat();
  };

  const handleSelectChat = async (chat) => {
    try {
      if (!chat || !chat.id) {
        console.error("❌ handleSelectChat called with invalid chat:", chat);
        alert("Error: Invalid chat selected.");
        return;
      }

      const selectedChat = {
        id: chat.id,
        title: chat.title,
        timestamp: chat.timestamp,
        messages: chat.messages.map((msg) => ({
          role: msg.role.toUpperCase(),
          message: msg.message,
          timestamp: msg.timestamp,
        })),
      };

      setCurrentChat(selectedChat);
      setCurrentSerialNumber(chat.id);

      setPreviousChats((prev) => {
        const updateChatList = (list) =>
          list.map((c) => (c.id === chat.id ? selectedChat : c));
        return {
          today: updateChatList(prev.today).sort((a, b) => (b.id || 0) - (a.id || 0)),
          yesterday: updateChatList(prev.yesterday).sort((a, b) => (b.id || 0) - (a.id || 0)),
          last7Days: updateChatList(prev.last7Days).sort((a, b) => (b.id || 0) - (a.id || 0)),
        };
      });
    } catch (error) {
      console.error("❌ Error in handleSelectChat:", error);
      alert(`Error loading chat: ${error.message}`);
    }
  };

  const handleRenameChat = (chat) => {
    const newTitle = prompt("Enter new chat name:", chat.title);
    if (newTitle) {
      setPreviousChats((prev) => ({
        today: prev.today.map((c) => (c.id === chat.id ? { ...c, title: newTitle } : c)).sort((a, b) => (b.id || 0) - (a.id || 0)),
        yesterday: prev.yesterday.map((c) => (c.id === chat.id ? { ...c, title: newTitle } : c)).sort((a, b) => (b.id || 0) - (a.id || 0)),
        last7Days: prev.last7Days.map((c) => (c.id === chat.id ? { ...c, title: newTitle } : c)).sort((a, b) => (b.id || 0) - (a.id || 0)),
      }));
      if (currentChat?.id === chat.id) {
        setCurrentChat((prev) => ({ ...prev, title: newTitle }));
      }
    }
  };

  const handleDeleteChat = async (chat) => {
    if (window.confirm("Are you sure you want to delete this chat?")) {
      try {
        await deleteChat(chat.id);

        setPreviousChats((prev) => ({
          today: prev.today.filter((c) => c.id !== chat.id).sort((a, b) => (b.id || 0) - (a.id || 0)),
          yesterday: prev.yesterday.filter((c) => c.id !== chat.id).sort((a, b) => (b.id || 0) - (a.id || 0)),
          last7Days: prev.last7Days.filter((c) => c.id !== chat.id).sort((a, b) => (b.id || 0) - (a.id || 0)),
        }));

        if (currentChat?.id === chat.id) {
          setCurrentChat(null);
          setCurrentSerialNumber(null);
        }
      } catch (error) {
        console.error("❌ Error deleting chat:", error);
        alert(`Error deleting chat: ${error.message}`);
      }
    }
  };

  const handleFileUpload = async (event) => {
    const files = event.target.files;
    if (!files.length) {
      return { message: "No files selected", extractions: [] };
    }
    if (!currentSerialNumber) {
      return { message: "Please select a chat session before uploading files", extractions: [] };
    }
  
    try {
      const data = await uploadFile(files, currentSerialNumber);
      return data;
    } catch (error) {
      console.error("❌ Failed to upload files:", error);
      return { message: `Error uploading files: ${error.message}`, extractions: [] };
    }
  };

  return {
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
  };
};

export default useChat;