import arrow
import os
import sys
import tweepy

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
        return 2

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
        return 3
    
    print(ja_text)
    result = ja_client.create_tweet(text=ja_text)
    if len(result.errors) > 0:
        print(f"Failed to tweet: {result.errors}")

    print(en_text)
    result = en_client.create_tweet(text=en_text)
    if len(result.errors) > 0:
        print(f"Failed to tweet: {result.errors}")

    return 0

if __name__ == "__main__":
    sys.exit(main())
