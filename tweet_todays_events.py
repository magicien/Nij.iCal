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

def split_text_for_tweets(text_today: str, header_today: str, text_tomorrow: str, header_tomorrow: str) -> list[str]:
    """
    Split combined today/tomorrow events into multiple tweets if needed.
    Second and subsequent tweets will include appropriate headers (today or tomorrow).

    Args:
        text_today: Today's events text (including header)
        header_today: Today's header text
        text_tomorrow: Tomorrow's events text (including header)
        header_tomorrow: Tomorrow's header text

    Returns:
        List of tweet texts
    """
    combined_text = text_today + text_tomorrow
    parse_result = parse_tweet(combined_text)
    if parse_result.valid:
        return [combined_text]

    result: list[str] = []

    # Split into paragraphs and tag each with 'today' or 'tomorrow'
    today_paragraphs = [(para, 'today', header_today) for para in text_today.split("\n\n") if len(para) > 0]
    tomorrow_paragraphs = [(para, 'tomorrow', header_tomorrow) for para in text_tomorrow.split("\n\n") if len(para) > 0]
    all_paragraphs = today_paragraphs + tomorrow_paragraphs

    tweet = ''
    current_section = None
    is_first_tweet = True

    for para, section, header in all_paragraphs:
        if len(tweet) == 0:
            # Starting a new tweet
            if is_first_tweet:
                # First tweet: no header prefix needed (paragraph already has header)
                tweet = para
                current_section = section
            else:
                # Subsequent tweets: add header only if paragraph doesn't already start with it
                if para.startswith(header):
                    tweet = para
                else:
                    tweet = header + para
                current_section = section
            continue

        next_tweet = f"{tweet}\n\n{para}"
        if parse_tweet(next_tweet).valid:
            tweet = next_tweet
        else:
            # Current tweet is full, save it and start new tweet
            result.append(tweet)
            # Next tweet should include appropriate header if not already present
            if para.startswith(header):
                tweet = para
            else:
                tweet = header + para
            current_section = section
            is_first_tweet = False

    if len(tweet) > 0:
        result.append(tweet)

    return result

def main() -> int:
    talent_file = sys.argv[1]
    event_file = sys.argv[2]
    ticket_file = sys.argv[3]

    # Optional: date argument (format: YYYY/MM/DD)
    tzinfo = "+09:00"
    if len(sys.argv) >= 5:
        date_str = sys.argv[4]
        today = arrow.get(date_str, "YYYY/MM/DD", tzinfo=tzinfo)
    else:
        today = arrow.now(tzinfo)

    instance = NijiCal(talent_file, event_file, ticket_file, url_prefix)
    tomorrow = today.shift(days=1)

    (ja_text_today, en_text_today) = instance.generate_tweet_for_date(today)
    (ja_text_tomorrow, en_text_tomorrow) = instance.generate_tweet_for_date(tomorrow)

    ja_header_today = f"📅 今日：{today.format('M/D')}（{today.format('ddd', locale='ja')}）\n"
    if len(ja_text_today) == 0:
        ja_text_today = ja_header_today + "なし\n\n"
    else:
        ja_text_today = ja_header_today + ja_text_today

    ja_header_tomorrow = f"📅 明日：{tomorrow.format('M/D')}（{tomorrow.format('ddd', locale='ja')}）\n"
    if len(ja_text_tomorrow) == 0:
        ja_text_tomorrow = ja_header_tomorrow + "なし\n\n"
    else:
        ja_text_tomorrow = ja_header_tomorrow + ja_text_tomorrow

    ja_tweets = split_text_for_tweets(ja_text_today, ja_header_today, ja_text_tomorrow, ja_header_tomorrow)
    for t in ja_tweets:
        print(f"=====================\n{t}\n=====================\n")

    en_header_today = f"📅 Today: {today.format('ddd')}, {today.format('MMM D')} JST\n"
    if len(en_text_today) == 0:
        en_text_today = en_header_today + "None\n\n"
    else:
        en_text_today = en_header_today + en_text_today

    en_header_tomorrow = f"📅 Tomorrow: {tomorrow.format('ddd')}, {tomorrow.format('MMM D')} JST\n"
    if len(en_text_tomorrow) == 0:
        en_text_tomorrow = en_header_tomorrow + "None\n\n"
    else:
        en_text_tomorrow = en_header_tomorrow + en_text_tomorrow

    en_tweets = split_text_for_tweets(en_text_today, en_header_today, en_text_tomorrow, en_header_tomorrow)
    for t in en_tweets:
        print(f"=====================\n{t}\n=====================\n")

    if debug:
        return 0

    # Get language setting from environment variable
    tweet_language = os.environ.get('TWEET_LANGUAGE', 'both')
    print(f"Tweet language setting: {tweet_language}")

    # Set up OAuth1 authentication for Japanese account
    ja_auth = None
    if tweet_language in ['both', 'japanese']:
        ja_auth = OAuth1(
            os.environ["JA_CONSUMER_KEY"],
            os.environ["JA_CONSUMER_SECRET"],
            os.environ["JA_ACCESS_TOKEN"],
            os.environ["JA_ACCESS_TOKEN_SECRET"]
        )

    # Set up OAuth1 authentication for English account
    en_auth = None
    if tweet_language in ['both', 'english']:
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
        if ja_auth is not None:
            for t in ja_tweets:
                try:
                    result = create_tweet_with_playwright(browser, ja_auth, t)
                    tweet_id = result["data"]["id"]
                    print(f"Successfully posted Japanese tweet (ID: {tweet_id})")
                except Exception as e:
                    print(f"Failed to tweet: {e}")
                    print(f"Tweet text: {t}")
                    tweet_failed = True
                    break

        # Post English tweets
        if en_auth is not None:
            for t in en_tweets:
                try:
                    result = create_tweet_with_playwright(browser, en_auth, t)
                    tweet_id = result["data"]["id"]
                    print(f"Successfully posted English tweet (ID: {tweet_id})")
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
