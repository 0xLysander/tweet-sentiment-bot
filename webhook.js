const express = require('express');
const logger = require('./logger');
const database = require('./database');
const analytics = require('./analytics');

class WebhookServer {
  constructor(port = 3000) {
    this.app = express();
    this.port = port;
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // Basic logging middleware
    this.app.use((req, res, next) => {
      logger.info('Webhook request received', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // Get current statistics
    this.app.get('/api/stats', async (req, res) => {
      try {
        const days = parseInt(req.query.days) || 7;
        const analyticsData = await database.getRecentAnalytics(days);
        
        const stats = {
          totalDays: analyticsData.length,
          totalTweets: analyticsData.reduce((sum, day) => sum + day.total_tweets, 0),
          totalReplies: analyticsData.reduce((sum, day) => sum + day.replies_sent, 0),
          avgSentiment: analyticsData.reduce((sum, day) => sum + (day.avg_sentiment || 0), 0) / analyticsData.length,
          breakdown: {
            positive: analyticsData.reduce((sum, day) => sum + day.positive_count, 0),
            negative: analyticsData.reduce((sum, day) => sum + day.negative_count, 0),
            neutral: analyticsData.reduce((sum, day) => sum + day.neutral_count, 0)
          },
          dailyData: analyticsData
        };

        res.json(stats);
      } catch (error) {
        logger.error('Error fetching stats via webhook', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch statistics' });
      }
    });

    // Get sentiment trends
    this.app.get('/api/trends', async (req, res) => {
      try {
        const report = await analytics.generateTrendReport();
        if (!report) {
          return res.status(404).json({ error: 'No trend data available' });
        }
        
        res.json(report);
      } catch (error) {
        logger.error('Error fetching trends via webhook', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch trends' });
      }
    });

    // Webhook for external notifications
    this.app.post('/webhook/notification', (req, res) => {
      try {
        const { type, message, data } = req.body;
        
        logger.info('External notification received', {
          type: type,
          message: message,
          data: data
        });

        // Here you could trigger specific actions based on notification type
        switch (type) {
          case 'sentiment_alert':
            this.handleSentimentAlert(data);
            break;
          case 'volume_spike':
            this.handleVolumeSpike(data);
            break;
          default:
            logger.warn('Unknown notification type', { type });
        }

        res.json({ status: 'received', timestamp: new Date().toISOString() });
      } catch (error) {
        logger.error('Error processing webhook notification', { error: error.message });
        res.status(500).json({ error: 'Failed to process notification' });
      }
    });

    // Manual trigger for analytics update
    this.app.post('/api/update-analytics', async (req, res) => {
      try {
        await database.updateDailyAnalytics();
        logger.info('Analytics manually updated via webhook');
        res.json({ status: 'success', message: 'Analytics updated' });
      } catch (error) {
        logger.error('Error updating analytics via webhook', { error: error.message });
        res.status(500).json({ error: 'Failed to update analytics' });
      }
    });

    // Get recent tweets with sentiment
    this.app.get('/api/recent-tweets', (req, res) => {
      const limit = parseInt(req.query.limit) || 50;
      const query = `
        SELECT id, username, text, sentiment_score, sentiment_label, replied, created_at
        FROM tweets 
        ORDER BY created_at DESC 
        LIMIT ?
      `;

      database.db.all(query, [limit], (err, rows) => {
        if (err) {
          logger.error('Error fetching recent tweets', { error: err.message });
          return res.status(500).json({ error: 'Failed to fetch tweets' });
        }
        
        res.json({
          tweets: rows,
          count: rows.length,
          timestamp: new Date().toISOString()
        });
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        availableEndpoints: [
          'GET /health',
          'GET /api/stats',
          'GET /api/trends', 
          'GET /api/recent-tweets',
          'POST /webhook/notification',
          'POST /api/update-analytics'
        ]
      });
    });
  }

  handleSentimentAlert(data) {
    logger.warn('Sentiment alert triggered', { data });
    // Could implement email notifications, Slack alerts, etc.
  }

  handleVolumeSpike(data) {
    logger.info('Volume spike detected', { data });
    // Could adjust bot behavior, increase monitoring, etc.
  }

  start() {
    return new Promise((resolve, reject) => {
      const server = this.app.listen(this.port, (err) => {
        if (err) {
          logger.error('Failed to start webhook server', { error: err.message });
          reject(err);
        } else {
          logger.info('Webhook server started', { port: this.port });
          resolve(server);
        }
      });
    });
  }
}

module.exports = WebhookServer;