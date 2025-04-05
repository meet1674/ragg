# ragg
app.py code
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Tuple
import json
import csv
import os
from datetime import datetime
import google.generativeai as genai
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores import FAISS
from pdf_service import extract_text_from_pdf, highlight_pdf_text, extract_text_by_page, normalize_text  # Added normalize_text
import fitz  # Added fitz import
from chat_manager import ChatManager
from starlette.middleware.cors import CORSMiddleware
import logging
import re

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

genai.configure(api_key="AIzaSyD3dLGQ-zb5Stb3AN5xw41pHxWvKWgcC_4")
model = genai.GenerativeModel("gemini-1.5-flash")

chat_manager = ChatManager()
embeddings = GoogleGenerativeAIEmbeddings(model="models/embedding-001", google_api_key="AIzaSyD3dLGQ-zb5Stb3AN5xw41pHxWvKWgcC_4")
vector_store = FAISS.from_texts([""], embeddings)

UPLOAD_DIR = "uploads"
HIGHLIGHT_DIR = "highlights"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(HIGHLIGHT_DIR, exist_ok=True)

class Message(BaseModel):
    role: str
    content: str
    timestamp: str
    source: Optional[str] = "general"

class ChatRequest(BaseModel):
    user_input: str
    user_name: str = "Anonymous"
    serial_number: Optional[int] = None
    system_instructions: str = ""
    is_temporary: bool = False
    stream: bool = False
    pdf_extractions: List[Dict] = []
    selected_pdfs: List[str] = []
    select_all: bool = False
    tags: List[str] = []

class SearchRequest(BaseModel):
    structured_query: str = ""
    search_type: str = "content"
    natural_query: str = ""

class EditRequest(BaseModel):
    serial_number: int
    message_index: int
    new_message: str

class HighlightRequest(BaseModel):
    serial_number: int
    query: str

def extract_references(response_text: str) -> List[Dict]:
    """Extract references from response text in format [filename, page X]"""
    pattern = r'\[(.*?),\s*page\s*(\d+)\]'
    matches = re.findall(pattern, response_text)
    logger.debug(f"Extracted references: {matches}")
    return [{"filename": match[0], "page": int(match[1])} for match in matches]

async def stream_response(prompt: str, context: str = ""):
    full_prompt = f"{context}\nUser: {prompt}"
    response = model.generate_content(full_prompt, stream=True)
    for chunk in response:
        yield chunk.text

@app.post("/chat")
async def chat(request: ChatRequest):
    try:
        logger.debug(f"Received request: {request.dict()}")

        if request.serial_number:
            chat = chat_manager.get_chat(request.serial_number)
            logger.debug(f"Chat retrieved: {chat}")
            if not chat:
                raise HTTPException(status_code=404, detail="Chat not found")
            if not isinstance(chat, dict) or "messages" not in chat or not isinstance(chat["messages"], list):
                logger.error(f"Invalid chat format: {chat}")
                raise HTTPException(status_code=500, detail="Chat data is corrupted")
            context = "\n".join([f"{msg['role']}: {msg['content']}" for msg in chat["messages"][-5:]])
        else:
            context = ""
        logger.debug(f"Context: {context}")

        rag_context = ""
        pdf_texts = {}
        source = "general"
        if request.pdf_extractions or request.selected_pdfs or request.select_all:
            query = request.user_input
            source = "pdf"
            logger.debug(f"Processing pdf_extractions: {request.pdf_extractions}")
            if not isinstance(request.pdf_extractions, list):
                raise HTTPException(status_code=422, detail=f"pdf_extractions must be a list, got {type(request.pdf_extractions)}")
            
            for ext in request.pdf_extractions:
                if not isinstance(ext, dict) or "raw_text" not in ext or "pdf_name" not in ext:
                    raise HTTPException(status_code=422, detail="Each pdf_extraction must be a dict with 'raw_text' and 'pdf_name'")
                pdf_texts[ext["pdf_name"]] = {"full_text": ext["raw_text"]}

            chat = chat_manager.get_chat(request.serial_number) if request.serial_number else None
            pdf_list = request.selected_pdfs if request.selected_pdfs else (chat["pdfs"] if chat and request.select_all else [])
            for pdf_name in pdf_list:
                file_path = os.path.join(UPLOAD_DIR, f"{request.serial_number}_{pdf_name}")
                if os.path.exists(file_path):
                    pdf_texts[pdf_name] = extract_text_by_page(file_path)

            if pdf_texts:
                rag_context = "\nRelevant PDF Content:\n"
                for filename, text_dict in pdf_texts.items():
                    if isinstance(text_dict, dict) and "full_text" not in text_dict:
                        for page_num, text in text_dict.items():
                            rag_context += f"From {filename}, page {page_num}:\n{text}\n\n"
                    else:
                        rag_context += f"From {filename}:\n{text_dict['full_text']}\n\n"
                
                full_context = (
                    f"{request.system_instructions}\n"
                    f"you are an expert AI assistant , designed to provide clear, concise, and maximally helpful answers to a wide range of questions.And also to PDF Documents."
                    f"Be conversational, friendly, and slightly witty—think of yourself as a knowledgeable companion with a dry sense of humor, inspired by Douglas Adams Hitchhikers Guide to the Galaxy and Tony Starks JARVIS. Avoid being overly formal or robotic."
                    f"Aim for concise answers (50-150 words for simple queries, up to 300 for nuanced ones) unless the user requests more depth. Avoid fluff—get to the point.."
                    f"For each piece of information include references in square brackets like this: [filename, page X]. Use only the information in the provided context. "
                    f"Encourage follow-ups with a light nudge, like ‘Anything else on your mind?’ or ‘Want me to dig deeper?’"
                    f"say 'Do **not** use any prior knowledge or make assumptions,If the answer is not found in the context, say: ❝The answer is not available in the document.❞.'\n"
                    f"{context}\n{rag_context}"
                )
            logger.debug(f"RAG context: {rag_context}")
        else:
            full_context = f"{request.system_instructions}\n{context}"

        logger.debug(f"Full context: {full_context}")

        if request.is_temporary and not request.serial_number:
            timestamp = datetime.now().isoformat()
            response_text = "".join([chunk async for chunk in stream_response(request.user_input, full_context)])
            logger.debug(f"Temporary chat response: {response_text}")
            return {
                "output": response_text,
                "serial_number": None,
                "chat_title": request.user_input[:50],
                "highlights": [],
                "references": extract_references(response_text)
            }

        if not request.serial_number:
            serial_number = chat_manager.create_chat(request.user_input[:50], tags=request.tags)
            request.serial_number = serial_number
        else:
            serial_number = request.serial_number
            if request.tags:
                chat_manager.update_tags(serial_number, request.tags)
        logger.debug(f"Serial number: {serial_number}")

        chat = chat_manager.get_chat(serial_number)
        chat.setdefault("highlight_retry_used", False)

        # Check for highlight request phrases
        highlight_request_phrases = ["where is the highlighted pdf", "highlighted pdf"]
        is_highlight_request = any(phrase in request.user_input.lower() for phrase in highlight_request_phrases)

        chat_manager.add_message(
            serial_number,
            {"role": "USER", "content": request.user_input, "timestamp": datetime.now().isoformat(), "source": source}
        )
        logger.debug(f"User message added to chat {serial_number}")

        if request.stream:
            async def stream_gen():
                async for chunk in stream_response(request.user_input, full_context):
                    yield chunk
            return StreamingResponse(stream_gen(), media_type="text/plain")
        else:
            response_text = "".join([chunk async for chunk in stream_response(request.user_input, full_context)])
            chat_manager.add_message(
                serial_number,
                {"role": "BOT", "content": response_text, "timestamp": datetime.now().isoformat(), "source": source}
            )
            logger.debug(f"Bot response added: {response_text}")
            highlights = []
            references = extract_references(response_text)

            # Initial highlight generation after response
            if (request.selected_pdfs or request.select_all) and pdf_texts and not is_highlight_request:
                highlights = await highlight_pdf(serial_number, response_text, references)
                logger.debug(f"Initial highlights: {highlights}")
                if highlights:
                    chat["highlighted"] = True
                else:
                    chat["highlighted"] = False
                    logger.warning("No highlights generated initially.")
            else:
                logger.debug("No PDFs selected for initial highlighting or this is a highlight request.")

            # Handle highlight request if no highlights were provided earlier
            if is_highlight_request and pdf_texts and not chat.get("highlighted", False) and not chat["highlight_retry_used"]:
                last_bot_message = next((msg for msg in reversed(chat["messages"]) if msg["role"] == "BOT" and msg["content"] != response_text), None)
                if last_bot_message:
                    prev_response_text = last_bot_message["content"]
                    prev_references = extract_references(prev_response_text)
                    highlights = await highlight_pdf(serial_number, prev_response_text, prev_references)
                    logger.debug(f"Retry highlights: {highlights}")
                    if highlights:
                        chat["highlighted"] = True
                        chat["highlight_retry_used"] = True
                        response_text = "Here is the highlighted PDF from the previous response."
                        chat_manager.add_message(
                            serial_number,
                            {"role": "BOT", "content": response_text, "timestamp": datetime.now().isoformat(), "source": "system"}
                        )
                    else:
                        response_text = "Sorry, I couldn’t generate a highlighted PDF for the previous response."
                        chat_manager.add_message(
                            serial_number,
                            {"role": "BOT", "content": response_text, "timestamp": datetime.now().isoformat(), "source": "system"}
                        )
                else:
                    response_text = "No previous response found to generate a highlighted PDF."
                    chat_manager.add_message(
                        serial_number,
                        {"role": "BOT", "content": response_text, "timestamp": datetime.now().isoformat(), "source": "system"}
                    )
            elif is_highlight_request and chat["highlight_retry_used"]:
                response_text = "The highlighted PDF retry has already been used for this chat."
                chat_manager.add_message(
                    serial_number,
                    {"role": "BOT", "content": response_text, "timestamp": datetime.now().isoformat(), "source": "system"}
                )
            elif is_highlight_request and chat.get("highlighted", False):
                response_text = "The highlighted PDF was already provided with the previous response."
                chat_manager.add_message(
                    serial_number,
                    {"role": "BOT", "content": response_text, "timestamp": datetime.now().isoformat(), "source": "system"}
                )

            chat_manager.save_chats()
            return {
                "output": response_text,
                "serial_number": serial_number,
                "chat_title": chat_manager.get_chat(serial_number)["chat_name"],
                "highlights": highlights,
                "references": references,
                "tags": chat_manager.get_chat(serial_number)["tags"]
            }

    except Exception as e:
        logger.error(f"Error in /chat: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/upload/pdf")
async def upload_pdf(serial_number: int, files: List[UploadFile] = File(...)):
    try:
        chat = chat_manager.get_chat(serial_number)
        if not chat:
            raise HTTPException(status_code=404, detail="Chat not found")

        extractions = []
        for file in files:
            if file.content_type != "application/pdf":
                continue
            filename = f"{serial_number}_{file.filename}"
            file_path = os.path.join(UPLOAD_DIR, filename)
            with open(file_path, "wb") as f:
                f.write(await file.read())
            text = extract_text_from_pdf(file_path)
            page_text = extract_text_by_page(file_path)
            extractions.append({"pdf_name": file.filename, "raw_text": text, "page_text": page_text})
            vector_store.add_texts([text], metadatas=[{"pdf_name": file.filename, "serial_number": serial_number}])
        
        chat["pdfs"] = chat.get("pdfs", []) + [ext["pdf_name"] for ext in extractions]
        chat["pdf_texts"] = chat.get("pdf_texts", {})
        for ext in extractions:
            chat["pdf_texts"][ext["pdf_name"]] = ext["page_text"]
        
        chat_manager.save_chats()
        return {"message": "PDFs uploaded successfully", "extractions": extractions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/edit")
async def edit_message(request: EditRequest):
    try:
        chat = chat_manager.get_chat(request.serial_number)
        if not chat or request.message_index >= len(chat["messages"]):
            raise HTTPException(status_code=404, detail="Chat or message not found")
        chat["messages"][request.message_index]["content"] = request.new_message
        chat["messages"][request.message_index]["timestamp"] = datetime.now().isoformat()
        chat_manager.save_chats()
        return {"message": "Message edited successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/deleteChat")
async def delete_chat(serial_number: int):
    try:
        if not chat_manager.delete_chat(serial_number):
            raise HTTPException(status_code=404, detail="Chat not found")
        return {"message": "Chat deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/chathistory.json")
async def get_chat_history():
    try:
        with open("chathistory.json", "r") as f:
            return {"file": f.read()}
    except FileNotFoundError:
        return {"file": json.dumps({"chats": []})}

@app.post("/search/chats")
async def search_chats(request: SearchRequest):
    try:
        chats = chat_manager.get_all_chats()
        if not chats:
            return {"message": "No chat history available yet.", "chats": [], "context": ""}

        filtered_chats = []
        query = request.structured_query or request.natural_query
        if not query:
            return {"chats": chats, "context": "All chats returned"}

        if request.search_type == "content":
            for chat in chats:
                if any(query.lower() in msg["content"].lower() for msg in chat["messages"]):
                    filtered_chats.append(chat)
        elif request.search_type == "chat_name":
            filtered_chats = [chat for chat in chats if query.lower() in chat["chat_name"].lower()]
        elif request.search_type == "date":
            filtered_chats = [chat for chat in chats if query in chat["timestamp"]]
        elif request.search_type == "system_instructions":
            filtered_chats = [chat for chat in chats if query.lower() in chat.get("system_instructions", "").lower()]
        elif request.search_type == "tags":
            filtered_chats = [chat for chat in chats if any(query.lower() in tag.lower() for tag in chat.get("tags", []))]

        context = f"Searched for '{query}' in {request.search_type}"
        return {"chats": filtered_chats, "context": context}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/highlight_pdf")
async def highlight_pdf_endpoint(request: HighlightRequest):
    chat = chat_manager.get_chat(request.serial_number)
    if not chat or "pdfs" not in chat:
        raise HTTPException(status_code=404, detail="Chat or PDFs not found")
    
    bot_messages = [msg for msg in chat["messages"] if msg["role"] == "BOT"]
    response_text = bot_messages[-1]["content"] if bot_messages else ""
    references = extract_references(response_text)
    highlights = await highlight_pdf(request.serial_number, response_text, references)
    logger.debug(f"Highlights from /highlight_pdf: {highlights}")
    if not highlights:
        logger.warning("No highlights generated in /highlight_pdf.")
    return {"highlighted_files": highlights}

async def highlight_pdf(serial_number: int, response_text: str, references: List[Dict] = None):
    """Handle PDF highlighting with improved error handling and logging."""
    chat = chat_manager.get_chat(serial_number)
    if not chat or "pdfs" not in chat:
        logger.error(f"Chat {serial_number} or PDFs not found.")
        return []
    
    highlights = []
    for pdf_name in chat["pdfs"]:
        original_path = os.path.join(UPLOAD_DIR, f"{serial_number}_{pdf_name}")
        highlighted_path = os.path.join(HIGHLIGHT_DIR, f"highlighted_{serial_number}_{pdf_name}")
        
        if not os.path.exists(original_path):
            logger.error(f"Original PDF not found: {original_path}")
            continue
            
        # Filter references for this specific PDF
        relevant_refs = [ref for ref in (references or []) if ref["filename"] == pdf_name]
        logger.debug(f"Highlighting {pdf_name} with {len(relevant_refs)} references")
        
        try:
            matches = highlight_pdf_text(
                original_path,
                highlighted_path,
                response_text,
                relevant_refs
            )
            
            if matches:
                highlights.append({
                    "original_file": pdf_name,
                    "highlighted_file": f"highlighted_{serial_number}_{pdf_name}",
                    "matches": matches
                })
                logger.info(f"Successfully highlighted {pdf_name} with {len(matches)} matches")
            else:
                logger.warning(f"No matches found for {pdf_name} with primary method")
                # Enhanced alternative matching strategy
                if chat.get("pdf_texts", {}).get(pdf_name):
                    logger.debug("Attempting alternative matching with raw text...")
                    page_texts = chat["pdf_texts"][pdf_name]
                    if isinstance(page_texts, dict):
                        for page_num, text in page_texts.items():
                            normalized_text = normalize_text(text)
                            normalized_response = normalize_text(response_text)
                            if normalized_response in normalized_text:
                                doc = fitz.open(original_path)
                                page = doc[page_num - 1]
                                text_instances = page.search_for(normalized_response)
                                if text_instances:
                                    for inst in text_instances:
                                        highlight = page.add_highlight_annot(inst)
                                        highlight.update()
                                    doc.save(highlighted_path)
                                    matches.append({
                                        "page": page_num,
                                        "line": int(text_instances[0].y0 // 10),
                                        "text": response_text[:50] + "..." if len(response_text) > 50 else response_text,
                                        "method": "fallback"
                                    })
                                    highlights.append({
                                        "original_file": pdf_name,
                                        "highlighted_file": f"highlighted_{serial_number}_{pdf_name}",
                                        "matches": matches
                                    })
                                    logger.info(f"Highlighted {pdf_name} via alternative matching on page {page_num}")
                                doc.close()
                                break
                            else:
                                logger.debug(f"No match for response text on page {page_num}")
        except Exception as e:
            logger.error(f"Error highlighting {pdf_name}: {str(e)}")
            continue
    
    chat_manager.save_chats()
    return highlights

@app.get("/preview_pdf/{filename}")
async def preview_pdf(filename: str):
    file_path = os.path.join(HIGHLIGHT_DIR if "highlighted" in filename else UPLOAD_DIR, filename)
    if not os.path.exists(file_path):
        logger.error(f"PDF not found for preview: {file_path}")
        raise HTTPException(status_code=404, detail="PDF not found")
    logger.debug(f"Previewing PDF: {file_path}")
    return FileResponse(file_path, media_type="application/pdf")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=True)





pdf_service.py code
import fitz  # PyMuPDF
from typing import Optional, List, Dict
import logging
import re
from difflib import SequenceMatcher

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract text from a PDF file."""
    try:
        doc = fitz.open(pdf_path)
        text = ""
        for page in doc:
            text += page.get_text()
        doc.close()
        logger.debug(f"Extracted text from {pdf_path}: {text[:200]}...")
        return text
    except Exception as e:
        logger.error(f"Error extracting text from {pdf_path}: {str(e)}")
        return ""

def extract_text_by_page(pdf_path: str) -> Dict[int, str]:
    """Extract text from PDF with page numbers"""
    try:
        doc = fitz.open(pdf_path)
        text_dict = {}
        for page_num, page in enumerate(doc, 1):
            text = page.get_text()
            text_dict[page_num] = text
        doc.close()
        logger.debug(f"Extracted text by page from {pdf_path}: {list(text_dict.keys())}")
        return text_dict
    except Exception as e:
        logger.error(f"Error extracting text by page from {pdf_path}: {str(e)}")
        return {}

def normalize_text(text: str) -> str:
    """Normalize text by removing extra whitespace but preserve sentence structure."""
    text = re.sub(r'\s+', ' ', text)  # Replace multiple whitespace with single space
    text = text.strip()
    return text

def highlight_pdf_text(input_path: str, output_path: str, response_text: str, references: List[Dict] = None) -> List[Dict]:
    """
    You are an advanced AI assistant integrated with a PDF processing system, tasked with answering questions from an uploaded PDF and highlighting contiguous text in a new PDF that matches the bot’s response, guided by references.
    Args:
        input_path: Path to the original PDF.
        output_path: Path to save the highlighted PDF.
        response_text: For each contiguous segment of text in response_text that matches the PDF, identify its exact location. If the response pulls from multiple pages, create multiple reference entries. Ensure every word in response_text traces back to a specific page and text span in the PDF.
        references: List of dicts with 'filename' and 'page' keys to specify where to highlight.
    """
    try:
        doc = fitz.open(input_path)
        matches = []

        if not references or not response_text:
            logger.warning("No references or response text provided for highlighting.")
            doc.close()
            return matches

        # Clean response text by removing reference markers
        clean_response = re.sub(r'\[.*?, page \d+\]', '', response_text).strip()
        normalized_response = normalize_text(clean_response)
        logger.debug(f"Normalized response for highlighting: {normalized_response[:200]}...")

        # Split into meaningful chunks (not just sentences)
        response_chunks = [chunk.strip() for chunk in re.split(r'[.!?]\s+', clean_response) if chunk.strip()]
        logger.debug(f"Response chunks: {response_chunks}")

        for ref in references:
            page_num = ref.get("page", 1) - 1  # Convert to 0-based index
            if page_num < 0 or page_num >= len(doc):
                logger.warning(f"Invalid page number {page_num + 1} for {input_path}")
                continue

            page = doc[page_num]
            page_text = page.get_text()
            if not page_text:
                logger.warning(f"No text extracted from page {page_num + 1} of {input_path}")
                continue

            normalized_page_text = normalize_text(page_text)
            logger.debug(f"Normalized page {page_num + 1} text: {normalized_page_text[:200]}...")

            # Try matching each chunk with fuzzy matching
            for chunk in response_chunks:
                normalized_chunk = normalize_text(chunk)
                logger.debug(f"Comparing chunk: '{normalized_chunk}'")
                
                # First try exact match
                text_instances = page.search_for(normalized_chunk)
                if text_instances:
                    for inst in text_instances:
                        highlight = page.add_highlight_annot(inst)
                        highlight.update()
                        matches.append({
                            "page": page_num + 1,
                            "line": int(inst.y0 // 10),
                            "text": chunk[:50] + "..." if len(chunk) > 50 else chunk
                        })
                        logger.debug(f"Highlighted exact match on page {page_num + 1}: {chunk[:50]}...")
                    continue
                
                # If exact match fails, try fuzzy matching with a lower threshold
                words = normalized_chunk.split()
                window_size = len(words)
                page_words = normalized_page_text.split()
                for i in range(len(page_words) - window_size + 1):
                    window = ' '.join(page_words[i:i + window_size])
                    similarity = SequenceMatcher(None, normalized_chunk, window).ratio()
                    logger.debug(f"Against window: '{window}' - similarity: {similarity}")
                    if similarity > 0.65:  # Lowered threshold from 0.8 to 0.65
                        text_instances = page.search_for(window)
                        if text_instances:
                            for inst in text_instances:
                                highlight = page.add_highlight_annot(inst)
                                highlight.update()
                                matches.append({
                                    "page": page_num + 1,
                                    "line": int(inst.y0 // 10),
                                    "text": chunk[:50] + "..." if len(chunk) > 50 else chunk
                                })
                                logger.debug(f"Highlighted fuzzy match on page {page_num + 1}: {chunk[:50]}...")
                            break
                        else:
                            logger.debug(f"Window '{window}' found with similarity {similarity} but not searchable in PDF.")

            if matches:
                doc.save(output_path)
                logger.debug(f"Successfully saved highlighted PDF to {output_path}")

        doc.close()
        return matches

    except Exception as e:
        logger.error(f"Error in highlight_pdf_text for {input_path}: {str(e)}")
        return []



chat_manager.py code
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
