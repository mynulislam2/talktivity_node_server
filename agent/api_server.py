from typing import Any, Dict

import jwt
import uvicorn
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.base import BaseHTTPMiddleware

from config import JWT_SECRET, logger


app = FastAPI(title="Talktivity Voice Agent API")

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


