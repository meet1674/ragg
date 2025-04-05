// src/services/api.js
const BACKEND_URL = "http://127.0.0.1:8000";

export const sendMessage = async (requestBody, retries = 3, delay = 2000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${BACKEND_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = "Failed to send message. Please try again.";
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.detail || errorJson.message || errorText;
          if (response.status === 503 && attempt < retries) {
            console.log(`Attempt ${attempt} failed with 503. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        } catch (e) {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      if (requestBody.stream) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let botOutput = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          botOutput += decoder.decode(value, { stream: true });
        }
        return { output: botOutput, highlights: [] };
      } else {
        const data = await response.json();
        return {
          output: data.output || "No response received",
          serial_number: data.serial_number,
          chat_title: data.chat_title,
          highlights: data.highlights || [],
          status: data.status || "success",
          tags: data.tags || [], // Added tags to response
        };
      }
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
    }
  }
};

export const deleteChat = async (serialNumber) => {
  const response = await fetch(`${BACKEND_URL}/deleteChat?serial_number=${serialNumber}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Failed to delete chat from backend");
  }

  return await response.json();
};

export const uploadFile = async (files, serialNumber) => {
  const formData = new FormData();
  Array.from(files).forEach((file) => formData.append("files", file));

  const firstFileType = files[0].type;
  const url = firstFileType === "application/pdf"
    ? `${BACKEND_URL}/upload/pdf?serial_number=${serialNumber}`
    : firstFileType.startsWith("image/")
    ? `${BACKEND_URL}/upload/image?serial_number=${serialNumber}`
    : null;

  if (!url) {
    throw new Error("Please upload only PDF or image files.");
  }

  const allSameType = Array.from(files).every(file => 
    (firstFileType === "application/pdf" && file.type === "application/pdf") ||
    (firstFileType.startsWith("image/") && file.type.startsWith("image/"))
  );

  if (!allSameType) {
    throw new Error("Please upload files of the same type (all PDFs or all images).");
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload files: ${response.status} - ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("❌ Upload error details:", error);
    throw error;
  }
};

export const searchChats = async (requestBody) => {
  const response = await fetch(`${BACKEND_URL}/search/chats`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to search chats: ${response.status} - ${errorText}`);
  }

  return await response.json();
};

export const editMessage = async (serialNumber, messageIndex, newMessage) => {
  const response = await fetch(`${BACKEND_URL}/edit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      serial_number: serialNumber,
      message_index: messageIndex,
      new_message: newMessage,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to edit message");
  }

  return await response.json();
};

export const getChatHistory = async () => {
  const response = await fetch(`${BACKEND_URL}/chathistory.json`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch chat history: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data; // Returns { file: "<json string>" }
};

// Note: These endpoints (/summarize, /explain, /key_topics) are not implemented in the provided backend
export const summarizeChat = async (serialNumber) => {
  const response = await fetch(`${BACKEND_URL}/summarize?serial_number=${serialNumber}`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to summarize chat");
  }

  return await response.json();
};

export const explainChat = async (serialNumber) => {
  const response = await fetch(`${BACKEND_URL}/explain?serial_number=${serialNumber}`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to explain chat");
  }

  return await response.json();
};

export const extractKeyTopics = async (serialNumber) => {
  const response = await fetch(`${BACKEND_URL}/key_topics?serial_number=${serialNumber}`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to extract key topics");
  }

  return await response.json();
};

export const highlightPDF = async (serialNumber, query) => {
  const response = await fetch(`${BACKEND_URL}/highlight_pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      serial_number: serialNumber,
      query: query,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to highlight PDF: ${response.status} - ${errorText}`);
  }

  return await response.json();
};