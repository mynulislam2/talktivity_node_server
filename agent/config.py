import logging
import os

from dotenv import load_dotenv

# Load environment variables
loaded = load_dotenv()
print(f".env loaded: {loaded}")

# Set Google credentials path - use relative path for local development
_DEFAULT_CREDENTIALS_PATH = "./credentials/google-tts-key.json"
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.getenv(
    "GOOGLE_APPLICATION_CREDENTIALS", _DEFAULT_CREDENTIALS_PATH
)
print(f"Google credentials path: {os.environ['GOOGLE_APPLICATION_CREDENTIALS']}")
print(
    f"Credentials file exists: "
    f"{os.path.exists(os.environ['GOOGLE_APPLICATION_CREDENTIALS'])}"
)


logger = logging.getLogger("voice-assistant")

# PostgreSQL connection details with proper type handling

# Standard connection parameters
PG_HOST = os.getenv(
    "PG_HOST", "dpg-d24r71ali9vc73ejleog-a.singapore-postgres.render.com"
)
# Port must be an integer
PG_PORT = int(os.getenv("PG_PORT", "5432"))
PG_USER = os.getenv("PG_USER", "talktivity")
# Password must be a string, even if it contains only numbers
PG_PASSWORD = str(
    os.getenv("PG_PASSWORD", "b1WtQV8bwYA8k0i32iKdvFzD3ZEzNTjz")
)
PG_DATABASE = os.getenv("PG_DATABASE", "talktivity_postgres_sql_33av")

# Groq API configuration
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL_REPORT = os.getenv("GROQ_MODEL_REPORT", "openai/gpt-oss-120b")
GROQ_MODEL_FALLBACK = os.getenv("GROQ_MODEL_FALLBACK", "meta-llama/llama-guard-4-12b")

# Google API Key (required when using vertexai=False)
# Get your API key from: https://aistudio.google.com/apikey
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "AIzaSyAr20Ef0SqbRyGSCMMABV79efZ4UeCeino")

# Vertex AI configuration (only needed when using vertexai=True)
GOOGLE_CLOUD_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "inbound-rune-435111-u2")
GOOGLE_CLOUD_LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")

# Set Vertex AI project and location in environment (only if using Vertex AI)
# os.environ["GOOGLE_CLOUD_PROJECT"] = GOOGLE_CLOUD_PROJECT
# os.environ["GOOGLE_CLOUD_LOCATION"] = GOOGLE_CLOUD_LOCATION

# JWT Secret for token verification
JWT_SECRET = os.getenv("JWT_SECRET", "aa1c37281fce5f3c469655d017348d0e55e62c4504f988b64e0df03634f54e21928dc0e038234f0773e212d2d35210c0c07edae074e551bb8a590d9a009ded9a")

# Node.js API server URL for Socket.io events
API_URL = os.getenv("API_URL", "http://localhost:8082")

# Log connection info (excluding password)
logger.info(
    "Database configuration: Host=%s, Port=%s, User=%s, Database=%s",
    PG_HOST,
    PG_PORT,
    PG_USER,
    PG_DATABASE,
)


