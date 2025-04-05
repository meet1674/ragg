// src/components/ChatItem.jsx
import React from "react";
import PropTypes from "prop-types";

const ChatItem = ({ message, sender, highlights = [], style = {}, className = "" }) => {
  console.log(`ChatItem rendering - sender: ${sender}, message: ${message}, highlights:`, highlights);

  const highlightText = (text, highlights) => {
    if (!highlights.length || !text) return text;

    let highlightedText = text;
    highlights.forEach((highlight) => {
      const highlightText = highlight.text && typeof highlight.text === "string" ? highlight.text : "";
      if (highlightText) {
        const regex = new RegExp(`(${highlightText.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")})`, "gi");
        highlightedText = highlightedText.replace(regex, `<mark>$1</mark>`);
      }
    });

    return <span dangerouslySetInnerHTML={{ __html: highlightedText }} />;
  };

  const displayMessage = message || (sender === "bot" ? "No response received" : "");

  return (
    <div className={`chat-message ${sender} ${className}`} style={style}>
      <div className="message-content">
        {sender === "bot" && highlights.length > 0 
          ? highlightText(displayMessage, highlights) 
          : displayMessage}
        {sender === "bot" && highlights.length > 0 && (
          <div className="highlight-details" style={{ marginTop: "5px", fontSize: "12px", color: "#666" }}>
            {highlights.map((highlight, index) => (
              <div key={index}>
                {highlight.pdf_name && highlight.page && highlight.line ? (
                  `Ref: ${highlight.pdf_name}, Page ${highlight.page}, Line ${highlight.line}`
                ) : (
                  `Ref: Context ${index + 1}`
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

ChatItem.propTypes = {
  message: PropTypes.string.isRequired,
  sender: PropTypes.oneOf(["user", "bot"]).isRequired,
  highlights: PropTypes.arrayOf(
    PropTypes.shape({
      pdf_name: PropTypes.string,
      page: PropTypes.number,
      line: PropTypes.number,
      text: PropTypes.string,
    })
  ),
  style: PropTypes.object,
  className: PropTypes.string,
};

export default ChatItem;