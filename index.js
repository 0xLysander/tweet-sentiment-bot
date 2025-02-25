require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');
const SentimentAnalyzer = require('./sentiment');
const logger = require('./logger');
const config = require('./config');
const database = require('./database');

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
    this.replyCount = 0;
    this.lastResetTime = Date.now();
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

  shouldReply(sentiment) {
    // Check sentiment threshold
    const absScore = Math.abs(sentiment.score);
    if (absScore < config.behavior.minSentimentThreshold) {
      return false;
    }

    // Check reply probability
    if (Math.random() > config.behavior.replyProbability) {
      return false;
    }

    // Check rate limiting
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    if (now - this.lastResetTime > oneHour) {
      this.replyCount = 0;
      this.lastResetTime = now;
    }

    if (this.replyCount >= config.behavior.maxRepliesPerHour) {
      return false;
    }

    return true;
  }

  getReplyText(sentiment) {
    const templates = config.replyTemplates[sentiment.label];
    const template = templates[Math.floor(Math.random() * templates.length)];
    return template.replace('{score}', sentiment.score);
  }

  async replyWithSentiment(tweetId, sentiment) {
    try {
      if (!this.shouldReply(sentiment)) {
        logger.debug('Skipping reply due to filters', { tweetId, sentiment: sentiment.label });
        return false;
      }

      const replyText = this.getReplyText(sentiment);
      this.lastReplyText = replyText;
      
      await this.rwClient.v2.reply(replyText, tweetId);
      this.replyCount++;
      
      logger.info('Replied to tweet with sentiment analysis', { 
        tweetId, 
        replyText, 
        replyCount: this.replyCount 
      });
      
      return true;
    } catch (error) {
      logger.error('Error replying to tweet', { error: error.message, tweetId });
      return false;
    }
  }

  async setupStreamRules() {
    const rules = config.streamRules;

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
        
        const replied = await this.replyWithSentiment(tweet.data.id, sentiment);
        
        // Save to database
        await database.saveTweet({
          id: tweet.data.id,
          authorId: tweet.data.author_id,
          username: username,
          text: tweet.data.text,
          sentimentScore: sentiment.score,
          sentimentLabel: sentiment.label,
          replied: replied,
          replyText: replied ? this.lastReplyText : null
        });
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

// Only start if this file is run directly
if (require.main === module) {
  const bot = new TweetSentimentBot();
  bot.start().catch(console.error);
}

module.exports = TweetSentimentBot;