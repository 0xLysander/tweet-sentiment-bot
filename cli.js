#!/usr/bin/env node

const { program } = require('commander');
const database = require('./database');
const logger = require('./logger');
const analytics = require('./analytics');
const TweetSentimentBot = require('./index');

program
  .name('tweet-sentiment-bot')
  .description('CLI for Twitter Sentiment Analysis Bot')
  .version('1.0.0');

program
  .command('start')
  .description('Start the sentiment bot')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(async (options) => {
    if (options.verbose) {
      logger.info('Starting bot in verbose mode');
    }
    
    const bot = new TweetSentimentBot();
    try {
      await bot.start();
    } catch (error) {
      logger.error('Failed to start bot', { error: error.message });
      process.exit(1);
    }
  });

program
  .command('stats')
  .description('Show bot statistics')
  .option('-d, --days <number>', 'Number of days to analyze', '7')
  .action(async (options) => {
    try {
      const days = parseInt(options.days);
      const analytics = await database.getRecentAnalytics(days);
      
      console.log(`\n📊 Bot Statistics (Last ${days} days)`);
      console.log('─'.repeat(50));
      
      if (analytics.length === 0) {
        console.log('No data available yet.');
        return;
      }

      let totalTweets = 0;
      let totalReplies = 0;
      let totalPositive = 0;
      let totalNegative = 0;
      let totalNeutral = 0;

      analytics.forEach(day => {
        totalTweets += day.total_tweets;
        totalReplies += day.replies_sent;
        totalPositive += day.positive_count;
        totalNegative += day.negative_count;
        totalNeutral += day.neutral_count;
        
        console.log(`${day.date}: ${day.total_tweets} tweets (${day.replies_sent} replies)`);
      });

      console.log('─'.repeat(50));
      console.log(`Total Tweets Analyzed: ${totalTweets}`);
      console.log(`Total Replies Sent: ${totalReplies}`);
      console.log(`Positive: ${totalPositive} (${((totalPositive/totalTweets)*100).toFixed(1)}%)`);
      console.log(`Negative: ${totalNegative} (${((totalNegative/totalTweets)*100).toFixed(1)}%)`);
      console.log(`Neutral: ${totalNeutral} (${((totalNeutral/totalTweets)*100).toFixed(1)}%)`);
      console.log(`Reply Rate: ${((totalReplies/totalTweets)*100).toFixed(1)}%`);
      
    } catch (error) {
      logger.error('Error fetching statistics', { error: error.message });
      console.error('Failed to fetch statistics:', error.message);
    }
  });

program
  .command('update-analytics')
  .description('Update daily analytics manually')
  .action(async () => {
    try {
      await database.updateDailyAnalytics();
      console.log('✅ Daily analytics updated successfully');
    } catch (error) {
      logger.error('Error updating analytics', { error: error.message });
      console.error('Failed to update analytics:', error.message);
    }
  });

program
  .command('trends')
  .description('Show sentiment trends and analysis')
  .action(async () => {
    try {
      console.log('\n📈 Generating trend report...');
      const report = await analytics.generateTrendReport();
      
      if (!report) {
        console.log('No trend data available.');
        return;
      }

      console.log('\n📊 Sentiment Trends Report');
      console.log('─'.repeat(50));
      console.log(`Generated: ${new Date(report.generatedAt).toLocaleString()}`);
      console.log(`Total Tweets (24h): ${report.summary.totalTweets}`);
      console.log(`Average Sentiment: ${report.summary.avgSentiment.toFixed(2)}`);
      console.log(`Sentiment Spikes: ${report.summary.spikesDetected}`);

      if (report.hourlyTrends.length > 0) {
        console.log('\n🕐 Recent Hourly Activity:');
        report.hourlyTrends.slice(0, 5).forEach(trend => {
          const hour = new Date(trend.hour).toLocaleString();
          console.log(`  ${hour}: ${trend.tweet_count} tweets (avg: ${trend.avg_sentiment.toFixed(2)})`);
        });
      }

      if (report.sentimentSpikes.length > 0) {
        console.log('\n📈 Recent Sentiment Spikes:');
        report.sentimentSpikes.slice(0, 3).forEach(spike => {
          const type = spike.type === 'positive_spike' ? '📈' : '📉';
          console.log(`  ${type} ${spike.hour}: ${spike.sentimentChange.toFixed(2)} change`);
        });
      }

      if (report.recommendations.length > 0) {
        console.log('\n💡 Recommendations:');
        report.recommendations.forEach(rec => {
          const icon = rec.type === 'alert' ? '🚨' : rec.type === 'warning' ? '⚠️' : '💡';
          console.log(`  ${icon} ${rec.message}`);
        });
      }
      
    } catch (error) {
      logger.error('Error generating trends', { error: error.message });
      console.error('Failed to generate trends:', error.message);
    }
  });

program
  .command('config')
  .description('Show current configuration')
  .action(() => {
    const config = require('./config');
    console.log('\n⚙️  Current Configuration');
    console.log('─'.repeat(30));
    console.log('Stream Rules:');
    config.streamRules.forEach((rule, index) => {
      console.log(`  ${index + 1}. ${rule.value} (${rule.tag})`);
    });
    console.log(`\nBehavior:`);
    console.log(`  Reply Probability: ${config.behavior.replyProbability * 100}%`);
    console.log(`  Min Sentiment Threshold: ${config.behavior.minSentimentThreshold}`);
    console.log(`  Max Replies Per Hour: ${config.behavior.maxRepliesPerHour}`);
  });

program.parse(process.argv);