import arrow
import json
import os
import sys
from playwright.sync_api import sync_playwright
from requests_oauthlib import OAuth1
from settings import debug

def create_oauth_header(auth, method: str, url: str, body: str = None):
    """
    Create OAuth 1.0a authorization header.

    Args:
        auth: OAuth1 instance
        method: HTTP method
        url: Request URL
        body: Optional request body

    Returns:
        str: Authorization header value
    """
    from requests import Request
    headers = {"Content-Type": "application/json"} if body else {}
    body_bytes = body.encode('utf-8') if body else None
    req = Request(method, url, data=body_bytes, headers=headers)
    prepared = req.prepare()
    auth(prepared)

    # Convert bytes to string if needed
    auth_value = prepared.headers.get('Authorization', '')
    if isinstance(auth_value, bytes):
        return auth_value.decode('utf-8')
    return str(auth_value)

def create_tweet_with_playwright(browser, auth, text: str):
    """
    Create a tweet using Playwright to bypass Cloudflare protection.

    Args:
        browser: Playwright browser instance
        auth: OAuth1 authentication
        text: Tweet text

    Returns:
        dict: Twitter API response with tweet data

    Raises:
        Exception: If the tweet creation fails
    """
    context = browser.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )

    try:
        url = "https://api.twitter.com/2/tweets"
        payload = {"text": text}
        body_str = json.dumps(payload)

        # Generate OAuth header
        auth_header = create_oauth_header(auth, 'POST', url, body_str)

        headers = {
            "Authorization": auth_header,
            "Content-Type": "application/json"
        }

        # Make API request through Playwright
        page = context.new_page()
        response = page.request.post(url, data=body_str, headers=headers)

        # Check for Cloudflare in response headers (both success and failure cases)
        response_headers = response.headers
        if 'cf-ray' in response_headers or 'cf-cache-status' in response_headers:
            if response.status == 201:
                print(f"✅ Cloudflare challenge passed successfully")
            else:
                print(f"⚠️  Cloudflare detected but request failed")
            print(f"cf-ray: {response_headers.get('cf-ray', 'N/A')}")
            print(f"cf-cache-status: {response_headers.get('cf-cache-status', 'N/A')}")

        if response.status != 201:
            error_detail = f"Status: {response.status}, Response: {response.text()}"
            raise Exception(f"Failed to create tweet: {error_detail}")

        return response.json()
    finally:
        context.close()

def main() -> int:
    pr_body = os.environ["PR_BODY"]

    ja_body = ''
    en_body = ''
    lines = pr_body.split("\n")
    if len(lines) != 2:
        print(f"Pull request body should have exactly 2 lines")
        return 1

    ja_body = lines[0]
    en_body = lines[1]
    
    ja_text = f"カレンダーを更新しました: {ja_body}"
    en_text = f"The calendar data has been updated: {en_body}"

    if debug:
        print(ja_text)
        print(en_text)

        return 0

    # Set up OAuth1 authentication for Japanese account
    ja_auth = OAuth1(
        os.environ["JA_CONSUMER_KEY"],
        os.environ["JA_CONSUMER_SECRET"],
        os.environ["JA_ACCESS_TOKEN"],
        os.environ["JA_ACCESS_TOKEN_SECRET"]
    )

    # Set up OAuth1 authentication for English account
    en_auth = OAuth1(
        os.environ["EN_CONSUMER_KEY"],
        os.environ["EN_CONSUMER_SECRET"],
        os.environ["EN_ACCESS_TOKEN"],
        os.environ["EN_ACCESS_TOKEN_SECRET"]
    )

    tweet_failed = False

    # Use Playwright to make requests through real browser context
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # Post Japanese tweet
        try:
            print(ja_text)
            result = create_tweet_with_playwright(browser, ja_auth, ja_text)
            print(f"Successfully posted Japanese tweet (ID: {result['data']['id']})")
        except Exception as e:
            print(f"Failed to tweet: {e}")
            print(f"Tweet text: {ja_text}")
            tweet_failed = True

        # Post English tweet
        try:
            print(en_text)
            result = create_tweet_with_playwright(browser, en_auth, en_text)
            print(f"Successfully posted English tweet (ID: {result['data']['id']})")
        except Exception as e:
            print(f"Failed to tweet: {e}")
            print(f"Tweet text: {en_text}")
            tweet_failed = True

        browser.close()

    if tweet_failed:
        return 1

    return 0

if __name__ == "__main__":
    sys.exit(main())
