import json
import csv
from datetime import datetime
import os
from typing import Optional, List, Dict

class ChatManager:
    def __init__(self):
        self.json_file = "chathistory.json"
        self.csv_file = "chathistory.csv"
        self.chats = self.load_chats()

    def load_chats(self):
        try:
            with open(self.json_file, "r") as f:
                content = f.read().strip()
                if not content:
                    return []
                data = json.loads(content)
                if not isinstance(data, dict) or "chats" not in data or not isinstance(data["chats"], list):
                    print(f"Invalid chathistory.json format: {data}. Resetting to empty list.")
                    return []
                return data["chats"]
        except (json.JSONDecodeError, FileNotFoundError) as e:
            print(f"Error loading chathistory.json: {e}. Starting with empty chats.")
            return []

    def save_chats(self):
        """Save chats to both JSON and CSV files."""
        with open(self.json_file, "w") as f:
            json.dump({"chats": self.chats}, f, indent=4)

        with open(self.csv_file, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["serial_number", "chat_name", "timestamp", "system_instructions", "messages", "pdfs", "pdf_texts", "tags"])
            for chat in self.chats:
                writer.writerow([
                    chat["serial_number"],
                    chat["chat_name"],
                    chat["timestamp"],
                    chat.get("system_instructions", ""),
                    json.dumps(chat["messages"]),
                    ",".join(chat.get("pdfs", [])),
                    json.dumps(chat.get("pdf_texts", {})),
                    ",".join(chat.get("tags", []))  # Added tags
                ])

    def create_chat(self, chat_name: str, tags: List[str] = None) -> int:
        """Create a new chat with a unique serial number."""
        serial_number = max([chat["serial_number"] for chat in self.chats], default=0) + 1
        new_chat = {
            "serial_number": serial_number,
            "chat_name": chat_name,
            "timestamp": datetime.now().isoformat(),
            "system_instructions": "",
            "messages": [],
            "pdfs": [],
            "pdf_texts": {},
            "tags": tags or []  # Added tags
        }
        self.chats.append(new_chat)
        self.save_chats()
        return serial_number

    def get_chat(self, serial_number: int) -> Optional[Dict]:
        """Retrieve a chat by serial number."""
        return next((chat for chat in self.chats if chat["serial_number"] == serial_number), None)

    def add_message(self, serial_number: int, message: Dict):
        """Add a message to a chat."""
        chat = self.get_chat(serial_number)
        if chat:
            if not isinstance(chat["messages"], list):
                chat["messages"] = []
            chat["messages"].append(message)
            chat["timestamp"] = datetime.now().isoformat()
            self.save_chats()

    def delete_chat(self, serial_number: int) -> bool:
        """Delete a chat by serial number."""
        initial_len = len(self.chats)
        self.chats = [chat for chat in self.chats if chat["serial_number"] != serial_number]
        if len(self.chats) < initial_len:
            self.save_chats()
            return True
        return False

    def get_all_chats(self) -> List[Dict]:
        """Get all chats."""
        return self.chats

    def update_tags(self, serial_number: int, tags: List[str]):
        """Update tags for a chat."""
        chat = self.get_chat(serial_number)
        if chat:
            chat["tags"] = tags
            self.save_chats()