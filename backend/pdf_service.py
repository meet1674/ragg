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