require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');
const SentimentAnalyzer = require('./sentiment');

class TweetSentimentBot {
  constructor() {
    this.client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
    });

    this.sentimentAnalyzer = new SentimentAnalyzer();
    this.rwClient = this.client.readWrite;
  }

  async analyzeTweet(tweetText) {
    try {
      const sentiment = this.sentimentAnalyzer.analyze(tweetText);
      return sentiment;
    } catch (error) {
      console.error('Error analyzing sentiment:', error);
      return null;
    }
  }

  async replyWithSentiment(tweetId, sentiment) {
    try {
      const emoji = this.sentimentAnalyzer.getSentimentEmoji(sentiment.label);
      let replyText;

      if (sentiment.label === 'positive') {
        replyText = `${emoji} This tweet has a positive sentiment! (Score: ${sentiment.score})`;
      } else if (sentiment.label === 'negative') {
        replyText = `${emoji} This tweet has a negative sentiment. (Score: ${sentiment.score})`;
      } else {
        replyText = `${emoji} This tweet has a neutral sentiment. (Score: ${sentiment.score})`;
      }

      await this.rwClient.v2.reply(replyText, tweetId);
      console.log(`Replied to tweet ${tweetId} with sentiment analysis`);
    } catch (error) {
      console.error('Error replying to tweet:', error);
    }
  }

  async setupStreamRules() {
    const rules = [
      {
        value: 'sentiment analysis OR #sentiment OR mood OR feeling',
        tag: 'sentiment-related'
      }
    ];

    try {
      const existingRules = await this.rwClient.v2.streamRules();
      if (existingRules.data?.length) {
        await this.rwClient.v2.updateStreamRules({
          delete: { ids: existingRules.data.map(rule => rule.id) }
        });
      }

      await this.rwClient.v2.updateStreamRules({
        add: rules
      });
      console.log('Stream rules updated successfully');
    } catch (error) {
      console.error('Error setting up stream rules:', error);
    }
  }

  async startStream() {
    const stream = await this.rwClient.v2.searchStream({
      'tweet.fields': ['author_id', 'public_metrics', 'context_annotations'],
      'user.fields': ['username']
    });

    stream.on('data', async (tweet) => {
      console.log(`New tweet from @${tweet.includes?.users?.[0]?.username}: ${tweet.data.text}`);
      
      const sentiment = await this.analyzeTweet(tweet.data.text);
      if (sentiment) {
        console.log(`Sentiment: ${sentiment.label} (score: ${sentiment.score})`);
        
        // Reply with sentiment analysis
        await this.replyWithSentiment(tweet.data.id, sentiment);
      }
    });

    stream.on('error', (error) => {
      console.error('Stream error:', error);
    });
  }

  async start() {
    console.log('Tweet Sentiment Bot starting...');
    
    await this.setupStreamRules();
    await this.startStream();
    
    console.log('Bot is now monitoring tweets for sentiment analysis!');
  }
}

const bot = new TweetSentimentBot();
bot.start().catch(console.error);