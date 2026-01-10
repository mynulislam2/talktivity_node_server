import json
import logging
from datetime import datetime, date
from typing import Any, Dict, List, Optional

import asyncpg
import httpx

from config import (
    GROQ_API_KEY,
    GROQ_API_URL,
    GROQ_MODEL_REPORT,
    GROQ_MODEL_FALLBACK,
    PG_DATABASE,
    PG_HOST,
    PG_PASSWORD,
    PG_PORT,
    PG_USER,
    logger,
)
from livekit.plugins import google
from livekit.agents.llm import ChatContext, ChatMessage

# Ensure we see our debug/info logs during troubleshooting
logging.basicConfig(level=logging.INFO)
logger.setLevel(logging.INFO)


async def _get_connection() -> asyncpg.Connection:
    return await asyncpg.connect(
        host=PG_HOST,
        port=PG_PORT,
        user=PG_USER,
        password=PG_PASSWORD,
        database=PG_DATABASE,
    )


async def ensure_call_reports_table(conn: asyncpg.Connection) -> None:
    # Ensure sequence exists (avoids collisions when a sequence was left behind)
    await conn.execute(
        """
    CREATE SEQUENCE IF NOT EXISTS call_reports_id_seq
    """
    )

    # Create table using the existing sequence
    await conn.execute(
        """
    CREATE TABLE IF NOT EXISTS call_reports (
        id INTEGER NOT NULL DEFAULT nextval('call_reports_id_seq') PRIMARY KEY,
        user_id INTEGER NOT NULL,
        session_type VARCHAR(32) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        conversation_ids INTEGER[] NULL,
        report JSONB NOT NULL
    )
    """
    )
    await conn.execute(
        """
    CREATE INDEX IF NOT EXISTS idx_call_reports_user_id_created_at
        ON call_reports(user_id, created_at DESC)
    """
    )


async def _fetch_recent_conversations(
    conn: asyncpg.Connection, user_id: int, session_type: str
) -> List[asyncpg.Record]:
    """
    Fetch conversations to include in the analysis.

    For now this uses simple heuristics:
    - test: last 10 conversations for that user
    - practice: all conversations from the latest practice day
    """
    # naive heuristic: infer type from room_name prefix if available
    if session_type == "test":
        # For tests, include all conversations for this user (ordered newest first)
        return await conn.fetch(
            """
            SELECT * FROM conversations
            WHERE user_id = $1
            ORDER BY timestamp DESC
            """,
            user_id,
        )

    # practice: figure out latest date then return all for that date
    latest_row: Optional[asyncpg.Record] = await conn.fetchrow(
        """
        SELECT timestamp::date AS day
        FROM conversations
        WHERE user_id = $1
        ORDER BY timestamp DESC
        LIMIT 1
        """,
        user_id,
    )
    if not latest_row:
        return []

    latest_day: date = latest_row["day"]
    return await conn.fetch(
        """
        SELECT * FROM conversations
        WHERE user_id = $1 AND timestamp::date = $2
        ORDER BY timestamp ASC
        """,
        user_id,
        latest_day,
    )


def _flatten_transcripts(
    historical_rows: List[asyncpg.Record], latest_transcript: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """
    Turn DB JSONB transcripts + latest in-memory transcript into
    one unified list of turns suitable for prompting.
    """
    turns: List[Dict[str, Any]] = []

    def _extract_items(t: Any) -> List[Dict[str, Any]]:
        """Support both 'messages' and 'items' keys; ignore unknown shapes."""
        # If it's a JSON string, try to parse it
        if isinstance(t, str):
            try:
                parsed = json.loads(t)
                t = parsed
            except Exception:
                return []
        if not isinstance(t, dict):
            return []
        if "messages" in t and isinstance(t["messages"], list):
            return [m for m in t["messages"] if isinstance(m, dict)]
        if "items" in t and isinstance(t["items"], list):
            return [m for m in t["items"] if isinstance(m, dict)]
        return []

    for row in historical_rows:
        t = row["transcript"] or {}
        turns.extend(_extract_items(t))

    # latest session
    if latest_transcript:
        turns.extend(_extract_items(latest_transcript))

    return turns


def _extract_json_object(text: str) -> Optional[Dict[str, Any]]:
    """
    Try to parse the first JSON object found in a string.
    This protects us from stray tokens (e.g., "Okay" or "Please") before/after JSON.
    """
    if not text:
        return None
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        return json.loads(text[start : end + 1])
    except Exception:
        return None


async def _call_llm_for_report(
    turns: List[Dict[str, Any]], session_type: str
) -> Dict[str, Any]:
    """Use Google LLM to generate a structured report."""
    if not turns:
        return {
            "summary": "No conversation turns available for analysis.",
            "feedback": [],
            "level": None,
        }

    llm = google.LLM(
        model="gemini-2.0-flash-exp",
        temperature=0.7,  # user-requested setting
        vertexai=True,
    )

    # Keep prompt simple and robust – you can fine tune later.
    user_turns = [
        t for t in turns if t.get("role") in ("user", "participant", "local")
    ]
    system_turns = [t for t in turns if t.get("role") in ("assistant", "agent")]

    # Exact sample structure to mirror (from Node.js sample)
    sample_report_template = """{
  "fluency": {
    "fluencyScore": 59,
    "fluencyLevel": "B2",
    "improvementTarget": {
      "percentToNextLevel": 11,
      "nextLevel": "C1"
    },
    "fillerWords": {
      "percentage": 3,
      "feedback": "You use filler words occasionally. Replace them with pauses for better clarity.",
      "topFillers": {
        "actually": 3,
        "try": 2,
        "okay": 2
      }
    },
    "wordsPerMinute": {
      "value": 101,
      "emoji": "👍",
      "feedback": "This is a good speaking pace. Try slight variation for emphasis.",
      "speedBarPercent": 60
    },
    "hesitationsAndCorrections": {
      "rate": 4,
      "feedback": "You made some mid-sentence corrections and pauses. Practice speaking in longer chunks to improve flow."
    }
  },
  "vocabulary": {
    "vocabularyScore": 49,
    "vocabularyLevel": "B1",
    "improvementTarget": {
      "percentToNextLevel": 1,
      "nextLevel": "B2"
    },
    "activeVocabulary": 1897,
    "uniqueWords": 48,
    "lexicalDiversity": {
      "score": 0.39,
      "feedback": "Your word variety is decent, but you repeat simpler terms. Try using more synonyms."
    },
    "levelBreakdown": {
      "A1": 48,
      "A2": 23,
      "B1": 13,
      "B2": 10,
      "C1": 2,
      "C2": 4
    },
    "wordSuggestions": {
      "good": [
        {
          "word": "skilled",
          "level": "B2",
          "color": "#4CAF50",
          "definition": "Having the ability and experience to do something well."
        },
        {
          "word": "proficient",
          "level": "C1",
          "color": "#2196F3",
          "definition": "Highly skilled or competent in a subject or activity."
        }
      ],
      "happy": [
        {
          "word": "delighted",
          "level": "B2",
          "color": "#FFC107",
          "definition": "Feeling or showing great pleasure."
        },
        {
          "word": "thrilled",
          "level": "C1",
          "color": "#FF9800",
          "definition": "Extremely pleased or excited."
        }
      ]
    },
    "exampleSentences": {
      "good": "He is a good developer.",
      "happy": "I am happy to be here."
    },
    "idiomaticLanguage": {
      "usedCorrectly": 1,
      "missedOpportunities": 3,
      "feedback": "You rarely used idioms. For example, instead of 'I'm very tired', you could say 'I'm worn out.'"
    }
  },
  "grammar": {
    "grammarScore": 25,
    "grammarLevel": "A2",
    "improvementTarget": {
      "percentToNextLevel": 5,
      "nextLevel": "B1"
    },
    "growthPoints": [
      "Articles",
      "Subject-Verb Agreement",
      "Phrasal Verbs"
    ],
    "improvementDescription": "Review article usage and subject-verb agreement rules. Practice using common phrasal verbs in context.",
    "grammarErrors": {
      "Articles": [
        {
          "description": "Use 'a' or 'an' before singular countable nouns.",
          "incorrectSentence": "I have plan for it.",
          "correctedSentence": "I have a plan for it."
        }
      ],
      "Subject-Verb Agreement": [
        {
          "description": "The subject and verb must agree in number.",
          "incorrectSentence": "how they are it is evolving",
          "correctedSentence": "how it is evolving"
        }
      ],
      "Phrasal Verbs": [
        {
          "description": "'Explain' needs a preposition when followed by a person.",
          "incorrectSentence": "I will explain you the idea",
          "correctedSentence": "I will explain the idea to you"
        }
      ]
    },
    "sentenceComplexity": {
      "score": 45,
      "feedback": "Most of your sentences are simple. Try combining clauses and using relative pronouns like 'which' or 'that'."
    }
  },
  "discourse": {
    "discourseScore": 51,
    "discourseLevel": "B1",
    "improvementTarget": {
      "percentToNextLevel": 7,
      "nextLevel": "B2"
    },
    "cohesion": {
      "score": 56,
      "feedback": "You used basic connectors like 'and', 'but'. Use transitions like 'however', 'on the other hand', and 'in contrast'."
    },
    "coherence": {
      "score": 53,
      "feedback": "Ideas are mostly clear, but organization could improve. Use structured outlines like: introduction > point > example > conclusion."
    }
  }
}"""

    prompt = (
        "You are an English speaking coach for a speaking-practice app.\n"
        "You receive full dialog transcripts as a list of turns.\n"
        f"Session type: {session_type}.\n\n"
        "1. Briefly summarize what the user talked about.\n"
        "2. Analyze the user's speaking ability (fluency, grammar, vocabulary, pronunciation, confidence).\n"
        "3. Give 3–5 concrete, kind, actionable suggestions.\n"
        "4. If possible, estimate a CEFR level (A1–C2) but only if you are confident.\n"
        "Always return pure JSON (no markdown, no prose).\n"
        "Use EXACTLY the following sample structure (match keys and nesting, values must reflect the transcript analysis, not the sample values):\n"
        f"{sample_report_template}\n"
        "Update every value based on the user's performance; keep the same keys and shape.\n"
        "Your entire response MUST be a single JSON object. Do NOT include any preamble or words. Start with '{' and end with '}'.\n"
        "Do NOT say 'Okay' or any acknowledgement. Respond now with the filled JSON for this conversation.\n"
    )

    conversation_snippet = {
        "user_turns": user_turns[-50:],  # last 50 turns for brevity
        "assistant_turns": system_turns[-50:],
    }

    # Build ChatContext manually for compatibility with current livekit-agents
    chat_ctx = ChatContext()
    chat_ctx.messages = [
        ChatMessage(role="system", content=[prompt]),
        ChatMessage(
            role="user",
            content=[f"Here is the conversation JSON: {conversation_snippet}"],
        ),
        ChatMessage(
            role="system",
            content=[
                "Output only JSON matching the template above. No extra words. Start with '{' and end with '}'."
            ],
        ),
    ]

    stream = llm.chat(chat_ctx=chat_ctx)

    # Collect streamed content (defensive against varying chunk shapes)
    collected_text = ""
    chunk_count = 0
    raw_chunks: List[str] = []
    async for chunk in stream:
        chunk_count += 1
        try:
            raw_chunks.append(str(chunk))
        except Exception:
            raw_chunks.append("<unserializable chunk>")
        if hasattr(chunk, "choices"):
            try:
                for choice in chunk.choices:
                    if hasattr(choice, "delta") and getattr(choice.delta, "content", None):
                        delta_content = choice.delta.content
                        if isinstance(delta_content, list):
                            collected_text += "".join(
                                part if isinstance(part, str) else ""
                                for part in delta_content
                            )
                        elif isinstance(delta_content, str):
                            collected_text += delta_content
                    # Some implementations use delta.parts with .text
                    if hasattr(choice, "delta") and getattr(choice.delta, "parts", None):
                        for part in choice.delta.parts:
                            txt = getattr(part, "text", None)
                            if isinstance(txt, str):
                                collected_text += txt
            except Exception:
                collected_text += ""
        elif hasattr(chunk, "candidates"):
            # google genai-style streaming
            try:
                for cand in getattr(chunk, "candidates", []):
                    content = getattr(cand, "content", None)
                    if not content:
                        continue
                    parts = getattr(content, "parts", None)
                    if parts:
                        for part in parts:
                            text = getattr(part, "text", None)
                            if isinstance(text, str):
                                collected_text += text
            except Exception:
                collected_text += ""
        elif hasattr(chunk, "text"):
            text_val = getattr(chunk, "text", "")
            if isinstance(text_val, str):
                collected_text += text_val
        # ignore any other chunk shapes to avoid polluting JSON
    await stream.aclose()

    logger.info(
        "report_service: LLM collected_text length=%s preview=%s chunk_count=%s",
        len(collected_text),
        collected_text[:200],
        chunk_count,
    )

    # If streaming returned nothing, attempt a non-streaming completion as fallback
    if not collected_text.strip():
        logger.error(
            "Streaming returned no text; raw_chunks=%s",
            raw_chunks[:5],
        )

    # Defensive parsing: first try direct JSON, then substring extraction.
    if collected_text.strip():
        parsed = None
        try:
            parsed = json.loads(collected_text)
        except Exception:
            parsed = _extract_json_object(collected_text)
        if parsed:
            return parsed

    # fallback: if nothing collected or parse failed, return graceful message
    logger.error("Failed to parse LLM report response: raw=%s", collected_text[:500])
    return {
        "summary": "Analysis failed or returned invalid JSON.",
        "feedback": ["Please try again later."],
        "level": None,
    }


async def generate_and_save_report(
    user_id: int,
    session_type: str,
    latest_transcript: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Core orchestration:
    - fetch historical conversations for user
    - combine with latest transcript
    - call LLM
    - persist report
    - return report JSON
    """
    conn = await _get_connection()
    try:
        await ensure_call_reports_table(conn)

        historical_rows = await _fetch_recent_conversations(
            conn, user_id=user_id, session_type=session_type
        )
        logger.info(
            "report_service: fetched %s conversations for user %s (session_type=%s)",
            len(historical_rows),
            user_id,
            session_type,
        )
        # Log a small sample of raw transcripts for inspection
        try:
            sample_raw = []
            for row in historical_rows[:3]:
                raw = row.get("transcript") if isinstance(row, dict) else row["transcript"]
                sample_raw.append(str(raw)[:500])
            logger.info("report_service: sample transcripts (first 3, trimmed): %s", sample_raw)
        except Exception as e:
            logger.warning("report_service: failed to log sample transcripts: %s", e)

        combined_turns = _flatten_transcripts(historical_rows, latest_transcript)
        logger.info(
            "report_service: combined turns count=%s (historical=%s, latest_provided=%s)",
            len(combined_turns),
            len(historical_rows),
            bool(latest_transcript),
        )
        # Log first few turns to verify structure
        try:
            logger.info("report_service: first 5 turns: %s", combined_turns[:5])
        except Exception as e:
            logger.warning("report_service: failed to log turns sample: %s", e)

        report = await _call_llm_for_report(combined_turns, session_type)

        conversation_ids = [row["id"] for row in historical_rows]
        await conn.execute(
            """
            INSERT INTO call_reports (user_id, session_type, conversation_ids, report)
            VALUES ($1, $2, $3, $4)
            """,
            user_id,
            session_type,
            conversation_ids,
            json.dumps(report),
        )
        logger.info(
            "report_service: saved report for user %s (session_type=%s) with conversations=%s",
            user_id,
            session_type,
            conversation_ids,
        )

        return report
    finally:
        await conn.close()


# SAMPLE_REPORT structure matching Node.js implementation
SAMPLE_REPORT = {
    "fluency": {
        "fluencyScore": 75,
        "fluencyLevel": "B1",
        "wordsPerMinute": {
            "value": 120,
            "emoji": "🚀",
            "feedback": "Your speaking pace is good, but you can aim for a slightly faster pace to reach advanced fluency.",
            "speedBarPercent": 75
        },
        "fillerWords": {
            "percentage": 5,
            "feedback": "You used some filler words like 'um' and 'uh'. Try to reduce these for smoother speech."
        },
        "hesitationsAndCorrections": {
            "rate": 2,
            "feedback": "You had a few hesitations. Practice pausing intentionally to gather thoughts."
        }
    },
    "vocabulary": {
        "vocabularyScore": 70,
        "vocabularyLevel": "B1",
        "activeVocabulary": 150,
        "uniqueWords": 100,
        "lexicalDiversity": {
            "score": 65,
            "feedback": "Your vocabulary diversity is moderate. Try incorporating more advanced words."
        },
        "levelBreakdown": {
            "A1": 50,
            "A2": 30,
            "B1": 15,
            "B2": 5,
            "C1": 0,
            "C2": 0
        },
        "wordSuggestions": {
            "good": [
                {"word": "excellent", "level": "B2", "definition": "Of the highest quality", "color": "#60A5FA"},
                {"word": "superb", "level": "C1", "definition": "Outstanding or impressive", "color": "#34D399"}
            ]
        },
        "exampleSentences": {
            "excellent": "Your performance was excellent during the presentation.",
            "superb": "The team delivered a superb result on the project."
        },
        "idiomaticLanguage": {
            "usedCorrectly": 2,
            "missedOpportunities": 3,
            "feedback": "You used some idioms correctly but missed opportunities to use phrases like 'hit the nail on the head'."
        }
    },
    "grammar": {
        "grammarScore": 80,
        "grammarLevel": "B2",
        "growthPoints": ["Subject-verb agreement", "Correct use of prepositions"],
        "sentenceComplexity": {
            "score": 70,
            "feedback": "Your sentences are moderately complex. Try using more compound sentences."
        },
        "grammarErrors": {
            "articles": [
                {
                    "description": "Incorrect use of article",
                    "incorrectSentence": "I saw a elephant in zoo.",
                    "correctedSentence": "I saw an elephant in the zoo."
                }
            ],
            "verbAgreement": [
                {
                    "description": "Subject-verb agreement error",
                    "incorrectSentence": "She go to school every day.",
                    "correctedSentence": "She goes to school every day."
                }
            ]
        }
    },
    "discourse": {
        "discourseScore": 65,
        "discourseLevel": "B1",
        "cohesion": {
            "score": 70,
            "feedback": "You used some connectors well, but try adding more transitions like 'therefore'."
        },
        "coherence": {
            "score": 60,
            "feedback": "Your ideas are mostly clear, but ensure your points are logically ordered."
        }
    },
    "improvementTarget": {
        "nextLevel": "B2",
        "percentToNextLevel": 20
    }
}


async def fetch_user_conversations(
    conn: asyncpg.Connection, user_id: int, limit: int = 10
) -> List[asyncpg.Record]:
    """
    Fetch previous conversations for a user from the database.
    Matches the Node.js logic: fetch last N conversations ordered by timestamp DESC.
    """
    rows = await conn.fetch(
        """
        SELECT id, room_name, user_id, timestamp, transcript
        FROM conversations
        WHERE user_id = $1
        ORDER BY timestamp DESC
        LIMIT $2
        """,
        user_id,
        limit,
    )
    return rows


async def generate_report_with_groq(
    user_id: int,
    transcript_items: List[Dict[str, Any]],
    groq_model: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generate a report using Groq API with the exact same prompt structure as Node.js.
    
    Args:
        user_id: User ID for logging
        transcript_items: List of transcript items (from previous + current conversations)
        groq_model: Groq model to use (defaults to environment variable or fallback)
    
    Returns:
        Generated report dictionary matching Node.js format
    """
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is not set in environment variables")

    # Use model from environment or fallback
    model = groq_model or GROQ_MODEL_REPORT or GROQ_MODEL_FALLBACK

    # Build system prompt matching Node.js exactly
    system_prompt = f"""You are a world-class English language assessment AI specializing in comprehensive conversation analysis. Your task is to analyze the provided conversation transcript and generate a detailed, accurate report.

CRITICAL ANALYSIS REQUIREMENTS:
1. Analyze ONLY the conversation transcript provided - no external data or assumptions
2. Provide COMPREHENSIVE analysis of ALL aspects: fluency, vocabulary, grammar, and discourse
3. For EVERY field in the report structure, provide meaningful data or set to null if insufficient information
4. Use ONLY the user's actual words, sentences, and speech patterns from the transcript
5. If the transcript lacks sufficient content for analysis, clearly indicate this and set relevant fields to null
6. Be exhaustive in grammar error detection - find EVERY error in the transcript
7. Provide specific, actionable feedback based on actual user speech patterns
8. Ensure all numerical values are accurate and based on transcript analysis
9. Maintain consistency between scores, levels, and feedback across all sections
10. DO NOT use markdown, extra text, or break JSON structure; output ONLY valid JSON. No trailing commas or syntax errors. Use plain numbers for scores/percentages/rates (e.g., "score": 75). Set fields to null if data insufficient. Never fabricate data.

The structure to use is exactly as in the following example (all fields required, types must match):
{json.dumps(SAMPLE_REPORT, indent=2)}

CRITICAL WARNING: The sample above is ONLY for showing the required JSON structure. DO NOT use any of its data, content, words, sentences, examples, or feedback. Analyze ONLY the transcript provided. Reference the user's actual words for examples and feedback. If a field cannot be filled due to insufficient data, set it to null."""

    user_message = f"Analyze this conversation transcript and generate a comprehensive English language assessment report. Focus on the user's actual speech patterns, vocabulary usage, grammar, and fluency: {json.dumps(transcript_items)}"

    formatted_messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    groq_payload = {
        "model": model,
        "messages": formatted_messages,
        "temperature": 0.7,
        "max_tokens": 8192,
        "response_format": {"type": "json_object"},
    }

    # Call Groq API
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            GROQ_API_URL,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json=groq_payload,
        )

        if not response.is_success:
            error_data = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
            error_msg = error_data.get("error", {}).get("message", response.text) if error_data else response.text
            raise Exception(f"Groq API error! Status: {response.status_code}. Details: {error_msg}")

        groq_result = response.json()
        content_string = groq_result["choices"][0]["message"]["content"]

        if not content_string:
            raise Exception("No content received from AI")

        # Parse JSON response (matching Node.js logic)
        json_string = content_string
        if "```json" in json_string:
            json_string = json_string.split("```json")[1] if "```json" in json_string else json_string
        elif "```" in json_string:
            json_string = json_string.split("```")[1] if "```" in json_string else json_string

        start_index = json_string.find("{")
        end_index = json_string.rfind("}")
        if start_index == -1 or end_index == -1 or end_index < start_index:
            raise Exception("AI returned malformed JSON")

        json_string = json_string[start_index : end_index + 1]

        try:
            parsed_data = json.loads(json_string)
            logger.info(
                "report_service: Generated report for user %s using Groq API",
                user_id,
            )
            return parsed_data
        except json.JSONDecodeError as e:
            logger.error(
                "report_service: Failed to parse Groq response as JSON: %s, content: %s",
                e,
                json_string[:500],
            )
            raise Exception("AI returned malformed JSON")


