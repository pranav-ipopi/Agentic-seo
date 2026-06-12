import os
import sys
import asyncio
import logging
import argparse

# Ensure we can import from playwright_automation.backlink_automation
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from methods.stealth_browser import StealthBrowserManager
from services.captcha_service import CaptchaService
from services.logging_service import setup_logger
from Bookmark_sites_tester.pligg_generic_terminal import PliggGenericTemplate

logger = setup_logger(level=logging.INFO)

# Global browser manager and captcha service
browser_manager = StealthBrowserManager()
captcha_service = CaptchaService(logger=logger)

async def execute_task(target_url, site_type, client_target_url, keyword, semaphore):
    async with semaphore:
        # Stagger startups slightly
        import random
        await asyncio.sleep(random.uniform(0.5, 3.0))
        
        logger.info(f"Starting task for {target_url} with site type {site_type}")
        
        template_runner = None
        if site_type == 1: # Pligg
            template_runner = PliggGenericTemplate(
                target_url=target_url,
                browser_manager=browser_manager,
                captcha_service=captcha_service,
                logger=logger
            )
        else:
            logger.error(f"Unknown site type: {site_type}")
            return
            
        try:
            res = await template_runner.run(client_target_url, keyword)
            logger.info(f"Success for {target_url}: {res}")
        except Exception as e:
            logger.error(f"Execution failed for {target_url}: {e}")

async def main():
    parser = argparse.ArgumentParser(description="Terminal based site tester")
    parser.add_argument("--url", type=str, help="Single target URL to test")
    parser.add_argument("--file", type=str, help="File path containing target URLs (one per line)")
    parser.add_argument("--type", type=int, help="Site type selector (1 = Pligg)")
    parser.add_argument("--client-url", type=str, help="Client target URL to submit")
    parser.add_argument("--keyword", type=str, help="Keyword for submission")
    parser.add_argument("--concurrency", type=int, default=5, help="Number of concurrent tasks")
    
    args = parser.parse_args()
    
    # Interactive fallback
    if not args.url and not args.file:
        choice = input("Enter 1 to provide a single target URL, or 2 to provide a file path: ").strip()
        if choice == '1':
            args.url = input("Enter target URL: ").strip()
        elif choice == '2':
            args.file = input("Enter file path: ").strip()
        else:
            print("Invalid choice.")
            sys.exit(1)
            
    if args.type is None:
        try:
            args.type = int(input("Enter site type selector (1 = Pligg): ").strip())
        except ValueError:
            print("Invalid site type. Must be an integer.")
            sys.exit(1)
            
    if not args.client_url:
        args.client_url = input("Enter client target URL to submit (default: https://example.com): ").strip()
        if not args.client_url:
            args.client_url = "https://example.com"
            
    if not args.keyword:
        args.keyword = input("Enter keyword (default: Test Keyword): ").strip()
        if not args.keyword:
            args.keyword = "Test Keyword"
    
    urls = []
    if args.url:
        urls.append(args.url.strip())
    
    if args.file:
        if os.path.exists(args.file):
            with open(args.file, 'r') as f:
                urls.extend([line.strip() for line in f if line.strip()])
        else:
            logger.error(f"File not found: {args.file}")
            sys.exit(1)
            
    if not urls:
        logger.error("No valid URLs found to process.")
        sys.exit(1)
        
    logger.info(f"Loaded {len(urls)} URLs to process. Concurrency: {args.concurrency}")
    
    # Initialize Browser Manager
    await browser_manager.start()
    
    semaphore = asyncio.Semaphore(args.concurrency)
    
    tasks = []
    for url in urls:
        tasks.append(
            execute_task(
                target_url=url,
                site_type=args.type,
                client_target_url=args.client_url,
                keyword=args.keyword,
                semaphore=semaphore
            )
        )
        
    try:
        await asyncio.gather(*tasks)
    except Exception as e:
        logger.error(f"Error during execution: {e}")
    finally:
        await browser_manager.close()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Script stopped by user.")
