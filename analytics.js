const database = require('./database');
const logger = require('./logger');

class SentimentAnalytics {
  constructor() {
    this.trends = new Map();
  }

  async calculateHourlyTrends() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          strftime('%Y-%m-%d %H:00:00', created_at) as hour,
          COUNT(*) as tweet_count,
          AVG(sentiment_score) as avg_sentiment,
          SUM(CASE WHEN sentiment_label = 'positive' THEN 1 ELSE 0 END) as positive_count,
          SUM(CASE WHEN sentiment_label = 'negative' THEN 1 ELSE 0 END) as negative_count,
          SUM(CASE WHEN sentiment_label = 'neutral' THEN 1 ELSE 0 END) as neutral_count
        FROM tweets 
        WHERE created_at >= datetime('now', '-24 hours')
        GROUP BY hour 
        ORDER BY hour DESC
      `;

      database.db.all(query, (err, rows) => {
        if (err) {
          logger.error('Error calculating hourly trends', { error: err.message });
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async detectSentimentSpikes(threshold = 0.5) {
    try {
      const hourlyData = await this.calculateHourlyTrends();
      
      if (hourlyData.length < 2) {
        return [];
      }

      const spikes = [];
      
      for (let i = 1; i < hourlyData.length; i++) {
        const current = hourlyData[i];
        const previous = hourlyData[i - 1];
        
        const sentimentChange = current.avg_sentiment - previous.avg_sentiment;
        const volumeChange = current.tweet_count - previous.tweet_count;
        
        if (Math.abs(sentimentChange) > threshold && volumeChange > 0) {
          spikes.push({
            hour: current.hour,
            sentimentChange,
            volumeChange,
            avgSentiment: current.avg_sentiment,
            tweetCount: current.tweet_count,
            type: sentimentChange > 0 ? 'positive_spike' : 'negative_spike'
          });
        }
      }
      
      return spikes;
    } catch (error) {
      logger.error('Error detecting sentiment spikes', { error: error.message });
      return [];
    }
  }

  async generateTrendReport() {
    try {
      const [hourlyTrends, spikes] = await Promise.all([
        this.calculateHourlyTrends(),
        this.detectSentimentSpikes()
      ]);

      const report = {
        generatedAt: new Date().toISOString(),
        summary: {
          totalHours: hourlyTrends.length,
          totalTweets: hourlyTrends.reduce((sum, h) => sum + h.tweet_count, 0),
          avgSentiment: hourlyTrends.reduce((sum, h) => sum + h.avg_sentiment, 0) / hourlyTrends.length,
          spikesDetected: spikes.length
        },
        hourlyTrends: hourlyTrends.slice(0, 12), // Last 12 hours
        sentimentSpikes: spikes,
        recommendations: this.generateRecommendations(hourlyTrends, spikes)
      };

      return report;
    } catch (error) {
      logger.error('Error generating trend report', { error: error.message });
      return null;
    }
  }

  generateRecommendations(trends, spikes) {
    const recommendations = [];

    if (trends.length > 0) {
      const latestTrend = trends[0];
      const avgSentiment = trends.reduce((sum, h) => sum + h.avg_sentiment, 0) / trends.length;

      if (latestTrend.avg_sentiment < avgSentiment - 0.3) {
        recommendations.push({
          type: 'alert',
          message: 'Recent sentiment is significantly lower than average. Consider investigating negative drivers.'
        });
      }

      if (latestTrend.tweet_count > 20) {
        recommendations.push({
          type: 'info',
          message: 'High tweet volume detected. Good engagement period.'
        });
      }
    }

    if (spikes.length > 3) {
      recommendations.push({
        type: 'warning',
        message: 'Multiple sentiment spikes detected. Check for trending topics or events.'
      });
    }

    const positiveSpikes = spikes.filter(s => s.type === 'positive_spike').length;
    const negativeSpikes = spikes.filter(s => s.type === 'negative_spike').length;

    if (negativeSpikes > positiveSpikes) {
      recommendations.push({
        type: 'action',
        message: 'More negative sentiment spikes than positive. Consider adjusting reply strategy.'
      });
    }

    return recommendations;
  }

  async getTopKeywords(limit = 10) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          sentiment_label,
          COUNT(*) as count,
          GROUP_CONCAT(SUBSTR(text, 1, 50)) as sample_texts
        FROM tweets 
        WHERE created_at >= datetime('now', '-7 days')
        GROUP BY sentiment_label
        ORDER BY count DESC
        LIMIT ?
      `;

      database.db.all(query, [limit], (err, rows) => {
        if (err) {
          logger.error('Error getting top keywords', { error: err.message });
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }
}

module.exports = new SentimentAnalytics();