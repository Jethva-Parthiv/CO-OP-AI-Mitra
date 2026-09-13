"""
Manual, one-off policy ingestion script.
Run from the terminal: uv run python ingest.py
Whenever policy documents change, re-run this script.
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(dotenv_path=BASE_DIR / ".env")

from langchain_text_splitters import RecursiveCharacterTextSplitter
from rag import add_chunks_to_chroma, get_chroma_collection


def parse_title(content: str, fallback: str) -> str:
    """Extract first markdown heading as document title."""
    for line in content.splitlines():
        line = line.strip()
        if line.startswith("# "):
            return line.replace("# ", "").strip()
    return fallback


def ingest_policies():
    policies_dir = BASE_DIR / os.getenv("POLICIES_DIR", "data/policies")
    if not policies_dir.exists():
        print(f"[ERROR] Policies directory not found at: {policies_dir}")
        sys.exit(1)

    policy_files = list(policies_dir.glob("*.md")) + list(policies_dir.glob("*.txt"))
    if not policy_files:
        print(f"[WARNING] No markdown or text policy documents found in: {policies_dir}")
        return

    print(f"=== Starting Ingestion of {len(policy_files)} Policy Documents ===")
    
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=600,
        chunk_overlap=100,
        separators=["\n## ", "\n### ", "\n\n", "\n", " ", ""],
    )

    all_chunks = []
    all_metadatas = []
    all_ids = []

    for file_path in policy_files:
        content = file_path.read_text(encoding="utf-8").strip()
        if not content:
            continue

        doc_title = parse_title(content, fallback=file_path.stem.replace("_", " ").title())
        chunks = text_splitter.split_text(content)
        print(f"-> {file_path.name}: {len(chunks)} chunks created ('{doc_title}')")

        for idx, chunk in enumerate(chunks):
            chunk_id = f"{file_path.stem}_{idx}"
            all_chunks.append(chunk)
            all_ids.append(chunk_id)
            all_metadatas.append({
                "source": file_path.name,
                "title": doc_title,
                "chunk_index": idx,
            })

    if all_chunks:
        add_chunks_to_chroma(all_chunks, all_metadatas, all_ids)
        collection = get_chroma_collection()
        print(f"\n[SUCCESS] Ingestion completed! Total documents in ChromaDB collection: {collection.count()}")
    else:
        print("[WARNING] No policy chunks were created.")


if __name__ == "__main__":
    ingest_policies()
