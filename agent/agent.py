from livekit.agents import Agent

from agent_prompts import base_emotional_instructions


class EmotiveAgent(Agent):
    def __init__(self, custom_prompt: str = "", first_prompt: str = "") -> None:
        # Combine custom prompt with emotional instructions
        if custom_prompt:
            full_instructions = f"{custom_prompt}\n\n{base_emotional_instructions}"
        else:
            full_instructions = (
                "greet the user and ask about their day. Do not be pushy or annoying. "
                "do it in one line and do not ask too many questions. in one line "
                "complete the sentence. and wait for the user to respond. "
                f"{base_emotional_instructions}"
            )

        super().__init__(instructions=full_instructions)

        # Store the first prompt for later use
        self.first_prompt = first_prompt

