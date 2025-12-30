import arrow
import json
import os
import sys
from playwright.sync_api import sync_playwright
from requests_oauthlib import OAuth1
from twitter_text import parse_tweet
from nijical import NijiCal
from settings import debug, url_prefix

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

    # Debug: Check what auth(prepared) returns
    r = auth(prepared)
    print(f"DEBUG create_oauth_header: auth() return type: {type(r)}")
    print(f"DEBUG create_oauth_header: auth() return value: {repr(r)}")

    # If auth() returns something, check its headers
    if r is not None and hasattr(r, 'headers'):
        r_auth = r.headers.get('Authorization', '')
        print(f"DEBUG create_oauth_header: r.headers['Authorization'] type: {type(r_auth)}")
        print(f"DEBUG create_oauth_header: r.headers['Authorization'] value: {repr(r_auth)}")

    # Debug: Check what prepared.headers contains
    auth_value = prepared.headers.get('Authorization', '')
    print(f"DEBUG create_oauth_header: prepared.headers['Authorization'] type: {type(auth_value)}")
    print(f"DEBUG create_oauth_header: prepared.headers['Authorization'] value: {repr(auth_value)}")

    # Convert bytes to string if needed
    if isinstance(auth_value, bytes):
        return auth_value.decode('utf-8')
    return str(auth_value)

def create_tweet_with_playwright(browser, auth, text: str, reply_to: str | None = None):
    """
    Create a tweet using Playwright to bypass Cloudflare protection.

    Args:
        browser: Playwright browser instance
        auth: OAuth1 authentication
        text: Tweet text
        reply_to: Optional tweet ID to reply to

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

        if reply_to is not None:
            payload["reply"] = {"in_reply_to_tweet_id": reply_to}

        body_str = json.dumps(payload)

        # Generate OAuth header
        auth_header = create_oauth_header(auth, 'POST', url, body_str)

        # Debug: Check what auth_header contains
        print(f"DEBUG: auth_header type: {type(auth_header)}")
        print(f"DEBUG: auth_header value: {repr(auth_header)}")

        headers = {
            "Authorization": str(auth_header),
            "Content-Type": "application/json"
        }

        # Make API request through Playwright
        page = context.new_page()
        response = page.request.post(url, data=body_str, headers=headers)

        if response.status != 201:
            error_detail = f"Status: {response.status}, Response: {response.text()}"
            raise Exception(f"Failed to create tweet: {error_detail}")

        return response.json()
    finally:
        context.close()

def split_text_for_tweets(text: str) -> list[str]:
    parse_result = parse_tweet(text)
    if parse_result.valid:
        return [text]

    result: list[str] = []
    texts = text.split("\n\n")
    tweet = ''
    for t in texts:
        if len(t) == 0:
            continue

        if len(tweet) == 0:
            tweet = t
            continue

        next_tweet = f"{tweet}\n\n{t}"
        if parse_tweet(next_tweet).valid:
            tweet = next_tweet
        else:
            result.append(tweet)
            tweet = t

    result.append(tweet)

    return result

def main() -> int:
    talent_file = sys.argv[1]
    event_file = sys.argv[2]
    ticket_file = sys.argv[3]
    instance = NijiCal(talent_file, event_file, ticket_file, url_prefix)
    tzinfo = "+09:00"
    today = arrow.now(tzinfo)
    tomorrow = today.shift(days=1)

    (ja_text_today, en_text_today) = instance.generate_tweet_for_date(today)
    (ja_text_tomorrow, en_text_tomorrow) = instance.generate_tweet_for_date(tomorrow)

    ja_header_today = f"📅 今日（{today.format('M/D')}）\n"
    if len(ja_text_today) == 0:
        ja_text_today = ja_header_today + "なし\n\n"
    else:
        ja_text_today = ja_header_today + ja_text_today

    ja_header_tomorrow = f"📅 明日（{tomorrow.format('M/D')}）\n"
    if len(ja_text_tomorrow) == 0:
        ja_text_tomorrow = ja_header_tomorrow + "なし\n\n"
    else:
        ja_text_tomorrow = ja_header_tomorrow + ja_text_tomorrow

    ja_tweets = split_text_for_tweets(ja_text_today + ja_text_tomorrow)
    for t in ja_tweets:
        print(f"=====================\n{t}\n=====================\n")

    en_header_today = f"📅 Today ({today.format('MMM Do')} JST)\n"
    if len(en_text_today) == 0:
        en_text_today = en_header_today + "None\n\n"
    else:
        en_text_today = en_header_today + en_text_today

    en_header_tomorrow = f"📅 Tomorrow ({tomorrow.format('MMM Do')} JST)\n"
    if len(en_text_tomorrow) == 0:
        en_text_tomorrow = en_header_tomorrow + "None\n\n"
    else:
        en_text_tomorrow = en_header_tomorrow + en_text_tomorrow

    en_tweets = split_text_for_tweets(en_text_today + en_text_tomorrow)
    for t in en_tweets:
        print(f"=====================\n{t}\n=====================\n")

    if debug:
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

        # Post Japanese tweets
        reply_id: str | None = None
        for t in ja_tweets:
            try:
                result = create_tweet_with_playwright(browser, ja_auth, t, reply_id)
                reply_id = result["data"]["id"]
                print(f"Successfully posted Japanese tweet (ID: {reply_id})")
            except Exception as e:
                print(f"Failed to tweet: {e}")
                print(f"Tweet text: {t}")
                tweet_failed = True
                break

        # Post English tweets
        reply_id = None
        for t in en_tweets:
            try:
                result = create_tweet_with_playwright(browser, en_auth, t, reply_id)
                reply_id = result["data"]["id"]
                print(f"Successfully posted English tweet (ID: {reply_id})")
            except Exception as e:
                print(f"Failed to tweet: {e}")
                print(f"Tweet text: {t}")
                tweet_failed = True
                break

        browser.close()

    if tweet_failed:
        return 3

    return 0

if __name__ == "__main__":
    sys.exit(main())
