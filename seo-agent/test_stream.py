import asyncio
from app import executor

async def test_stream():
    inputs = {"input": "Hello", "chat_history": []}
    async for event in executor.astream_events(inputs, version="v2"):
        kind = event["event"]
        print(f"EVENT: {kind}")
        if kind == "on_chat_model_stream":
            chunk = event["data"]["chunk"]
            print(f"CHUNK: {chunk.content}")

if __name__ == "__main__":
    asyncio.run(test_stream())
