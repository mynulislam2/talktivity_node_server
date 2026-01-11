from typing import Any, Dict, Optional

import jwt
import uvicorn
from fastapi import FastAPI, Depends, HTTPException, Header, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware

from config import JWT_SECRET, logger
import os
from services.report_service import (
    _get_connection,
    fetch_user_conversations,
    generate_and_save_report,
    generate_report_with_groq,
    _flatten_transcripts,
)


class AnalyzeSessionRequest(BaseModel):
    user_id: int
    session_type: str  # "test" | "practice"
    latest_transcript: Optional[Dict[str, Any]] = None


class AnalyzeSessionResponse(BaseModel):
    report: Dict[str, Any]


class GenerateReportRequest(BaseModel):
    current_transcript: Optional[Dict[str, Any]] = None


class GenerateReportResponse(BaseModel):
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


app = FastAPI(title="Talktivity Voice Report API")

# No CORS needed - this API is only called internally by Node.js server
# All external requests go through Node.js which handles CORS

# Simple request logging middleware
class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        method = request.method
        path = request.url.path
        logger.info(f"🔍 {method} {path}")
        
        response = await call_next(request)
        logger.info(f"✅ {method} {path} - Status: {response.status_code}")
        
        return response

app.add_middleware(LoggingMiddleware)

security = HTTPBearer()


async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict[str, Any]:
    """
    Verify JWT token and extract user information.
    Matches the Node.js authentication logic.
    """
    if not JWT_SECRET:
        raise HTTPException(status_code=500, detail="JWT_SECRET not configured")

    token = credentials.credentials

    try:
        decoded = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        
        if not decoded.get("userId") or not decoded.get("email"):
            raise HTTPException(status_code=403, detail="Invalid token payload")
        
        return {
            "userId": decoded["userId"],
            "email": decoded["email"],
        }
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=403, detail="Token expired")
    except jwt.InvalidTokenError as e:
        logger.warning("Invalid token: %s", e)
        raise HTTPException(status_code=403, detail="Invalid or expired token")


@app.post("/analyze-session", response_model=AnalyzeSessionResponse)
async def analyze_session(payload: AnalyzeSessionRequest) -> AnalyzeSessionResponse:
    if payload.session_type not in {"test", "practice"}:
        raise HTTPException(status_code=400, detail="Invalid session_type")

    try:
        report = await generate_and_save_report(
            user_id=payload.user_id,
            session_type=payload.session_type,
            latest_transcript=payload.latest_transcript or {},
        )
        return AnalyzeSessionResponse(report=report)
    except HTTPException:
        raise
    except Exception as e:  # pragma: no cover - defensive
        logger.error("Error generating report: %s", e)
        raise HTTPException(status_code=500, detail="Failed to generate report")


# Test endpoint to verify POST works
@app.post("/test-post")
async def test_post(request: Request):
    """Test endpoint to verify POST requests work"""
    logger.info(f"✅ TEST POST received! Headers: {dict(request.headers)}")
    return {"success": True, "message": "POST request received successfully"}

@app.get("/generate-report", response_model=GenerateReportResponse)
async def generate_report(
    request: Request,
    user: Dict[str, Any] = Depends(verify_token),
) -> GenerateReportResponse:
    """
    Generate report for test calls using Groq API.
    Fetches previous conversations from database and generates report.
    GET method - no body needed, fetches all data from database.
    """
    try:
        user_id = user["userId"]
        
        # Get database connection
        conn = await _get_connection()
        try:
            # Fetch previous conversations
            previous_conversations = await fetch_user_conversations(conn, user_id, limit=10)
            logger.info(
                "Fetched %s previous conversations for user %s",
                len(previous_conversations),
                user_id,
            )
            
            # Combine previous conversations (no current_transcript for GET - fetch all from DB)
            current_transcript = {}  # GET doesn't accept body, fetch all from DB
            combined_turns = _flatten_transcripts(previous_conversations, current_transcript)
            
            if not combined_turns:
                return GenerateReportResponse(
                    success=False,
                    error="No conversation data available for analysis",
                )
            
            # Filter to user messages only (matching Node.js logic: item.role === 'user' && item.content)
            transcript_items = [
                t for t in combined_turns if t.get("role") == "user" and t.get("content")
            ]
            
            if not transcript_items:
                return GenerateReportResponse(
                    success=False,
                    error="No valid transcript items found for analysis",
                )
            
            # Generate report using Groq
            report = await generate_report_with_groq(
                user_id=user_id,
                transcript_items=transcript_items,
            )
            
            return GenerateReportResponse(success=True, data=report)
            
        finally:
            await conn.close()
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error generating report: %s", e, exc_info=True)
        return GenerateReportResponse(
            success=False,
            error=str(e) or "Failed to generate report",
        )


def run():
    """Convenience entrypoint when starting this API directly."""
    uvicorn.run(
        "api_server:app",
        host="0.0.0.0",
        port=8090,
        reload=False,
    )


if __name__ == "__main__":
    run()


