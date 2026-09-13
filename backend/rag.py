import os
from pathlib import Path
from typing import List, Dict, Any, Optional
import chromadb
from chromadb.config import Settings
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

COLLECTION_NAME = "coop_policy_collection"
BASE_DIR = Path(__file__).resolve().parent
CHROMA_DIR = BASE_DIR / os.getenv("CHROMA_PERSIST_DIR", "data/chroma_db")


def get_api_key() -> str:
    """Retrieve Gemini API key from environment."""
    key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not key:
        raise ValueError(
            "GEMINI_API_KEY is not set in environment or backend/.env file. "
            "Please add your free Gemini API key to proceed."
        )
    return key


def get_embedding_client():
    """Returns LangChain Google Generative AI Embeddings client."""
    from langchain_google_genai import GoogleGenerativeAIEmbeddings

    api_key = get_api_key()
    # Preferred embedding model from user requirements
    model_name = os.getenv("EMBEDDING_MODEL", "models/embedding-001")
    return GoogleGenerativeAIEmbeddings(
        model=model_name,
        google_api_key=api_key,
    )


def get_chroma_collection():
    """Initializes and returns the persistent ChromaDB collection."""
    CHROMA_DIR.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )
    return collection


def add_chunks_to_chroma(
    chunks: List[str],
    metadatas: List[Dict[str, Any]],
    ids: List[str],
):
    """Embeds text chunks and stores them in persistent ChromaDB collection."""
    if not chunks:
        return

    collection = get_chroma_collection()
    embed_client = get_embedding_client()

    print(f"[RAG] Generating embeddings for {len(chunks)} chunks with {embed_client.model}...")
    embeddings = embed_client.embed_documents(chunks)

    collection.upsert(
        ids=ids,
        documents=chunks,
        embeddings=embeddings,
        metadatas=metadatas,
    )
    print(f"[RAG] Successfully indexed {len(chunks)} chunks in ChromaDB.")


def query_chroma(query_text: str, top_k: int = 4) -> List[Dict[str, Any]]:
    """Embeds the incoming user query and searches ChromaDB for top-k matching policy chunks."""
    collection = get_chroma_collection()
    count = collection.count()
    if count == 0:
        return []

    embed_client = get_embedding_client()
    query_vector = embed_client.embed_query(query_text)

    results = collection.query(
        query_embeddings=[query_vector],
        n_results=min(top_k, count),
        include=["documents", "metadatas", "distances"],
    )

    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]

    hits = []
    for doc, meta, dist in zip(documents, metadatas, distances):
        hits.append({
            "content": doc,
            "metadata": meta,
            "score": round(1.0 - dist, 4) if dist is not None else None,
        })
    return hits
