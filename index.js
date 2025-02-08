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

  async start() {
    console.log('Tweet Sentiment Bot starting...');
    
    // For now, just log that we're ready
    // TODO: Implement actual tweet monitoring and response logic
    console.log('Bot is ready to analyze tweets!');
  }
}

const bot = new TweetSentimentBot();
bot.start().catch(console.error);