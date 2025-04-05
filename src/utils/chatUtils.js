// src/utils/chatUtils.js
export const groupChatsByContent = (chats) => {
  const chatGroups = {};
  chats.forEach((chat) => {
    const key = `${chat.title}:${JSON.stringify(chat.messages)}`;
    if (!chatGroups[key]) {
      chatGroups[key] = [];
    }
    chatGroups[key].push(chat);
  });

  return Object.values(chatGroups).map((group) => {
    const primaryChat = group[0];
    const duplicates = group.slice(1);
    return {
      ...primaryChat,
      duplicates: duplicates.map((dup) => ({
        id: dup.id,
        timestamp: dup.timestamp,
      })),
    };
  });
};