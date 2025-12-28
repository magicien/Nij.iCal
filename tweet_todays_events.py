import arrow
import os
import sys
import tweepy
from twitter_text import parse_tweet
from nijical import NijiCal
from settings import debug, url_prefix

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

    try:
        ja_client = tweepy.Client(
            bearer_token=os.environ["JA_BEARER_TOKEN"],
            consumer_key=os.environ["JA_CONSUMER_KEY"],
            consumer_secret=os.environ["JA_CONSUMER_SECRET"],
            access_token=os.environ["JA_ACCESS_TOKEN"],
            access_token_secret=os.environ["JA_ACCESS_TOKEN_SECRET"]
        )
    except Exception as e:
        print(f"Failed to create tweepy ja client: {e}")
        return 1

    try:
        en_client = tweepy.Client(
            bearer_token=os.environ["EN_BEARER_TOKEN"],
            consumer_key=os.environ["EN_CONSUMER_KEY"],
            consumer_secret=os.environ["EN_CONSUMER_SECRET"],
            access_token=os.environ["EN_ACCESS_TOKEN"],
            access_token_secret=os.environ["EN_ACCESS_TOKEN_SECRET"]
        )
    except Exception as e:
        print(f"Failed to create tweepy en client: {e}")
        return 2
    
    reply_id: str | None = None
    for t in ja_tweets:
        try:
            if reply_id is None:
                result = ja_client.create_tweet(text=t)
            else:
                result = ja_client.create_tweet(text=t, in_reply_to_tweet_id=reply_id)

            if len(result.errors) > 0:
                print(f"Failed to tweet: {result.errors}")
                break

            reply_id = result.data["id"]
        except tweepy.errors.Forbidden as e:
            print(f"Failed to tweet (403 Forbidden): {e}")
            print(f"Tweet text: {t}")
            break
        except tweepy.errors.TweepyException as e:
            print(f"Failed to tweet (TweepyException): {e}")
            print(f"Tweet text: {t}")
            break

    reply_id = None
    for t in en_tweets:
        try:
            if reply_id is None:
                result = en_client.create_tweet(text=t)
            else:
                result = en_client.create_tweet(text=t, in_reply_to_tweet_id=reply_id)

            if len(result.errors) > 0:
                print(f"Failed to tweet: {result.errors}")
                break

            reply_id = result.data["id"]
        except tweepy.errors.Forbidden as e:
            print(f"Failed to tweet (403 Forbidden): {e}")
            print(f"Tweet text: {t}")
            break
        except tweepy.errors.TweepyException as e:
            print(f"Failed to tweet (TweepyException): {e}")
            print(f"Tweet text: {t}")
            break

    return 0

if __name__ == "__main__":
    sys.exit(main())
