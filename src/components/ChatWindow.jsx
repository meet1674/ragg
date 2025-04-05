import React, { useState, useEffect, useRef, useCallback } from "react";
import ChatItem from "./ChatItem";
import { editMessage, summarizeChat, explainChat, extractKeyTopics, highlightPDF } from "../services/api";

// Default API base URL (hardcoded since no .env is desired)
const API_BASE_URL = "http://127.0.0.1:8000";

const ChatWindow = ({ chat, onSendMessage, onFileUpload, serialNumber, instructions, isTemporary }) => {
  const [userInput, setUserInput] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editText, setEditText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedMessage, setStreamedMessage] = useState("");
  const [highlights, setHighlights] = useState([]);
  const [pdfExtractions, setPdfExtractions] = useState([]);
  const [highlightedPDFs, setHighlightedPDFs] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [operationInProgress, setOperationInProgress] = useState(null);
  const [hasHighlightedPDF, setHasHighlightedPDF] = useState(false); // New state for preview icon
  const chatHistoryRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Cleanup effects
  useEffect(() => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    return () => {
      controller.abort();
      uploadedFiles.forEach(file => {
        if (file.fileURL) URL.revokeObjectURL(file.fileURL);
      });
    };
  }, [uploadedFiles]);

  // Auto-scroll chat and update preview icon
  useEffect(() => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
    // Update hasHighlightedPDF based on highlightedPDFs
    setHasHighlightedPDF(highlightedPDFs.length > 0);
  }, [chat?.messages, isStreaming, streamedMessage, highlights, uploadedFiles, highlightedPDFs]);

  const validateApiResponse = (response, expectedFields) => {
    if (!response) throw new Error("Empty response from server");
    expectedFields.forEach(field => {
      if (response[field] === undefined) {
        throw new Error(`Invalid response format: missing ${field}`);
      }
    });
    return response;
  };

  const handleSend = useCallback(async () => {
    if (isSending || isStreaming) return;
    
    const trimmedMessage = userInput.trim();
    if (!trimmedMessage || !onSendMessage) return;
  
    setIsSending(true);
    setIsStreaming(true);
    setStreamedMessage("");
    setUserInput("");
  
    const validPdfExtractions = pdfExtractions
      .filter(extraction => 
        extraction && 
        typeof extraction.raw_text === "string" && 
        typeof extraction.pdf_name === "string"
      )
      .map(extraction => ({
        raw_text: extraction.raw_text,
        pdf_name: extraction.pdf_name,
        rag_store: null,
      }));
  
    const requestBody = {
      user_input: trimmedMessage,
      user_name: "Anonymous",
      serial_number: serialNumber || null,
      system_instructions: instructions || "",
      is_temporary: isTemporary || false,
      stream: true,
      pdf_extractions: validPdfExtractions.length > 0 ? validPdfExtractions : [],
      selected_pdfs: uploadedFiles.filter(f => f.type === "application/pdf").map(f => f.name) || [],
      select_all: uploadedFiles.length > 0 && uploadedFiles.every(f => f.type === "application/pdf"),
    };
  
    console.log("Sending to /chat:", JSON.stringify(requestBody, null, 2)); // Debug log
  
    try {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: abortControllerRef.current.signal,
      });
  
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Server error response:", errorText);
        throw new Error(`Network response was not ok: ${errorText}`);
      }
  
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let botOutput = "";
  
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        botOutput += chunk;
        setStreamedMessage(botOutput);
      }
  
      const finalResponse = await onSendMessage({
        ...requestBody,
        user_input: trimmedMessage,
        bot_response: botOutput,
        stream: false,
      });
  
      if (finalResponse?.highlights?.length > 0) {
        setHighlights(finalResponse.highlights);
        if (finalResponse.serial_number || serialNumber) {
          const highlightResponse = await highlightPDF(
            finalResponse.serial_number || serialNumber,
            botOutput
          );
          setHighlightedPDFs(highlightResponse?.highlighted_files || []);
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error("Failed to send message:", error);
        await onSendMessage({
          ...requestBody,
          user_input: `Error: ${error.message || "Error processing your request."}`,
          stream: false,
        });
      }
    } finally {
      setIsStreaming(false);
      setIsSending(false);
      setStreamedMessage("");
    }
  }, [userInput, serialNumber, instructions, isTemporary, pdfExtractions, uploadedFiles, onSendMessage, isSending, isStreaming]);
  
  const handleKeyPress = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleUploadClick = (event) => {
    if (!serialNumber) {
      alert("Please select or create a chat session before uploading files.");
      return;
    }
    event.preventDefault();
    document.getElementById("fileInput").click();
  };

  const handleFileChange = async (event) => {
    const files = event.target.files;
    if (!files?.length || !onFileUpload) return;

    setOperationInProgress("uploading");
    
    try {
      const uploadEvent = { target: { files } };
      const uploadResponse = await onFileUpload(uploadEvent);

      const newUploadedFiles = Array.from(files).map((file) => {
        const fileURL = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
        return { file, fileURL, name: file.name, type: file.type };
      });

      setUploadedFiles((prevFiles) => [...prevFiles, ...newUploadedFiles]);

      const pdfFiles = Array.from(files).filter((file) => file.type === "application/pdf");
      if (pdfFiles.length > 0) {
        const extractions = uploadResponse?.extractions
          ? uploadResponse.extractions.map((extraction, index) => ({
              raw_text: extraction.raw_text || "",
              pdf_name: extraction.pdf_name || pdfFiles[index]?.name || `pdf_${index}`,
            }))
          : [];
        setPdfExtractions((prev) => [...prev, ...extractions]);

        await onSendMessage({
          user_input: `Uploaded ${pdfFiles.length} PDF(s): ${pdfFiles.map((f) => f.name).join(", ")}.`,
          user_name: "System",
          serial_number: serialNumber,
          system_instructions: instructions || "",
          is_temporary: isTemporary,
          stream: false,
        });
      }
    } catch (error) {
      console.error("Error uploading files:", error);
      await onSendMessage({
        user_input: `Error uploading files: ${error.message}`,
        user_name: "System",
        serial_number: serialNumber,
        system_instructions: instructions || "",
        is_temporary: isTemporary,
        stream: false,
      });
    } finally {
      event.target.value = null;
      setOperationInProgress(null);
    }
  };

  const handleRemoveFile = (index) => {
    setUploadedFiles((prevFiles) => {
      const updatedFiles = [...prevFiles];
      const [removedFile] = updatedFiles.splice(index, 1);
      
      if (removedFile.fileURL) {
        URL.revokeObjectURL(removedFile.fileURL);
      }
      
      return updatedFiles;
    });

    setPdfExtractions((prev) => 
      prev.filter((extraction) => 
        extraction.pdf_name !== uploadedFiles[index]?.name
      )
    );
  };

  const handleCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      console.log("Text copied to clipboard");
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const handleEdit = (index, message) => {
    setEditingIndex(index);
    setEditText(message);
  };

  const handleSaveEdit = async () => {
    if (editingIndex === null || !serialNumber) return;

    setOperationInProgress("editing");
    
    try {
      await editMessage(serialNumber, editingIndex, editText);

      if (chat?.messages?.[editingIndex]) {
        const updatedMessages = [...chat.messages];
        updatedMessages[editingIndex] = {
          ...updatedMessages[editingIndex],
          message: editText
        };
      }

      await onSendMessage({
        user_input: "Message edited.",
        user_name: "System",
        serial_number: serialNumber,
        system_instructions: instructions || "",
        is_temporary: isTemporary,
        stream: false,
      });

      setEditingIndex(null);
      setEditText("");
    } catch (error) {
      console.error("Error editing message:", error);
      await onSendMessage({
        user_input: `Error editing message: ${error.message}`,
        user_name: "System",
        serial_number: serialNumber,
        system_instructions: instructions || "",
        is_temporary: isTemporary,
        stream: false,
      });
    } finally {
      setOperationInProgress(null);
    }
  };

  const handleSummarize = async () => {
    if (!serialNumber) return;
    
    setOperationInProgress("summarizing");
    
    try {
      const response = await summarizeChat(serialNumber);
      const summary = validateApiResponse(response, ["summary"]);
      
      await onSendMessage({
        user_input: `Summary: ${summary.summary}`,
        user_name: "System",
        serial_number: serialNumber,
        system_instructions: instructions || "",
        is_temporary: isTemporary,
        stream: false,
      });
    } catch (error) {
      console.error("Error summarizing chat:", error);
      await onSendMessage({
        user_input: `Error summarizing chat: ${error.message}`,
        user_name: "System",
        serial_number: serialNumber,
        system_instructions: instructions || "",
        is_temporary: isTemporary,
        stream: false,
      });
    } finally {
      setOperationInProgress(null);
    }
  };

  const handleExplain = async () => {
    if (!serialNumber) return;
    
    setOperationInProgress("explaining");
    
    try {
      const response = await explainChat(serialNumber);
      const explanation = validateApiResponse(response, ["explanation"]);
      
      await onSendMessage({
        user_input: `Explanation: ${explanation.explanation}`,
        user_name: "System",
        serial_number: serialNumber,
        system_instructions: instructions || "",
        is_temporary: isTemporary,
        stream: false,
      });
    } catch (error) {
      console.error("Error explaining chat:", error);
      await onSendMessage({
        user_input: `Error explaining chat: ${error.message}`,
        user_name: "System",
        serial_number: serialNumber,
        system_instructions: instructions || "",
        is_temporary: isTemporary,
        stream: false,
      });
    } finally {
      setOperationInProgress(null);
    }
  };

  const handleKeyTopics = async () => {
    if (!serialNumber) return;
    
    setOperationInProgress("extractingTopics");
    
    try {
      const response = await extractKeyTopics(serialNumber);
      const topics = validateApiResponse(response, ["topics"]);
      
      await onSendMessage({
        user_input: `Key Topics: ${topics.topics.join(", ")}`,
        user_name: "System",
        serial_number: serialNumber,
        system_instructions: instructions || "",
        is_temporary: isTemporary,
        stream: false,
      });
    } catch (error) {
      console.error("Error extracting key topics:", error);
      await onSendMessage({
        user_input: `Error extracting key topics: ${error.message}`,
        user_name: "System",
        serial_number: serialNumber,
        system_instructions: instructions || "",
        is_temporary: isTemporary,
        stream: false,
      });
    } finally {
      setOperationInProgress(null);
    }
  };

  const handlePreviewPDF = (filename) => {
    window.open(`${API_BASE_URL}/preview_pdf/${filename}`, "_blank");
  };

  const handlePreviewHighlights = () => {
    if (highlightedPDFs.length > 0) {
      highlightedPDFs.forEach((pdf) => {
        handlePreviewPDF(pdf.highlighted_file);
      });
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-interface">
        {/* New Preview Icon Section */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: "10px" }}>
          <span
            onClick={hasHighlightedPDF ? handlePreviewHighlights : undefined}
            style={{
              cursor: hasHighlightedPDF ? "pointer" : "default",
              color: hasHighlightedPDF ? "#1e90ff" : "#888",
              fontSize: "24px",
              marginRight: "10px",
              userSelect: "none",
            }}
            title={hasHighlightedPDF ? "Preview Highlighted PDF" : "No Highlighted PDF Available"}
          >
            {hasHighlightedPDF ? "📘✔️" : "📘❌"}
          </span>
          {isTemporary && (
            <span
              style={{
                fontSize: "24px",
                color: "#1e90ff",
                cursor: "pointer",
                userSelect: "none",
              }}
              title="Temporary Chat"
            >
              ⏳
            </span>
          )}
        </div>

        <div className="chat-history" ref={chatHistoryRef}>
          {chat?.messages?.map((msg, index) => (
            <div key={index} className="message-container" style={{ display: "flex", alignItems: "center" }}>
              {editingIndex === index ? (
                <div style={{ flexGrow: 1 }}>
                  <input
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    disabled={operationInProgress === "editing"}
                  />
                  <button 
                    onClick={handleSaveEdit}
                    disabled={operationInProgress === "editing"}
                  >
                    {operationInProgress === "editing" ? "Saving..." : "Save"}
                  </button>
                  <button 
                    onClick={() => setEditingIndex(null)}
                    disabled={operationInProgress === "editing"}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <ChatItem
                    message={msg.message || ""}
                    sender={msg.role.toLowerCase()}
                    highlights={msg.role === "BOT" ? highlights : []}
                    style={{ flexGrow: 1 }}
                  />
                  {msg.role === "USER" && (
                    <div className="message-actions" style={{ marginLeft: "10px" }}>
                      <button
                        onClick={() => handleCopy(msg.message)}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", marginRight: "10px" }}
                        title="Copy"
                      >
                        📋
                      </button>
                      <button
                        onClick={() => handleEdit(index, msg.message)}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px" }}
                        title="Edit"
                      >
                        ✏️
                      </button>
                    </div>
                  )}
                  {msg.role === "BOT" && (
                    <div className="message-actions" style={{ marginLeft: "10px" }}>
                      <span
                        onClick={() => handleCopy(msg.message)}
                        style={{
                          cursor: "pointer",
                          color: "#1e90ff",
                          fontSize: "14px",
                          textDecoration: "none",
                          padding: "2px 5px",
                          borderRadius: "3px",
                          transition: "background-color 0.2s",
                          marginRight: "5px",
                        }}
                        onMouseEnter={(e) => (e.target.style.backgroundColor = "#e6f0fa")}
                        onMouseLeave={(e) => (e.target.style.backgroundColor = "transparent")}
                        title="Copy"
                      >
                        Copy
                      </span>
                      {highlights.length > 0 && highlightedPDFs.length > 0 && (
                        <span
                          onClick={handlePreviewHighlights}
                          style={{
                            cursor: "pointer",
                            color: "#1e90ff",
                            fontSize: "14px",
                            textDecoration: "none",
                            padding: "2px 5px",
                            borderRadius: "3px",
                            transition: "background-color 0.2s",
                          }}
                          onMouseEnter={(e) => (e.target.style.backgroundColor = "#e6f0fa")}
                          onMouseLeave={(e) => (e.target.style.backgroundColor = "transparent")}
                          title="Preview Highlights"
                        >
                          👁️‍🗨️
                        </span>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
          {isStreaming && (
            <div className="message-container" style={{ display: "flex", alignItems: "center" }}>
              <div className="streaming-indicator" />
              <ChatItem
                message={streamedMessage || "Processing..."}
                sender="bot"
                highlights={highlights}
                className="streaming"
                style={{ flexGrow: 1 }}
              />
              <div className="message-actions" style={{ marginLeft: "10px" }}>
                <span
                  onClick={() => handleCopy(streamedMessage)}
                  style={{
                    cursor: "pointer",
                    color: "#1e90ff",
                    fontSize: "14px",
                    textDecoration: "none",
                    padding: "2px 5px",
                    borderRadius: "3px",
                    transition: "background-color 0.2s",
                  }}
                  onMouseEnter={(e) => (e.target.style.backgroundColor = "#e6f0fa")}
                  onMouseLeave={(e) => (e.target.style.backgroundColor = "transparent")}
                  title="Copy"
                >
                  Copy
                </span>
              </div>
            </div>
          )}
          {uploadedFiles.map((uploadedFile, index) => (
            <div key={index} className="uploaded-file" style={{ margin: "10px 0", display: "flex", alignItems: "center" }}>
              {uploadedFile.type.startsWith("image/") ? (
                <img
                  src={uploadedFile.fileURL}
                  alt={uploadedFile.name}
                  style={{ width: "50px", height: "50px", objectFit: "cover", marginRight: "10px" }}
                />
              ) : uploadedFile.type === "application/pdf" ? (
                <span role="img" aria-label="PDF" style={{ fontSize: "40px", marginRight: "10px" }}>📄</span>
              ) : null}
              <span className="file-name" style={{ flexGrow: 1 }}>{uploadedFile.name}</span>
              <button
                onClick={() => handleRemoveFile(index)}
                className="remove-file-btn"
                style={{ background: "none", border: "none", color: "#FF4D4D", cursor: "pointer", fontSize: "16px", marginLeft: "10px" }}
                disabled={operationInProgress === "uploading"}
              >
                ✕
              </button>
            </div>
          ))}
          {highlightedPDFs.length > 0 && (
            <div className="highlighted-pdfs" style={{ margin: "10px 0" }}>
              <h4>Highlighted PDFs:</h4>
              {highlightedPDFs.map((pdf, index) => (
                <div key={index} style={{ margin: "5px 0" }}>
                  <span>{pdf.original_file} → </span>
                  <button
                    onClick={() => handlePreviewPDF(pdf.highlighted_file)}
                    style={{ color: "#1e90ff", background: "none", border: "none", cursor: "pointer" }}
                  >
                    Preview {pdf.highlighted_file}
                  </button>
                  {pdf.matches?.length > 0 ? (
                    <ul>
                      {pdf.matches.map((match, i) => (
                        <li key={i}>
                          Page {match.page || 'N/A'}, Line {match.line || 'N/A'}: 
                          {match.text ? match.text : 'No text available'}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div>No matches found in this document</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="chat-actions">
          <button 
            onClick={handleUploadClick}
            disabled={operationInProgress === "uploading" || !serialNumber}
          >
            {operationInProgress === "uploading" ? "Uploading..." : "📷 Upload"}
          </button>
          <input
            id="fileInput"
            type="file"
            accept="application/pdf,image/*"
            multiple
            onChange={handleFileChange}
            style={{ display: "none" }}
            disabled={operationInProgress === "uploading"}
          />
          <button 
            onClick={handleSummarize} 
            disabled={!serialNumber || operationInProgress}
          >
            {operationInProgress === "summarizing" ? "Summarizing..." : "Summarize"}
          </button>
          <button 
            onClick={handleExplain} 
            disabled={!serialNumber || operationInProgress}
          >
            {operationInProgress === "explaining" ? "Explaining..." : "Explain"}
          </button>
          <button 
            onClick={handleKeyTopics} 
            disabled={!serialNumber || operationInProgress}
          >
            {operationInProgress === "extractingTopics" ? "Extracting..." : "Key Topics"}
          </button>
        </div>
      </div>

      <div className="chat-input">
        <input
          type="text"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Type your message..."
          disabled={isStreaming || isSending || operationInProgress}
        />
        <button 
          onClick={handleSend} 
          disabled={isStreaming || isSending || operationInProgress || !userInput.trim()}
        >
          {isStreaming ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
};

export default ChatWindow;