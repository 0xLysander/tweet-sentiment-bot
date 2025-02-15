require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');
const SentimentAnalyzer = require('./sentiment');
const logger = require('./logger');

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
      logger.debug('Sentiment analysis completed', { text: tweetText, sentiment });
      return sentiment;
    } catch (error) {
      logger.error('Error analyzing sentiment', { error: error.message, text: tweetText });
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
      logger.info('Replied to tweet with sentiment analysis', { tweetId, replyText });
    } catch (error) {
      logger.error('Error replying to tweet', { error: error.message, tweetId });
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
      logger.info('Stream rules updated successfully');
    } catch (error) {
      logger.error('Error setting up stream rules', { error: error.message });
    }
  }

  async startStream() {
    const stream = await this.rwClient.v2.searchStream({
      'tweet.fields': ['author_id', 'public_metrics', 'context_annotations'],
      'user.fields': ['username']
    });

    stream.on('data', async (tweet) => {
      const username = tweet.includes?.users?.[0]?.username || 'unknown';
      logger.info('New tweet received', { 
        username, 
        tweetId: tweet.data.id, 
        text: tweet.data.text 
      });
      
      const sentiment = await this.analyzeTweet(tweet.data.text);
      if (sentiment) {
        logger.info('Tweet sentiment analyzed', { 
          tweetId: tweet.data.id, 
          sentiment: sentiment.label, 
          score: sentiment.score 
        });
        
        await this.replyWithSentiment(tweet.data.id, sentiment);
      }
    });

    stream.on('error', (error) => {
      logger.error('Stream error occurred', { error: error.message });
    });
  }

  async start() {
    logger.info('Tweet Sentiment Bot starting...');
    
    try {
      await this.setupStreamRules();
      await this.startStream();
      
      logger.info('Bot is now monitoring tweets for sentiment analysis!');
    } catch (error) {
      logger.error('Failed to start bot', { error: error.message });
      throw error;
    }
  }
}

const bot = new TweetSentimentBot();
bot.start().catch(console.error);