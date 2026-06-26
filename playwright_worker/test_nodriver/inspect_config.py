import asyncio
import nodriver as uc

async def main():
    browser = await uc.start()
    print("PORT:", browser.config.port)
    print("HOST:", browser.config.host)
    print("WS:", getattr(browser.config, 'websockets_url', 'Not found'))
    
    # Try getting the websocket debugger URL from the browser itself
    # nodriver Browser uses a connection object
    print("Connection WS:", getattr(browser.connection, 'websocket_url', 'Not found'))
    
    browser.stop()

if __name__ == "__main__":
    asyncio.run(main())
