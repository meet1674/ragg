// src/hooks/useSearch.js
import { useState, useEffect, useRef } from "react";
import { searchChats } from "../services/api";
import { groupChatsByContent } from "../utils/chatUtils";

const useSearch = ({ previousChats, handleSelectChat }) => {
  const [filteredChat, setFilteredChat] = useState(null);
  const [firstInput, setFirstInput] = useState("");
  const [searchType, setSearchType] = useState("content");
  const [naturalQuery, setNaturalQuery] = useState("");
  const [summary, setSummary] = useState("");
  const [filteredChats, setFilteredChats] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchContext, setSearchContext] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchBy, setSearchBy] = useState("content");
  const chatHistoryRef = useRef(null);

  useEffect(() => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleStructuredSearch = async (e) => {
    e.preventDefault();

    if (!firstInput.trim() && !naturalQuery.trim()) {
      setSummary("Please provide at least one input to search.");
      setFilteredChats([]);
      setSearchContext("");
      setSearchResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const data = await searchChats({
        structured_query: firstInput.trim(),
        search_type: searchType,
        natural_query: naturalQuery.trim(),
      });

      const backendResults = data.chats || [];

      if (data.message === "No chat history available yet.") {
        setSummary("No chat history available. Please start a new chat!");
        setFilteredChats([]);
        setSearchContext(data.context || "");
        setSearchResults([]);
      } else {
        const transformedChats = backendResults.map((chat) => ({
          id: chat.serial_number,
          title: chat.chat_name,
          timestamp: chat.timestamp,
          system_instructions: chat.system_instructions,
          messages: chat.messages.map((msg) => ({
            role: msg.role.toUpperCase(),
            message: msg.message,
            timestamp: msg.timestamp,
          })),
        }));

        const uniqueChats = groupChatsByContent(transformedChats);
        setSummary(uniqueChats.length > 0
          ? `Found ${uniqueChats.length} unique chat(s) matching your search.`
          : "No chats found matching your search.");
        setFilteredChats(uniqueChats);
        setSearchContext(data.context || "");
        setSearchResults(backendResults);
      }
    } catch (error) {
      console.error("❌ Error in structured search:", error);
      setSummary(`Error searching chats: ${error.message}`);
      setFilteredChats([]);
      setSearchContext("");
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNaturalSearch = async () => {
    if (!naturalQuery.trim()) {
      setSummary("Please enter a natural language query.");
      setFilteredChats([]);
      setSearchContext("");
      setSearchResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const data = await searchChats({
        structured_query: "",
        search_type: "content",
        natural_query: naturalQuery.trim(),
      });

      const backendResults = data.chats || [];

      if (data.message === "No chat history available yet.") {
        setSummary("No chat history available. Please start a new chat!");
        setFilteredChats([]);
        setSearchContext(data.context || "");
        setSearchResults([]);
      } else {
        const transformedChats = backendResults.map((chat) => ({
          id: chat.serial_number,
          title: chat.chat_name,
          timestamp: chat.timestamp,
          system_instructions: chat.system_instructions,
          messages: chat.messages.map((msg) => ({
            role: msg.role.toUpperCase(),
            message: msg.message,
            timestamp: msg.timestamp,
          })),
        }));

        const uniqueChats = groupChatsByContent(transformedChats);
        setSummary(uniqueChats.length > 0
          ? `Found ${uniqueChats.length} unique chat(s) matching: "${naturalQuery}".`
          : `No chats found matching: "${naturalQuery}".`);
        setFilteredChats(uniqueChats);
        setSearchContext(data.context || "");
        setSearchResults(backendResults);
      }
    } catch (error) {
      console.error("❌ Error in natural search:", error);
      setSummary(`Error searching chats: ${error.message}`);
      setFilteredChats([]);
      setSearchContext("");
      setSearchResults([]);
    } finally {
      setIsLoading(false);
      setNaturalQuery("");
    }
  };

  const handleSearch = async (query = searchQuery, by = searchBy) => {
    try {
      const data = await searchChats({
        structured_query: query,
        search_type: by,
        natural_query: "",
      });

      const backendResults = data.chats || [];

      if (data.message === "No chat history available yet.") {
        setSummary("No chat history available. Please start a new chat!");
        setFilteredChats([]);
        setSearchContext(data.context || "");
        return [];
      }

      const transformedChats = backendResults.map((chat) => ({
        id: chat.serial_number,
        title: chat.chat_name,
        timestamp: chat.timestamp,
        system_instructions: chat.system_instructions,
        messages: chat.messages.map((msg) => ({
          role: msg.role.toUpperCase(),
          message: msg.message,
          timestamp: msg.timestamp,
        })),
      }));

      const uniqueChats = groupChatsByContent(transformedChats);
      setSummary(uniqueChats.length > 0
        ? `Found ${uniqueChats.length} unique chat(s) matching your search.`
        : "No chats found matching your search.");
      setFilteredChats(uniqueChats);
      setSearchContext(data.context || "");
      return uniqueChats;
    } catch (error) {
      console.error("❌ Error searching chats:", error);
      setSummary(`Error searching chats: ${error.message}`);
      setFilteredChats([]);
      setSearchContext("");
      return [];
    }
  };

  const handleChatPrompt = async () => {
    if (!chatInput.trim()) return;

    setChatMessages((prev) => [
      ...prev,
      { role: "USER", message: chatInput },
    ]);

    try {
      const data = await searchChats({
        structured_query: "",
        search_type: "content",
        natural_query: chatInput,
      });

      const backendResults = data.chats || [];

      if (data.message === "No chat history available yet.") {
        setChatMessages((prev) => [
          ...prev,
          { role: "BOT", message: "No chat history available. Please start a new chat!" },
        ]);
        setFilteredChats([]);
        setSearchContext(data.context || "");
      } else {
        const transformedChats = backendResults.map((chat) => ({
          id: chat.serial_number,
          title: chat.chat_name,
          timestamp: chat.timestamp,
          system_instructions: chat.system_instructions,
          messages: chat.messages.map((msg) => ({
            role: msg.role.toUpperCase(),
            message: msg.message,
            timestamp: msg.timestamp,
          })),
        }));

        const uniqueChats = groupChatsByContent(transformedChats);
        const responseMessage = uniqueChats.length > 0
          ? `Found ${uniqueChats.length} chat(s) matching "${chatInput}":`
          : `No chats found matching "${chatInput}".`;

        setChatMessages((prev) => [
          ...prev,
          { role: "BOT", message: responseMessage + "\n" + (data.context || "") },
        ]);
        setFilteredChats(uniqueChats);
        setSearchContext(data.context || "");
      }
    } catch (error) {
      console.error("❌ Error processing chat prompt:", error);
      setChatMessages((prev) => [
        ...prev,
        { role: "BOT", message: `Error processing your prompt: ${error.message}` },
      ]);
    } finally {
      setChatInput("");
    }
  };

  const handleSimplifiedSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    try {
      const data = await searchChats({
        structured_query: searchQuery,
        search_type: "content",
        natural_query: "",
      });

      if (data.message === "No chat history available yet.") {
        setSearchResults([]);
        setSearchContext(data.context || "No chat history available yet.");
        alert("No chat history available. Please start a new chat!");
      } else {
        setSearchResults(data.chats);
        setSearchContext(data.context || "");
      }
    } catch (error) {
      console.error("❌ Error searching chats:", error);
      setSearchResults([]);
      setSearchContext("");
      alert("Failed to search chats. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return {
    filteredChat,
    setFilteredChat,
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
    searchQuery,
    setSearchQuery,
    searchBy,
    setSearchBy,
    chatHistoryRef,
    handleStructuredSearch,
    handleNaturalSearch,
    handleSearch,
    handleChatPrompt,
    handleSimplifiedSearch,
  };
};

export default useSearch;