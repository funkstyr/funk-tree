"""
OCR Script for Funk Family History PDF
Extracts text from scanned PDF using PyMuPDF and Tesseract
"""
import fitz
import pytesseract
from PIL import Image
import io
import os
import sys

# Set Tesseract path for Windows
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

PDF_PATH = r'C:\Users\norca\dev\funk-tree\Fretz History of Bishop Henry Funck.pdf'
OUTPUT_PATH = r'C:\Users\norca\dev\funk-tree\funk-history-ocr.txt'

def ocr_page(page, page_num):
    """OCR a single page and return the text"""
    try:
        # Render page to image at higher DPI for better OCR
        mat = fitz.Matrix(2.0, 2.0)  # 2x zoom for ~144 DPI
        pix = page.get_pixmap(matrix=mat)

        # Convert to PIL Image
        img_data = pix.tobytes("png")
        img = Image.open(io.BytesIO(img_data))

        # Run OCR
        text = pytesseract.image_to_string(img)
        return text
    except Exception as e:
        print(f"Error on page {page_num}: {e}", file=sys.stderr)
        return f"[OCR ERROR ON PAGE {page_num}]\n"

def main():
    print(f"Opening PDF: {PDF_PATH}")
    doc = fitz.open(PDF_PATH)
    total_pages = len(doc)
    print(f"Total pages: {total_pages}")

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        for i, page in enumerate(doc):
            page_num = i + 1
            print(f"Processing page {page_num}/{total_pages}...", flush=True)

            text = ocr_page(page, page_num)

            f.write(f"\n{'='*60}\n")
            f.write(f"PAGE {page_num}\n")
            f.write(f"{'='*60}\n\n")
            f.write(text)
            f.write("\n")

            # Flush every 10 pages for progress monitoring
            if page_num % 10 == 0:
                f.flush()
                print(f"  Saved through page {page_num}")

    doc.close()
    print(f"\nOCR complete! Output saved to: {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
