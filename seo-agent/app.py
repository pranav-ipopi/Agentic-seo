import os
import json
from typing import AsyncGenerator, Dict, Any, List

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sse_starlette.sse import EventSourceResponse

from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain_classic.agents import create_json_chat_agent, AgentExecutor
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder, SystemMessagePromptTemplate, HumanMessagePromptTemplate
from tools import web_search, seo_brief

load_dotenv()

app = FastAPI(title="LangChain SEO Agent")
security = HTTPBearer()

def verify_api_key(credentials: HTTPAuthorizationCredentials = Depends(security)):
    expected_key = os.getenv("AGENT_API_KEY")
    if not expected_key:
        # If no key configured, we allow it (or we could reject)
        return credentials.credentials
    if credentials.credentials != expected_key:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    return credentials.credentials

model_name = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
groq_api_key = os.getenv("GROQ_API_KEY")

llm = ChatGroq(
    model=model_name,
    api_key=groq_api_key,
    temperature=1,
    max_tokens=1024,
)
tools = [web_search, seo_brief]

system_template = """Assistant is a powerful digital marketing assistant.
Please be enthusiastic and use emojis in your responses to make them more engaging and interesting!

TOOLS:
------
Assistant has access to the following tools:
{tools}

To use a tool, please use the following format exactly. The $TOOL_NAME must be one of: {tool_names}
```json
{{
    "action": "$TOOL_NAME",
    "action_input": $ACTION_INPUT_JSON
}}
```

When you have a response to say to the Human, or if you do not need to use a tool, you MUST use the format:
```json
{{
    "action": "Final Answer",
    "action_input": "What you want to say to the human"
}}
```

Begin!
"""

prompt = ChatPromptTemplate.from_messages([
    SystemMessagePromptTemplate.from_template(system_template),
    MessagesPlaceholder(variable_name="chat_history"),
    HumanMessagePromptTemplate.from_template("{input}\n\n{agent_scratchpad}")
])

agent = create_json_chat_agent(llm, tools, prompt)
executor = AgentExecutor(agent=agent, tools=tools, verbose=True, handle_parsing_errors=True)

def convert_messages(messages_json: List[Dict[str, Any]]):
    """Convert Next.js OpenAI-style messages to LangChain message objects."""
    langchain_msgs = []
    
    for msg in messages_json:
        role = msg.get("role")
        content = msg.get("content", "")
        if role == "system":
            langchain_msgs.append(SystemMessage(content=content))
        elif role == "user":
            langchain_msgs.append(HumanMessage(content=content))
        elif role == "assistant":
            langchain_msgs.append(AIMessage(content=content))
            
    return langchain_msgs

@app.post("/chat")
async def chat_endpoint(request: Request, api_key: str = Depends(verify_api_key)):
    body = await request.json()
    messages_json = body.get("messages", [])
    if not messages_json:
        raise HTTPException(status_code=400, detail="Missing messages")
    
    # We extract the last message as the 'input' for the agent
    last_msg = messages_json.pop()
    if last_msg.get("role") != "user":
        # Put it back if it's not a user message (edge case)
        messages_json.append(last_msg)
        user_input = ""
    else:
        user_input = last_msg.get("content", "")

    history = convert_messages(messages_json)
    
    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            # We use astream_events to get granular streaming of tokens and tool calls
            async for event in executor.astream_events(
                {"input": user_input, "chat_history": history},
                version="v2"
            ):
                kind = event["event"]
                
                # Stream Tool start
                if kind == "on_tool_start":
                    tool_name = event["name"]
                    data = json.dumps({"tool": {"tool": tool_name, "status": "running"}})
                    yield {"event": "agent.tool.progress", "data": data}
                    
                # Stream Tool end
                elif kind == "on_tool_end":
                    tool_name = event["name"]
                    data = json.dumps({"tool": {"tool": tool_name, "status": "completed"}})
                    yield {"event": "agent.tool.progress", "data": data}
                    
                # Stream Final Answer once Agent finishes
                elif kind == "on_chain_end" and event["name"] == "AgentExecutor":
                    final_output = event["data"].get("output", {})
                    if isinstance(final_output, dict) and "output" in final_output:
                        final_text = final_output["output"]
                        data = json.dumps({"choices": [{"delta": {"content": final_text}}]})
                        yield {"data": data}
                    
            yield {"data": "[DONE]"}
            
        except Exception as e:
            print(f"Error during streaming: {e}")
            # Emitting an error in the stream
            data = json.dumps({"error": str(e)})
            yield {"event": "error", "data": data}
            
    return EventSourceResponse(event_generator())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

